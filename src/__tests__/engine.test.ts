import { beforeEach, describe, expect, it } from 'vitest';

import { AsyntaiError } from 'src/asyntai/api';
import {
  BACKFILL_DAYS,
  LAST_RUN_KEY,
  MAX_ATTEMPTS,
  LEAD_LOOKBACK_MS,
  MAX_NEW_LEADS_PER_RUN,
  runSync,
  sessionKey,
} from 'src/sync/engine';
import type { SyncedSession } from 'src/sync/types';

import { FakeAsyntai, FakeCrm, MapKv } from './fakes';

const NOW = new Date('2026-10-11T12:00:00Z');
const LATER = new Date('2026-10-11T12:05:00Z');

let asyntai: FakeAsyntai;
let crm: FakeCrm;
let kv: MapKv;

const sync = (now = NOW) => runSync({ asyntai, crm, kv, now });

beforeEach(() => {
  asyntai = new FakeAsyntai();
  crm = new FakeCrm();
  kv = new MapKv();
});

describe('first run', () => {
  it('looks 30 days back and turns every lead into a person with a note', async () => {
    asyntai.addLead({ session_id: 's1', email: 'jane.doe@example.com', started_at: '2026-10-10T09:00:00+00:00' }, [
      ['Do you ship to Spain?', 'Yes, in 3 days.'],
    ]);
    asyntai.addLead({ session_id: 's2', phone: '+420 777 123 456', started_at: '2026-10-11T09:00:00+00:00' }, [
      ['Call me back', 'Sure, a colleague will call you.'],
    ]);

    const result = await sync();

    expect(asyntai.leadCalls[0].getTime()).toBe(NOW.getTime() - BACKFILL_DAYS * 86_400_000);
    expect(result).toMatchObject({ leadsSeen: 2, peopleCreated: 2, notesCreated: 2, failed: 0, complete: true });

    const people = [...crm.people.values()];
    expect(people.map((p) => `${p.firstName} ${p.lastName}`.trim())).toEqual([
      'Jane Doe',
      'Website visitor +420 777 123 456',
    ]);
    expect(people[0]).toMatchObject({ email: 'jane.doe@example.com', chats: 1, chatPage: 'https://example.com/' });
    expect(people[0].lastChatAt).toBe('2026-10-10T09:00:00.000Z');

    const notes = [...crm.notes.values()];
    expect(notes[0].title).toBe('Website chat on example.com (2026-10-10)');
    expect(notes[0].markdown).toContain('**Visitor:** Do you ship to Spain?');
    expect(notes[0].markdown).toContain('**AI chatbot:** Yes, in 3 days.');

    expect(await kv.get(LAST_RUN_KEY)).toBe(NOW.toISOString());
    const stored = await kv.get<SyncedSession>(sessionKey('s1'));
    expect(stored).toMatchObject({ personId: people[0].id, messageCount: 2 });
  });

  it('skips leads without an email address or a phone number', async () => {
    asyntai.addLead({ session_id: 's1' });
    const result = await sync();
    expect(result.peopleCreated).toBe(0);
    expect(crm.notes.size).toBe(0);
  });
});

describe('matching people', () => {
  it('adds the chat to a person who is already in Twenty', async () => {
    const existing = crm.addPerson({ firstName: 'Jane', lastName: 'Existing', email: 'Jane@Example.com' });
    asyntai.addLead({ session_id: 's1', email: 'jane@example.com' }, [['Hi', 'Hello']]);

    const result = await sync();

    expect(result).toMatchObject({ peopleCreated: 0, peopleMatched: 1, notesCreated: 1 });
    expect(crm.people.size).toBe(1);
    expect([...crm.notes.values()][0].personId).toBe(existing);
    expect(crm.people.get(existing)?.firstName).toBe('Jane');
  });

  it('puts two chats of one visitor on one person', async () => {
    asyntai.addLead({ session_id: 's1', email: 'jane@example.com', started_at: '2026-10-09T09:00:00+00:00' }, [['A', 'B']]);
    asyntai.addLead({ session_id: 's2', email: 'jane@example.com', started_at: '2026-10-11T09:00:00+00:00' }, [['C', 'D']]);

    const result = await sync();

    expect(result).toMatchObject({ peopleCreated: 1, peopleMatched: 1, notesCreated: 2 });
    const person = [...crm.people.values()][0];
    expect(person.chats).toBe(2);
    expect(person.lastChatAt).toBe('2026-10-11T09:00:00.000Z');
  });

  it('matches a phone-only visitor by phone number', async () => {
    const existing = crm.addPerson({ firstName: 'Petr', phone: '+420777123456' });
    asyntai.addLead({ session_id: 's1', phone: '+420 777 123 456' }, [['A', 'B']]);

    await sync();

    expect(crm.people.size).toBe(1);
    expect([...crm.notes.values()][0].personId).toBe(existing);
  });
});

