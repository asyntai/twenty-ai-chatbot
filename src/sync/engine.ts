import {
  AsyntaiError,
  type AsyntaiClient,
  type AsyntaiLead,
  type AsyntaiMessage,
} from 'src/asyntai/api';
import { nameFromLead, noteTitle, transcriptMarkdown } from 'src/asyntai/format';
import type { CrmStore, KeyValueStore, SyncedSession } from 'src/sync/types';

export const LAST_RUN_KEY = 'sync:last-run';
export const RETRY_INDEX_KEY = 'retry:index';
export const sessionKey = (sessionId: string): string => `session:${sessionId}`;
export const retryKey = (sessionId: string): string => `retry:${sessionId}`;

// First run: bring in the leads of the last 30 days.
export const BACKFILL_DAYS = 30;
// A visitor often leaves an email address some time after the chat started,
// and the leads list is ordered by start time. Looking two days back catches
// those late leads; the key-value store makes sure none is added twice.
export const LEAD_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;
// Overlap between runs for conversations that received new messages.
export const SESSION_OVERLAP_MS = 10 * 60 * 1000;
// Work per run, so one run always ends well inside its time limit. A backlog
// continues on the next run.
export const MAX_NEW_LEADS_PER_RUN = 40;
export const MAX_UPDATES_PER_RUN = 40;
// A lead that fails is tried again on later runs, also when its chat is older
// than the lookback window, and given up after this many tries.
export const MAX_ATTEMPTS = 5;

type RetryEntry = { lead: AsyntaiLead; attempts: number };

export type SyncResult = {
  leadsSeen: number;
  peopleCreated: number;
  peopleMatched: number;
  notesCreated: number;
  notesUpdated: number;
  failed: number;
  complete: boolean;
  errors: string[];
};

type SyncDeps = {
  asyntai: Pick<AsyntaiClient, 'listLeads' | 'listSessions' | 'getMessages'>;
  crm: CrmStore;
  kv: KeyValueStore;
  now?: Date;
};

type LeadFacts = NonNullable<SyncedSession['lead']>;

// Latest message time as a UTC ISO string, or the fallback when there is none.
const latestTimestamp = (messages: AsyntaiMessage[], fallback: string | null): string | null => {
  let latest = fallback && !Number.isNaN(new Date(fallback).getTime()) ? new Date(fallback) : null;
  for (const message of messages) {
    const at = message.timestamp ? new Date(message.timestamp) : null;
    if (at && !Number.isNaN(at.getTime()) && (!latest || at > latest)) {
      latest = at;
    }
  }
  return latest ? latest.toISOString() : null;
};

const isAuthError = (error: unknown): boolean =>
  error instanceof AsyntaiError && (error.status === 401 || error.status === 403);

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const runSync = async ({ asyntai, crm, kv, now = new Date() }: SyncDeps): Promise<SyncResult> => {
  const result: SyncResult = {
    leadsSeen: 0,
    peopleCreated: 0,
    peopleMatched: 0,
    notesCreated: 0,
    notesUpdated: 0,
    failed: 0,
    complete: true,
    errors: [],
  };

  const lastRunIso = await kv.get<string>(LAST_RUN_KEY);
  const lastRun = lastRunIso ? new Date(lastRunIso) : null;
  const leadsSince = lastRun
    ? new Date(lastRun.getTime() - LEAD_LOOKBACK_MS)
    : new Date(now.getTime() - BACKFILL_DAYS * 24 * 60 * 60 * 1000);

  // Oldest first, so a person's first chat creates them and later chats add to them.
  const leads = (await asyntai.listLeads(leadsSince)).sort((a, b) =>
    (a.started_at ?? '').localeCompare(b.started_at ?? ''),
  );
  result.leadsSeen = leads.length;

  const seen = new Set<string>();
  let newLeads = 0;
  const retryLater: string[] = [];

  const recordFailure = async (lead: AsyntaiLead, attempts: number, error: unknown) => {
    result.failed += 1;
    if (attempts < MAX_ATTEMPTS) {
      const entry: RetryEntry = { lead, attempts };
      await kv.set(retryKey(lead.session_id), entry);
      retryLater.push(lead.session_id);
      result.errors.push(`${lead.session_id}: ${describe(error)}`);
    } else {
      result.errors.push(`${lead.session_id}: ${describe(error)} (gave up after ${attempts} tries)`);
    }
  };

  // Leads that failed on an earlier run come first.
  for (const sessionId of (await kv.get<string[]>(RETRY_INDEX_KEY)) ?? []) {
    if (seen.has(sessionId)) {
      continue;
    }
    seen.add(sessionId);
    const entry = await kv.get<RetryEntry>(retryKey(sessionId));
    if (!entry || (await kv.get<SyncedSession>(sessionKey(sessionId)))) {
      continue;
    }
    if (newLeads >= MAX_NEW_LEADS_PER_RUN) {
      retryLater.push(sessionId);
      continue;
    }
    newLeads += 1;
    try {
      await syncNewLead(entry.lead, { asyntai, crm, kv }, result);
    } catch (error) {
      if (isAuthError(error)) {
        throw error;
      }
      await recordFailure(entry.lead, entry.attempts + 1, error);
    }
  }

  for (const lead of leads) {
    if (!lead.session_id || seen.has(lead.session_id) || (!lead.email && !lead.phone)) {
      continue;
    }
    seen.add(lead.session_id);

    if (await kv.get<SyncedSession>(sessionKey(lead.session_id))) {
      continue;
    }
    if (newLeads >= MAX_NEW_LEADS_PER_RUN) {
      result.complete = false;
      break;
    }
    newLeads += 1;

    try {
      await syncNewLead(lead, { asyntai, crm, kv }, result);
    } catch (error) {
      if (isAuthError(error)) {
        throw error;
      }
      await recordFailure(lead, 1, error);
    }
  }
  await kv.set(RETRY_INDEX_KEY, retryLater);

  // Conversations that went on after their lead was brought in: refresh the note.
  if (lastRun) {
    const sessions = await asyntai.listSessions(new Date(lastRun.getTime() - SESSION_OVERLAP_MS));
    let updates = 0;

    for (const session of sessions) {
      const known = await kv.get<SyncedSession>(sessionKey(session.session_id));
      if (!known || !session.last_message_at) {
        continue;
      }
      if (known.lastMessageAt && new Date(session.last_message_at) <= new Date(known.lastMessageAt)) {
        continue;
      }
      if (updates >= MAX_UPDATES_PER_RUN) {
        result.complete = false;
        break;
      }
      updates += 1;

      try {
        await refreshSession(session.session_id, session.page_url, known, { asyntai, crm, kv }, result);
      } catch (error) {
        if (isAuthError(error)) {
          throw error;
        }
        result.failed += 1;
        result.errors.push(`${session.session_id}: ${describe(error)}`);
      }
    }
  }

  if (result.complete) {
    await kv.set(LAST_RUN_KEY, now.toISOString());
  }

  return result;
};

