import { describe, expect, it } from 'vitest';

import { hostOf, nameFromLead, noteTitle, splitPhone, transcriptMarkdown, webPageUrl } from 'src/asyntai/format';

describe('nameFromLead', () => {
  it('splits a dotted address into first and last name', () => {
    expect(nameFromLead({ email: 'jane.doe@example.com', phone: null })).toEqual({
      firstName: 'Jane',
      lastName: 'Doe',
    });
  });

  it('handles underscores, dashes, plus tags and digits', () => {
    expect(nameFromLead({ email: 'JOHN_van-der+news42@x.io', phone: null })).toEqual({
      firstName: 'John',
      lastName: 'Van Der',
    });
  });

  it('keeps accented letters', () => {
    expect(nameFromLead({ email: 'tomáš.novák@firma.cz', phone: null })).toEqual({
      firstName: 'Tomáš',
      lastName: 'Novák',
    });
  });

  it('uses one word as the first name', () => {
    expect(nameFromLead({ email: 'info@shop.com', phone: null })).toEqual({
      firstName: 'Info',
      lastName: '',
    });
  });

  it('falls back to the phone number when there is no email', () => {
    expect(nameFromLead({ email: null, phone: '+420 777 123 456' })).toEqual({
      firstName: 'Website visitor',
      lastName: '+420 777 123 456',
    });
  });

  it('falls back to the phone number when the address has no letters', () => {
    expect(nameFromLead({ email: '12345@x.com', phone: '555 0100' })).toEqual({
      firstName: 'Website visitor',
      lastName: '555 0100',
    });
  });
});

describe('splitPhone', () => {
  it('splits a Czech number', () => {
    expect(splitPhone('+420 777 123 456')).toEqual({
      primaryPhoneCallingCode: '+420',
      primaryPhoneNumber: '777123456',
    });
  });

  it('splits a US number', () => {
    expect(splitPhone('+1 (415) 555-0100')).toEqual({
      primaryPhoneCallingCode: '+1',
      primaryPhoneNumber: '4155550100',
    });
  });

  it('splits a UK and a German number', () => {
    expect(splitPhone('+44 20 7946 0958').primaryPhoneCallingCode).toBe('+44');
    expect(splitPhone('+49 30 901820').primaryPhoneCallingCode).toBe('+49');
  });

  it('keeps a local number whole', () => {
    expect(splitPhone('777 123 456')).toEqual({
      primaryPhoneCallingCode: '',
      primaryPhoneNumber: '777123456',
    });
  });
});

describe('webPageUrl', () => {
  it('keeps web pages and drops embedded previews', () => {
    expect(webPageUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(webPageUrl('http://example.com')).toBe('http://example.com/');
    expect(webPageUrl('about:srcdoc')).toBeNull();
    expect(webPageUrl('about:blank')).toBeNull();
    expect(webPageUrl('file:///C:/page.html')).toBeNull();
    expect(webPageUrl('not a url')).toBeNull();
    expect(webPageUrl(null)).toBeNull();
  });

  it('leaves the page out of the note for an embedded preview', () => {
    const markdown = transcriptMarkdown(
      { email: 'a@example.com', phone: null, page_url: 'about:srcdoc', started_at: null },
      [{ role: 'user', content: 'Hi', timestamp: 't' }],
    );
    expect(markdown).not.toContain('Page:');
    expect(noteTitle({ page_url: 'about:srcdoc', started_at: '2026-09-18T10:00:00Z' })).toBe('Website chat (2026-09-18)');
  });
});

describe('hostOf and noteTitle', () => {
  it('strips www and handles bad URLs', () => {
    expect(hostOf('https://www.example.com/pricing?x=1')).toBe('example.com');
    expect(hostOf('not a url')).toBe('');
    expect(hostOf(null)).toBe('');
  });

  it('names the note after the website and the day', () => {
    expect(
      noteTitle({ page_url: 'https://shop.example.com/p/1', started_at: '2026-10-11T08:15:00+00:00' }),
    ).toBe('Website chat on shop.example.com (2026-10-11)');
    expect(noteTitle({ page_url: null, started_at: null })).toBe('Website chat');
  });
});

describe('transcriptMarkdown', () => {
  const lead = {
    email: 'jane@example.com',
    phone: null,
    page_url: 'https://example.com/pricing',
    started_at: '2026-10-11T08:15:00+00:00',
  };

  it('writes the facts and each turn with its speaker', () => {
    const markdown = transcriptMarkdown(lead, [
      { role: 'user', content: 'Do you ship to Spain?', timestamp: '2026-10-11T08:15:00Z' },
      { role: 'assistant', content: 'Yes, in 3 days.', timestamp: '2026-10-11T08:15:00Z', sender_type: 'ai' },
      { role: 'assistant', content: 'Hi, Petra here.', timestamp: '2026-10-11T08:16:00Z', sender_type: 'human', agent_name: 'Petra' },
    ]);

    expect(markdown).toContain('**Page:** https://example.com/pricing');
    expect(markdown).toContain('**Started:** 2026-10-11 08:15 UTC');
    expect(markdown).toContain('**Email:** jane@example.com');
    expect(markdown).toContain('**Visitor:** Do you ship to Spain?');
    expect(markdown).toContain('**AI chatbot:** Yes, in 3 days.');
    expect(markdown).toContain('**Petra:** Hi, Petra here.');
    expect(markdown.indexOf('Visitor')).toBeLessThan(markdown.indexOf('Petra:'));
  });

  it('stops visitor text from becoming headings, lists or links', () => {
    const markdown = transcriptMarkdown(lead, [
      { role: 'user', content: '# Big\n- item\n[click](http://evil.example)', timestamp: 't' },
    ]);

    expect(markdown).toContain('\\# Big');
    expect(markdown).toContain('\\- item');
    expect(markdown).toContain('\\[click\\]');
  });

  it('skips empty messages and says when there are none', () => {
    expect(transcriptMarkdown(lead, [{ role: 'assistant', content: '  ', timestamp: 't' }])).toContain(
      '_No messages yet._',
    );
  });
});