describe('later runs', () => {
  it('never adds a lead twice and looks back two days for late leads', async () => {
    asyntai.addLead({ session_id: 's1', email: 'jane@example.com', started_at: '2026-10-11T09:00:00+00:00' }, [['A', 'B']]);
    await sync(NOW);
    const second = await sync(LATER);

    expect(second).toMatchObject({ peopleCreated: 0, notesCreated: 0, notesUpdated: 0 });
    expect(crm.notes.size).toBe(1);
    expect(asyntai.leadCalls[1].getTime()).toBe(NOW.getTime() - LEAD_LOOKBACK_MS);
  });

  it('brings in a lead whose chat started before the last run', async () => {
    await sync(NOW);
    // The chat started an hour before the first run; the visitor left the
    // address only after it.
    asyntai.addLead({ session_id: 'late', email: 'late@example.com', started_at: '2026-10-11T11:00:00+00:00' }, [['A', 'B']]);

    const result = await sync(LATER);

    expect(result.peopleCreated).toBe(1);
  });

  it('updates the note when the conversation goes on', async () => {
    asyntai.addLead({ session_id: 's1', email: 'jane@example.com', started_at: '2026-10-11T09:00:00+00:00' }, [['First question', 'First answer']]);
    await sync(NOW);
    const noteId = [...crm.notes.keys()][0];

    asyntai.messages.get('s1')?.push(
      { role: 'user', content: 'Second question', timestamp: '2026-10-11T12:03:00+00:00' },
      { role: 'assistant', content: 'Second answer', timestamp: '2026-10-11T12:03:00+00:00', sender_type: 'ai' },
    );
    asyntai.sessions.push({
      session_id: 's1',
      message_count: 2,
      first_message_at: '2026-10-11T09:00:00+00:00',
      last_message_at: '2026-10-11T12:03:00+00:00',
      page_url: 'https://example.com/checkout',
      country: null,
      website_domain: 'example.com',
    });

    const result = await sync(LATER);

    expect(result).toMatchObject({ notesCreated: 0, notesUpdated: 1 });
    expect(crm.notes.size).toBe(1);
    expect(crm.notes.get(noteId)?.markdown).toContain('Second answer');
    const person = [...crm.people.values()][0];
    expect(person.chats).toBe(1);
    expect(person.lastChatAt).toBe('2026-10-11T12:03:00.000Z');
    expect(person.chatPage).toBe('https://example.com/checkout');

    // Nothing new: the note is left alone.
    const third = await sync(new Date('2026-10-11T12:10:00Z'));
    expect(third.notesUpdated).toBe(0);
  });

  it('puts the conversation back when someone deleted its note', async () => {
    asyntai.addLead({ session_id: 's1', email: 'jane@example.com', started_at: '2026-10-11T09:00:00+00:00' }, [['A', 'B']]);
    await sync(NOW);
    crm.notes.clear();
    asyntai.sessions.push({
      session_id: 's1',
      message_count: 2,
      first_message_at: null,
      last_message_at: '2026-10-11T12:04:00+00:00',
      page_url: null,
      country: null,
      website_domain: null,
    });
    asyntai.messages.get('s1')?.push({ role: 'user', content: 'More', timestamp: '2026-10-11T12:04:00+00:00' });

    await sync(LATER);

    expect(crm.notes.size).toBe(1);
    const stored = await kv.get<SyncedSession>(sessionKey('s1'));
    expect(crm.notes.has(stored?.noteId ?? '')).toBe(true);
  });
});

