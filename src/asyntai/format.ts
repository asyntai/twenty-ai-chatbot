import type { AsyntaiLead, AsyntaiMessage } from 'src/asyntai/api';

// The page URL when it is a real web address. Chats in embedded previews
// report addresses like "about:srcdoc", which Twenty does not accept as a link.
export const webPageUrl = (pageUrl: string | null | undefined): string | null => {
  if (!pageUrl) {
    return null;
  }
  try {
    const url = new URL(pageUrl.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

// Host of a page URL, without "www.". Empty when the URL cannot be parsed.
export const hostOf = (pageUrl: string | null | undefined): string => {
  if (!pageUrl) {
    return '';
  }
  try {
    return new URL(pageUrl).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const capitalise = (word: string): string =>
  word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : '';

// A readable name for a new person. Chat visitors leave an email address or a
// phone number, not a name, so the name comes from the address:
// "jane.doe@example.com" becomes Jane Doe.
export const nameFromLead = (
  lead: Pick<AsyntaiLead, 'email' | 'phone'>,
): { firstName: string; lastName: string } => {
  const local = (lead.email ?? '').split('@')[0] ?? '';
  const parts = local
    .replace(/\+.*$/, '')
    .split(/[._-]+/)
    .map((part) => part.replace(/[^\p{L}]/gu, ''))
    .filter(Boolean);

  if (parts.length >= 2) {
    return {
      firstName: capitalise(parts[0]),
      lastName: parts.slice(1).map(capitalise).join(' '),
    };
  }
  if (parts.length === 1) {
    return { firstName: capitalise(parts[0]), lastName: '' };
  }
  if (lead.phone) {
    return { firstName: 'Website visitor', lastName: lead.phone.trim() };
  }
  return { firstName: 'Website visitor', lastName: '' };
};

// Splits "+420 777 123 456" into the calling code and the local number, which
// is how Twenty stores phones. Numbers without a "+" stay whole.
export const splitPhone = (
  phone: string,
): { primaryPhoneNumber: string; primaryPhoneCallingCode: string } => {
  const cleaned = phone.trim().replace(/[^\d+]/g, '');
  const match = /^\+(\d{1,3})(\d{4,})$/.exec(cleaned);

  if (match && cleaned.length >= 9) {
    const callingCode = callingCodeOf(cleaned);
    if (callingCode) {
      return {
        primaryPhoneCallingCode: `+${callingCode}`,
        primaryPhoneNumber: cleaned.slice(callingCode.length + 1),
      };
    }
  }

  return { primaryPhoneCallingCode: '', primaryPhoneNumber: cleaned };
};

// Calling codes are prefix-free, so the first one that matches is the answer.
// One- and two-digit codes are listed; every other code has three digits.
const ONE_DIGIT = ['1', '7'];
const TWO_DIGIT = [
  '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45',
  '46', '47', '48', '49', '51', '52', '53', '54', '55', '56', '57', '58', '60', '61',
  '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', '93', '94',
  '95', '98',
];

const callingCodeOf = (e164: string): string => {
  const digits = e164.slice(1);
  if (ONE_DIGIT.includes(digits.slice(0, 1))) {
    return digits.slice(0, 1);
  }
  if (TWO_DIGIT.includes(digits.slice(0, 2))) {
    return digits.slice(0, 2);
  }
  return digits.slice(0, 3);
};

const formatWhen = (iso: string | null | undefined): string => {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
};

export const noteTitle = (lead: Pick<AsyntaiLead, 'page_url' | 'started_at'>): string => {
  const host = hostOf(lead.page_url);
  const day = lead.started_at ? lead.started_at.slice(0, 10) : '';
  const where = host ? ` on ${host}` : '';
  const when = day ? ` (${day})` : '';

  return `Website chat${where}${when}`;
};

// Twenty notes take markdown. Each turn becomes one paragraph with the speaker
// in bold; a reply from a human agent carries the agent's name.
export const transcriptMarkdown = (
  lead: Pick<AsyntaiLead, 'email' | 'phone' | 'page_url' | 'started_at'>,
  messages: AsyntaiMessage[],
): string => {
  const facts: string[] = [];
  const page = webPageUrl(lead.page_url);
  if (page) {
    facts.push(`**Page:** ${page}`);
  }
  if (lead.started_at) {
    facts.push(`**Started:** ${formatWhen(lead.started_at)}`);
  }
  if (lead.email) {
    facts.push(`**Email:** ${lead.email}`);
  }
  if (lead.phone) {
    facts.push(`**Phone:** ${lead.phone}`);
  }

  const turns = messages
    .filter((message) => (message.content ?? '').trim() !== '')
    .map((message) => {
      const speaker =
        message.role === 'user'
          ? 'Visitor'
          : message.sender_type === 'human'
            ? message.agent_name || 'Agent'
            : 'AI chatbot';

      return `**${speaker}:** ${escapeMarkdown(message.content.trim())}`;
    });

  const body = turns.length > 0 ? turns.join('\n\n') : '_No messages yet._';

  return [facts.join('  \n'), body].filter(Boolean).join('\n\n---\n\n');
};

// Keeps a visitor's text from turning into headings, lists or links that the
// visitor did not intend. Line breaks stay.
const escapeMarkdown = (text: string): string =>
  text
    .replace(/\r\n/g, '\n')
    .replace(/^(\s*)([#>*+-]|\d+\.)(\s)/gm, '$1\\$2$3')
    .replace(/([\[\]])/g, '\\$1')
    .replace(/\n/g, '  \n');
