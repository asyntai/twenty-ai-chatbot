import { describe, expect, it } from 'vitest';

import { AsyntaiClient, AsyntaiError, describeAsyntaiError } from 'src/asyntai/api';

type Call = { url: URL; headers: Record<string, string> };

const fakeFetch = (pages: Array<{ status?: number; body: unknown }>) => {
  const calls: Call[] = [];
  let index = 0;
  const impl = async (input: string, init?: RequestInit) => {
    calls.push({ url: new URL(input), headers: (init?.headers ?? {}) as Record<string, string> });
    const page = pages[Math.min(index, pages.length - 1)];
    index += 1;
    return new Response(JSON.stringify(page.body), { status: page.status ?? 200 });
  };
  return { calls, impl };
};

const lead = (n: number) => ({
  session_id: `s${n}`,
  email: `v${n}@example.com`,
  phone: null,
  page_url: null,
  started_at: new Date(Date.UTC(2026, 9, 11, 0, 0, 0) - n * 60_000).toISOString(),
});

describe('AsyntaiClient', () => {
  it('sends the key, the date window and the website filter', async () => {
    const { calls, impl } = fakeFetch([{ body: { success: true, leads: [lead(1)] } }]);
    const client = new AsyntaiClient({ apiKey: ' key-1 ', website: 'example.com', fetchImpl: impl });

    const leads = await client.listLeads(new Date('2026-10-01T00:00:00Z'));

    expect(leads).toHaveLength(1);
    expect(calls[0].url.origin + calls[0].url.pathname).toBe('https://asyntai.com/api/v1/leads/');
    expect(calls[0].url.searchParams.get('since')).toBe('2026-10-01T00:00:00.000Z');
    expect(calls[0].url.searchParams.get('website_id')).toBe('example.com');
    expect(calls[0].url.searchParams.get('limit')).toBe('100');
    expect(calls[0].url.searchParams.has('before')).toBe(false);
    expect(calls[0].headers.Authorization).toBe('Bearer key-1');
  });

  it('walks back through full pages with before', async () => {
    const full = Array.from({ length: 100 }, (_, i) => lead(i));
    const { calls, impl } = fakeFetch([
      { body: { success: true, leads: full } },
      { body: { success: true, leads: [lead(200)] } },
    ]);
    const client = new AsyntaiClient({ apiKey: 'k', fetchImpl: impl });

    const leads = await client.listLeads(new Date('2026-01-01T00:00:00Z'));

    expect(leads).toHaveLength(101);
    expect(calls).toHaveLength(2);
    expect(calls[1].url.searchParams.get('before')).toBe(full[99].started_at);
    expect(calls[1].url.searchParams.has('website_id')).toBe(false);
  });

  it('keeps only exact email matches', async () => {
    const { impl } = fakeFetch([
      { body: { success: true, leads: [{ ...lead(1), email: 'Jane@Example.com' }, { ...lead(2), email: 'janet@example.com' }] } },
    ]);
    const client = new AsyntaiClient({ apiKey: 'k', fetchImpl: impl });

    const leads = await client.listLeadsByEmail('jane@example.com');

    expect(leads.map((l) => l.session_id)).toEqual(['s1']);
  });

  it('turns API errors into plain reasons', async () => {
    const refused = new AsyntaiClient({
      apiKey: 'bad',
      fetchImpl: fakeFetch([{ status: 401, body: { success: false, error: 'Invalid API key' } }]).impl,
    });
    const error = await refused.getAccount().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AsyntaiError);
    expect((error as AsyntaiError).status).toBe(401);
    expect(describeAsyntaiError(error)).toContain('does not accept this API key');

    const freePlan = new AsyntaiClient({
      apiKey: 'free',
      fetchImpl: fakeFetch([{ status: 403, body: { success: false, error: 'API access requires a paid plan' } }]).impl,
    });
    expect(describeAsyntaiError(await freePlan.getAccount().catch((e: unknown) => e))).toContain('Starter plan');

    const broken = new AsyntaiClient({
      apiKey: 'k',
      fetchImpl: async () => new Response('<html>502</html>', { status: 502 }),
    });
    expect(describeAsyntaiError(await broken.getAccount().catch((e: unknown) => e))).toBe('Asyntai answered 502.');
  });

  it('asks for a key before calling anything', async () => {
    const { calls, impl } = fakeFetch([{ body: {} }]);
    const client = new AsyntaiClient({ apiKey: '  ', fetchImpl: impl });
    await expect(client.getMessages('s1')).rejects.toThrow('Add your Asyntai API key');
    expect(calls).toHaveLength(0);
  });
});
