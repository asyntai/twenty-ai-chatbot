import type { AsyntaiLead, AsyntaiMessage, AsyntaiSession } from 'src/asyntai/api';
import type { CrmStore, KeyValueStore, NewPerson, PersonChatUpdate } from 'src/sync/types';

export class MapKv implements KeyValueStore {
  readonly data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return this.data.has(key) ? (structuredClone(this.data.get(key)) as T) : null;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.data.set(key, structuredClone(value));
  }
}

export type FakePerson = NewPerson & {
  id: string;
  lastChatAt: string | null;
  chatPage: string | null;
  chats: number;
};

export class FakeCrm implements CrmStore {
  readonly people = new Map<string, FakePerson>();
  readonly notes = new Map<string, { personId: string; title: string; markdown: string }>();
  private next = 1;
  failCreateNoteFor: string | null = null;
  failUpdatePersonChat = false;

  addPerson(person: Partial<FakePerson>): string {
    const id = `person-${this.next++}`;
    this.people.set(id, {
      id,
      firstName: '',
      lastName: '',
      email: null,
      phone: null,
      lastChatAt: null,
      chatPage: null,
      chats: 0,
      ...person,
    });
    return id;
  }

  async findPersonByEmail(email: string): Promise<string | null> {
    for (const person of this.people.values()) {
      if ((person.email ?? '').toLowerCase() === email.toLowerCase()) {
        return person.id;
      }
    }
    return null;
  }

  async findPersonByPhone(phone: string): Promise<string | null> {
    const digits = phone.replace(/\D/g, '');
    for (const person of this.people.values()) {
      if (person.phone && person.phone.replace(/\D/g, '') === digits) {
        return person.id;
      }
    }
    return null;
  }

  async createPerson(person: NewPerson): Promise<string> {
    return this.addPerson(person);
  }

  async updatePersonChat(personId: string, update: PersonChatUpdate): Promise<void> {
    if (this.failUpdatePersonChat) {
      throw new Error('The URL of the link is not valid');
    }
    const person = this.people.get(personId);
    if (!person) {
      throw new Error(`no person ${personId}`);
    }
    if (!person.lastChatAt || new Date(update.chatAt) >= new Date(person.lastChatAt)) {
      person.lastChatAt = update.chatAt;
      person.chatPage = update.chatPage ?? person.chatPage;
    }
    if (update.newChat) {
      person.chats += 1;
    }
  }

  async createNote(personId: string, title: string, markdown: string): Promise<string> {
    if (this.failCreateNoteFor && markdown.includes(this.failCreateNoteFor)) {
      throw new Error('Twenty is down');
    }
    const id = `note-${this.next++}`;
    this.notes.set(id, { personId, title, markdown });
    return id;
  }

  async updateNote(noteId: string, title: string, markdown: string): Promise<void> {
    const note = this.notes.get(noteId);
    if (!note) {
      throw new Error(`no note ${noteId}`);
    }
    note.title = title;
    note.markdown = markdown;
  }

  async noteExists(noteId: string): Promise<boolean> {
    return this.notes.has(noteId);
  }
}

export class FakeAsyntai {
  leads: AsyntaiLead[] = [];
  sessions: AsyntaiSession[] = [];
  messages = new Map<string, AsyntaiMessage[]>();
  leadCalls: Date[] = [];
  sessionCalls: Date[] = [];
  failWith: Error | null = null;

  async listLeads(since: Date): Promise<AsyntaiLead[]> {
    this.leadCalls.push(since);
    if (this.failWith) {
      throw this.failWith;
    }
    return this.leads
      .filter((lead) => !lead.started_at || new Date(lead.started_at) >= since)
      .sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''));
  }

  async listSessions(since: Date): Promise<AsyntaiSession[]> {
    this.sessionCalls.push(since);
    return this.sessions.filter(
      (session) => session.last_message_at && new Date(session.last_message_at) >= since,
    );
  }

  async getMessages(sessionId: string): Promise<AsyntaiMessage[]> {
    return this.messages.get(sessionId) ?? [];
  }

  addLead(lead: Partial<AsyntaiLead> & { session_id: string }, messages: [string, string][] = []): void {
    const started = lead.started_at ?? '2026-10-10T10:00:00+00:00';
    this.leads.push({ email: null, phone: null, page_url: 'https://example.com/', started_at: started, ...lead });
    this.messages.set(
      lead.session_id,
      messages.flatMap(([question, answer], index) => {
        const at = new Date(new Date(started).getTime() + index * 60_000).toISOString();
        return [
          { role: 'user' as const, content: question, timestamp: at },
          { role: 'assistant' as const, content: answer, timestamp: at, sender_type: 'ai' },
        ];
      }),
    );
  }
}
