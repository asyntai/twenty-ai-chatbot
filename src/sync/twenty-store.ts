import { CoreApiClient } from 'twenty-client-sdk/core';

import { splitPhone, webPageUrl } from 'src/asyntai/format';
import type { CrmStore, NewPerson, PersonChatUpdate } from 'src/sync/types';

// The fields this app adds to Person. The generated client knows them once the
// app is synced, but they are addressed by name here so this file also builds
// before the first sync.
type PersonChatFields = {
  asyntaiLastChatAt?: string | null;
  asyntaiChats?: number | null;
};

// "%" and "_" are wildcards in ilike; an address may contain "_".
const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (char) => `\\${char}`);

type Client = Pick<CoreApiClient, 'query' | 'mutation'>;

export class TwentyCrmStore implements CrmStore {
  private readonly client: Client;

  constructor(client?: Client) {
    this.client = client ?? new CoreApiClient();
  }

  async findPersonByEmail(email: string): Promise<string | null> {
    const address = email.trim();
    const { people } = await this.client.query({
      people: {
        __args: {
          first: 1,
          filter: {
            or: [
              { emails: { primaryEmail: { ilike: escapeLike(address) } } },
              { emails: { additionalEmails: { like: `%"${escapeLike(address)}"%` } } },
            ],
          },
        },
        edges: { node: { id: true } },
      },
    });

    return people?.edges?.[0]?.node?.id ?? null;
  }

  async findPersonByPhone(phone: string): Promise<string | null> {
    const { primaryPhoneNumber } = splitPhone(phone);
    if (primaryPhoneNumber.replace(/\D/g, '').length < 6) {
      return null;
    }
    const { people } = await this.client.query({
      people: {
        __args: {
          first: 1,
          filter: { phones: { primaryPhoneNumber: { eq: primaryPhoneNumber } } },
        },
        edges: { node: { id: true } },
      },
    });

    return people?.edges?.[0]?.node?.id ?? null;
  }

  async createPerson(person: NewPerson): Promise<string> {
    const data: Record<string, unknown> = {
      name: { firstName: person.firstName, lastName: person.lastName },
    };
    if (person.email) {
      data.emails = { primaryEmail: person.email, additionalEmails: [] };
    }
    if (person.phone) {
      const phone = splitPhone(person.phone);
      data.phones = {
        primaryPhoneNumber: phone.primaryPhoneNumber,
        primaryPhoneCallingCode: phone.primaryPhoneCallingCode,
        additionalPhones: [],
      };
    }

    const { createPerson } = await this.client.mutation({
      createPerson: { __args: { data }, id: true },
    });

    if (!createPerson?.id) {
      throw new Error('Twenty did not return the new person.');
    }
    return createPerson.id;
  }

  async updatePersonChat(personId: string, update: PersonChatUpdate): Promise<void> {
    const { person } = await this.client.query({
      person: {
        __args: { filter: { id: { eq: personId } } },
        id: true,
        asyntaiLastChatAt: true,
        asyntaiChats: true,
      } as never,
    });
    const current = (person ?? {}) as PersonChatFields;

    const previous = current.asyntaiLastChatAt ? new Date(current.asyntaiLastChatAt) : null;
    const incoming = new Date(update.chatAt);
    const isLatest = !previous || incoming >= previous;

    const data: Record<string, unknown> = {};
    if (isLatest) {
      data.asyntaiLastChatAt = incoming.toISOString();
      const page = webPageUrl(update.chatPage);
      if (page) {
        data.asyntaiChatPage = { primaryLinkUrl: page, primaryLinkLabel: '' };
      }
    }
    if (update.newChat) {
      data.asyntaiChats = (current.asyntaiChats ?? 0) + 1;
    }
    if (Object.keys(data).length === 0) {
      return;
    }

    await this.client.mutation({
      updatePerson: { __args: { id: personId, data }, id: true } as never,
    });
  }

  async createNote(personId: string, title: string, markdown: string): Promise<string> {
    const { createNote } = await this.client.mutation({
      createNote: {
        __args: { data: { title, bodyV2: { markdown } } },
        id: true,
      },
    });

    const noteId = createNote?.id;
    if (!noteId) {
      throw new Error('Twenty did not return the new note.');
    }

    await this.client.mutation({
      createNoteTarget: {
        __args: { data: { noteId, targetPersonId: personId } },
        id: true,
      },
    });

    return noteId;
  }

  async updateNote(noteId: string, title: string, markdown: string): Promise<void> {
    await this.client.mutation({
      updateNote: {
        __args: { id: noteId, data: { title, bodyV2: { markdown } } },
        id: true,
      },
    });
  }

  async noteExists(noteId: string): Promise<boolean> {
    // A missing note comes back as null. Any other failure is thrown, so a
    // network error never makes the sync add a second note.
    const { note } = await this.client.query({
      note: { __args: { filter: { id: { eq: noteId } } }, id: true },
    });
    return Boolean(note?.id);
  }
}