describe('failures', () => {
  it('stops on a refused API key and keeps the cursor', async () => {
    asyntai.failWith = new AsyntaiError('Invalid API key', 401);
    await expect(sync()).rejects.toThrow('Invalid API key');
    expect(await kv.get(LAST_RUN_KEY)).toBeNull();
  });

  it('records one failed lead and carries on with the others', async () => {
    asyntai.addLead({ session_id: 'bad', email: 'a@example.com', started_at: '2026-10-11T08:00:00+00:00' }, [['BREAK-ME', 'x']]);
    asyntai.addLead({ session_id: 'good', email: 'b@example.com', started_at: '2026-10-11T09:00:00+00:00' }, [['fine', 'y']]);
    crm.failCreateNoteFor = 'BREAK-ME';

    const result = await sync();

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain('bad: Twenty is down');
    expect(result.notesCreated).toBe(1);
    expect(await kv.get(sessionKey('bad'))).toBeNull();
    expect(await kv.get(sessionKey('good'))).not.toBeNull();

    // Twenty is back: the next run picks the failed lead up.
    crm.failCreateNoteFor = null;
    const next = await sync(LATER);
    expect(next.notesCreated).toBe(1);
  });

  it('never adds a second note when Twenty refuses the person update', async () => {
    asyntai.addLead({ session_id: 's1', email: 'a@example.com', page_url: 'about:srcdoc' }, [['q', 'a']]);
    crm.failUpdatePersonChat = true;

    const first = await sync(NOW);
    expect(first).toMatchObject({ notesCreated: 1, failed: 1 });

    crm.failUpdatePersonChat = false;
    const second = await sync(LATER);
    expect(second.notesCreated).toBe(0);
    expect(crm.notes.size).toBe(1);
  });

  it('tries an old failed lead again on later runs, then gives up', async () => {
    // Started weeks ago: only the first, 30-day run sees it in the leads list.
    asyntai.addLead({ session_id: 'old', email: 'old@example.com', started_at: '2026-09-18T10:00:00+00:00' }, [['BREAK-ME', 'x']]);
    crm.failCreateNoteFor = 'BREAK-ME';

    await sync(NOW);
    for (let i = 1; i < MAX_ATTEMPTS; i += 1) {
      const run = await sync(new Date(NOW.getTime() + i * 300_000));
      expect(run.failed).toBe(1);
    }
    const last = await sync(new Date(NOW.getTime() + MAX_ATTEMPTS * 300_000));
    expect(last.failed).toBe(0);
    expect(crm.notes.size).toBe(0);
  });

  it('brings in an old failed lead once Twenty accepts it', async () => {
    asyntai.addLead({ session_id: 'old', email: 'old@example.com', started_at: '2026-09-18T10:00:00+00:00' }, [['BREAK-ME', 'x']]);
    crm.failCreateNoteFor = 'BREAK-ME';
    await sync(NOW);

    crm.failCreateNoteFor = null;
    const retry = await sync(LATER);
    expect(retry).toMatchObject({ notesCreated: 1, failed: 0 });

    const after = await sync(new Date(LATER.getTime() + 300_000));
    expect(after.notesCreated).toBe(0);
    expect(crm.notes.size).toBe(1);
  });

  it('spreads a large backlog over several runs', async () => {
    const total = MAX_NEW_LEADS_PER_RUN + 15;
    for (let i = 0; i < total; i += 1) {
      const minute = String(i % 60).padStart(2, '0');
      asyntai.addLead(
        { session_id: `s${i}`, email: `v${i}@example.com`, started_at: `2026-10-${10 + Math.floor(i / 60)}T09:${minute}:00+00:00` },
        [['q', 'a']],
      );
    }

    const first = await sync(NOW);
    expect(first).toMatchObject({ notesCreated: MAX_NEW_LEADS_PER_RUN, complete: false });
    expect(await kv.get(LAST_RUN_KEY)).toBeNull();

    const second = await sync(LATER);
    expect(second).toMatchObject({ notesCreated: 15, complete: true });
    expect(crm.notes.size).toBe(total);
    expect(crm.people.size).toBe(total);
  });
});
