// What the sync needs from Twenty and from the key-value store. The logic
// function passes the real ones; the tests pass in-memory ones.

export type NewPerson = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
};

export type PersonChatUpdate = {
  // Time of the latest message. The store keeps whichever is later: this or
  // the value already on the person.
  chatAt: string;
  chatPage: string | null;
  // True when this is a conversation the person did not have before.
  newChat: boolean;
};

export interface CrmStore {
  findPersonByEmail(email: string): Promise<string | null>;
  findPersonByPhone(phone: string): Promise<string | null>;
  createPerson(person: NewPerson): Promise<string>;
  updatePersonChat(personId: string, update: PersonChatUpdate): Promise<void>;
  createNote(personId: string, title: string, markdown: string): Promise<string>;
  updateNote(noteId: string, title: string, markdown: string): Promise<void>;
  noteExists(noteId: string): Promise<boolean>;
}

export interface KeyValueStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
}

// Remembered per conversation, so a conversation becomes one note and later
// messages update that note instead of adding a second one.
export type SyncedSession = {
  noteId: string;
  personId: string;
  messageCount: number;
  lastMessageAt: string | null;
  lead?: {
    email: string | null;
    phone: string | null;
    page_url: string | null;
    started_at: string | null;
  };
};
