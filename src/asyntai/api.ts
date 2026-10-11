// Small client for the Asyntai public API (https://asyntai.com/documentation/api/).
// Every call runs server-side inside a Twenty logic function.

export const ASYNTAI_BASE_URL = 'https://asyntai.com';

export type AsyntaiLead = {
  session_id: string;
  email: string | null;
  phone: string | null;
  page_url: string | null;
  started_at: string | null;
};

export type AsyntaiSession = {
  session_id: string;
  message_count: number;
  first_message_at: string | null;
  last_message_at: string | null;
  page_url: string | null;
  country: string | null;
  website_domain: string | null;
};

export type AsyntaiMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sender_type?: string | null;
  agent_name?: string | null;
};

export class AsyntaiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AsyntaiError';
    this.status = status;
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type AsyntaiClientOptions = {
  apiKey: string;
  website?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
};

// Most pages the sync walks in one run. 100 leads per page.
const MAX_PAGES = 10;

export class AsyntaiClient {
  private readonly apiKey: string;
  private readonly website: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: AsyntaiClientOptions) {
    this.apiKey = (options.apiKey ?? '').trim();
    this.website = (options.website ?? '').trim();
    this.baseUrl = (options.baseUrl ?? ASYNTAI_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    if (!this.apiKey) {
      throw new AsyntaiError('Add your Asyntai API key in the app settings.', 401);
    }

    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== ''),
    ).toString();
    const url = `${this.baseUrl}${path}${query ? `?${query}` : ''}`;

    const response = await this.fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
        'User-Agent': 'asyntai-twenty-app/1.0',
      },
    });

    let body: Record<string, unknown> = {};
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    if (!response.ok || body.success === false) {
      const message =
        typeof body.error === 'string' && body.error
          ? body.error
          : `Asyntai answered ${response.status}.`;
      throw new AsyntaiError(message, response.status);
    }

    return body as T;
  }

  async getAccount(): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>('/api/v1/account/', {});
  }

  // Leads whose chat started on or after `since`, newest first, every page.
  async listLeads(since: Date): Promise<AsyntaiLead[]> {
    const all: AsyntaiLead[] = [];
    let before = '';

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const { leads } = await this.get<{ leads: AsyntaiLead[] }>('/api/v1/leads/', {
        limit: '100',
        since: since.toISOString(),
        before,
        website_id: this.website,
      });

      all.push(...leads);

      const last = leads[leads.length - 1];
      if (leads.length < 100 || !last?.started_at) {
        break;
      }
      before = last.started_at;
    }

    return all;
  }

  // Leads with this exact email address, newest first.
  async listLeadsByEmail(email: string): Promise<AsyntaiLead[]> {
    const { leads } = await this.get<{ leads: AsyntaiLead[] }>('/api/v1/leads/', {
      limit: '100',
      email,
      website_id: this.website,
    });
    const wanted = email.trim().toLowerCase();

    return leads.filter((lead) => (lead.email ?? '').trim().toLowerCase() === wanted);
  }

  // Conversations with a message on or after `since`, newest first.
  async listSessions(since: Date): Promise<AsyntaiSession[]> {
    const all: AsyntaiSession[] = [];
    let before = '';

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const { sessions } = await this.get<{ sessions: AsyntaiSession[] }>(
        '/api/v1/sessions/',
        {
          limit: '100',
          since: since.toISOString(),
          before,
          website_id: this.website,
        },
      );

      all.push(...sessions);

      const last = sessions[sessions.length - 1];
      if (sessions.length < 100 || !last?.last_message_at) {
        break;
      }
      before = last.last_message_at;
    }

    return all;
  }

  async getMessages(sessionId: string): Promise<AsyntaiMessage[]> {
    const { messages } = await this.get<{ messages: AsyntaiMessage[] }>(
      '/api/v1/conversations/',
      { session_id: sessionId, limit: '100' },
    );

    return messages ?? [];
  }
}

// Plain-language reason for the app settings banner and for logs.
export const describeAsyntaiError = (error: unknown): string => {
  if (error instanceof AsyntaiError) {
    if (error.status === 401) {
      return 'Asyntai does not accept this API key. Copy a new key from Settings, then API, in Asyntai.';
    }
    if (error.status === 403) {
      return 'The Asyntai API needs the Starter plan or higher. Upgrade at asyntai.com/pricing/.';
    }
    return error.message;
  }

  return error instanceof Error ? error.message : String(error);
};
