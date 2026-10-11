// Runs the real sync against a real Twenty server (the local one from
// `yarn twenty docker:start`). Asyntai is replaced by an in-memory fake, so
// the test shows exactly what lands in Twenty: people, fields, notes and the
// link between them.
import { CoreApiClient } from 'twenty-client-sdk/core';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { afterAll, describe, expect, it } from 'vitest';

import { APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { runSync } from 'src/sync/engine';
import { TwentyCrmStore } from 'src/sync/twenty-store';

import { FakeAsyntai, MapKv } from './fakes';

const client = new CoreApiClient();
const crm = new TwentyCrmStore(client);
const RUN = Date.now().toString(36);
const createdPeople = new Set<string>();
const createdNotes = new Set<string>();

type PersonRow = {
  id: string;
  name: { firstName: string; lastName: string };
  emails: { primaryEmail: string };
  phones: { primaryPhoneNumber: string; primaryPhoneCallingCode: string };
  asyntaiLastChatAt: string | null;
  asyntaiChats: number | null;
  asyntaiChatPage: { primaryLinkUrl: string | null } | null;
  noteTargets: { edges: { node: { noteId: string; note: { id: string; title: string; bodyV2: { markdown: string } } } }[] };
};

const loadPerson = async (id: string): Promise<PersonRow> => {
  const { person } = await client.query({
    person: {
      __args: { filter: { id: { eq: id } } },
      id: true,
      name: { firstName: true, lastName: true },
      emails: { primaryEmail: true },
      phones: { primaryPhoneNumber: true, primaryPhoneCallingCode: true },
      asyntaiLastChatAt: true,
      asyntaiChats: true,
      asyntaiChatPage: { primaryLinkUrl: true },
      noteTargets: {
        edges: { node: { noteId: true, note: { id: true, title: true, bodyV2: { markdown: true } } } },
      },
    } as never,
  });
  return person as unknown as PersonRow;
};

const track = (row: PersonRow) => {
  createdPeople.add(row.id);
  for (const edge of row.noteTargets.edges) {
    createdNotes.add(edge.node.noteId);
  }
};

afterAll(async () => {
  for (const id of createdNotes) {
    await client.mutation({ destroyNote: { __args: { id }, id: true } }).catch(() => {});
  }
  for (const id of createdPeople) {
    await client.mutation({ destroyPerson: { __args: { id }, id: true } }).catch(() => {});
  }
});

describe('app install', () => {
  it('is installed on the server', async () => {
    const { findManyApplications } = await new MetadataApiClient().query({
      findManyApplications: { universalIdentifier: true, name: true },
    });
    expect(
      findManyApplications.some(
        (app: { universalIdentifier: string }) => app.universalIdentifier === APPLICATION_UNIVERSAL_IDENTIFIER,
      ),
    ).toBe(true);
  });
});

describe('sync into Twenty', () => {
  const asyntai = new FakeAsyntai();
  const kv = new MapKv();
  const emailA = `jane.doe+${RUN}@example.com`;
  const digits = String(Date.now()).slice(-6);
  const phoneB = `+420 777 ${digits.slice(0, 3)} ${digits.slice(3)}`;
  const NOW = new Date();

  it('creates a person with the chat as a linked note', async () => {
    asyntai.addLead(
      { session_id: `s1-${RUN}`, email: emailA, page_url: 'https://shop.example.com/pricing', started_at: new Date(NOW.getTime() - 3600_000).toISOString() },
      [['Do you ship to Spain?', 'Yes, delivery takes 3 days.']],
    );
    asyntai.addLead(
      { session_id: `s2-${RUN}`, phone: phoneB, started_at: new Date(NOW.getTime() - 1800_000).toISOString() },
      [['Please call me', 'A colleague will call you today.']],
    );

    const result = await runSync({ asyntai, crm, kv, now: NOW });
    expect(result).toMatchObject({ peopleCreated: 2, notesCreated: 2, failed: 0, complete: true });

    const idA = await crm.findPersonByEmail(emailA.toUpperCase());
    expect(idA).not.toBeNull();
    const a = await loadPerson(idA as string);
    track(a);

    expect(a.name).toEqual({ firstName: 'Jane', lastName: 'Doe' });
    expect(a.emails.primaryEmail).toBe(emailA);
    expect(a.asyntaiChats).toBe(1);
    expect(a.asyntaiLastChatAt).not.toBeNull();
    expect(a.asyntaiChatPage?.primaryLinkUrl).toBe('https://shop.example.com/pricing');
    expect(a.noteTargets.edges).toHaveLength(1);
    const note = a.noteTargets.edges[0].node.note;
    expect(note.title).toContain('Website chat on shop.example.com');
    expect(note.bodyV2.markdown).toContain('Do you ship to Spain?');
    expect(note.bodyV2.markdown).toContain('Yes, delivery takes 3 days.');

    const idB = await crm.findPersonByPhone(phoneB);
    expect(idB).not.toBeNull();
    const b = await loadPerson(idB as string);
    track(b);
    expect(b.phones.primaryPhoneCallingCode).toBe('+420');
    expect(b.name.firstName).toBe('Website visitor');
    expect(b.noteTargets.edges[0].node.note.bodyV2.markdown).toContain('Please call me');
  });

  it('adds a second chat to the same person and never duplicates', async () => {
    asyntai.addLead(
      { session_id: `s3-${RUN}`, email: emailA.toUpperCase(), started_at: new Date(NOW.getTime() - 600_000).toISOString() },
      [['Is there a discount?', 'Yes, 10 percent for new customers.']],
    );

    const later = new Date(NOW.getTime() + 5 * 60_000);
    const result = await runSync({ asyntai, crm, kv, now: later });
    expect(result).toMatchObject({ peopleCreated: 0, peopleMatched: 1, notesCreated: 1 });

    const again = await runSync({ asyntai, crm, kv, now: new Date(later.getTime() + 5 * 60_000) });
    expect(again).toMatchObject({ peopleCreated: 0, notesCreated: 0 });

    const a = await loadPerson((await crm.findPersonByEmail(emailA)) as string);
    track(a);
    expect(a.asyntaiChats).toBe(2);
    expect(a.noteTargets.edges).toHaveLength(2);
  });

  it('updates the note when the conversation goes on', async () => {
    const sessionId = `s1-${RUN}`;
    const at = new Date(NOW.getTime() + 11 * 60_000).toISOString();
    asyntai.messages.get(sessionId)?.push(
      { role: 'user', content: 'And to Portugal?', timestamp: at },
      { role: 'assistant', content: 'Portugal too, in 4 days.', timestamp: at, sender_type: 'ai' },
    );
    asyntai.sessions.push({
      session_id: sessionId,
      message_count: 2,
      first_message_at: null,
      last_message_at: at,
      page_url: 'https://shop.example.com/shipping',
      country: null,
      website_domain: 'shop.example.com',
    });

    const result = await runSync({ asyntai, crm, kv, now: new Date(NOW.getTime() + 15 * 60_000) });
    expect(result).toMatchObject({ notesCreated: 0, notesUpdated: 1, failed: 0 });

    const a = await loadPerson((await crm.findPersonByEmail(emailA)) as string);
    const bodies = a.noteTargets.edges.map((edge) => edge.node.note.bodyV2.markdown).join('\n');
    expect(bodies).toContain('Portugal too, in 4 days.');
    expect(a.noteTargets.edges).toHaveLength(2);
    expect(a.asyntaiChats).toBe(2);
    expect(a.asyntaiChatPage?.primaryLinkUrl).toBe('https://shop.example.com/shipping');
    expect(new Date(a.asyntaiLastChatAt as string).toISOString()).toBe(at);
  });
});