const findOrCreatePerson = async (
  lead: AsyntaiLead,
  crm: CrmStore,
  result: SyncResult,
): Promise<string> => {
  const email = (lead.email ?? '').trim();
  const phone = (lead.phone ?? '').trim();

  const existing =
    (email ? await crm.findPersonByEmail(email) : null) ??
    (phone ? await crm.findPersonByPhone(phone) : null);

  if (existing) {
    result.peopleMatched += 1;
    return existing;
  }

  const name = nameFromLead(lead);
  const created = await crm.createPerson({
    firstName: name.firstName,
    lastName: name.lastName,
    email: email || null,
    phone: phone || null,
  });
  result.peopleCreated += 1;

  return created;
};

const syncNewLead = async (
  lead: AsyntaiLead,
  { asyntai, crm, kv }: Omit<SyncDeps, 'now'>,
  result: SyncResult,
): Promise<void> => {
  const messages = await asyntai.getMessages(lead.session_id);
  const personId = await findOrCreatePerson(lead, crm, result);

  const noteId = await crm.createNote(personId, noteTitle(lead), transcriptMarkdown(lead, messages));
  result.notesCreated += 1;

  const lastMessageAt = latestTimestamp(messages, lead.started_at);
  const facts: LeadFacts = {
    email: lead.email,
    phone: lead.phone,
    page_url: lead.page_url,
    started_at: lead.started_at,
  };
  const stored: SyncedSession = {
    noteId,
    personId,
    messageCount: messages.length,
    lastMessageAt,
    lead: facts,
  };
  // Saved before anything else can fail: the note exists now, and a retry
  // must not add a second one.
  await kv.set(sessionKey(lead.session_id), stored);

  await crm.updatePersonChat(personId, {
    chatAt: lastMessageAt ?? new Date().toISOString(),
    chatPage: lead.page_url,
    newChat: true,
  });
};

const refreshSession = async (
  sessionId: string,
  pageUrl: string | null,
  known: SyncedSession,
  { asyntai, crm, kv }: Omit<SyncDeps, 'now'>,
  result: SyncResult,
): Promise<void> => {
  const messages = await asyntai.getMessages(sessionId);
  const lead: LeadFacts = known.lead ?? { email: null, phone: null, page_url: pageUrl, started_at: null };
  const title = noteTitle(lead);
  const markdown = transcriptMarkdown(lead, messages);

  let noteId = known.noteId;
  if (await crm.noteExists(noteId)) {
    await crm.updateNote(noteId, title, markdown);
  } else {
    // The note was deleted in Twenty: put the conversation back.
    noteId = await crm.createNote(known.personId, title, markdown);
  }
  result.notesUpdated += 1;

  const lastMessageAt = latestTimestamp(messages, known.lastMessageAt);
  if (lastMessageAt) {
    await crm.updatePersonChat(known.personId, {
      chatAt: lastMessageAt,
      chatPage: pageUrl ?? lead.page_url,
      newChat: false,
    });
  }

  const stored: SyncedSession = {
    ...known,
    noteId,
    messageCount: messages.length,
    lastMessageAt,
  };
  await kv.set(sessionKey(sessionId), stored);
};
