import { defineLogicFunction } from 'twenty-sdk/define';
import { jsonSchemaToInputSchema, type InputJsonSchema } from 'twenty-sdk/logic-function';

import { AsyntaiClient, describeAsyntaiError } from 'src/asyntai/api';
import { hostOf } from 'src/asyntai/format';
import { FIND_CHATS_FUNCTION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

const MAX_CHATS = 5;

const inputSchema: InputJsonSchema = {
  type: 'object',
  properties: {
    email: {
      type: 'string',
      label: 'Email address',
      description: 'Email address the visitor left in the website chat.',
    },
  },
  required: ['email'],
};

type Chat = {
  startedAt: string | null;
  page: string | null;
  website: string;
  transcript: string;
};

// Plain text, one line per message, so an AI agent or a workflow step can
// read it directly.
const transcriptText = (
  messages: { role: string; content: string; sender_type?: string | null; agent_name?: string | null }[],
): string =>
  messages
    .filter((message) => (message.content ?? '').trim() !== '')
    .map((message) => {
      const speaker =
        message.role === 'user'
          ? 'Visitor'
          : message.sender_type === 'human'
            ? message.agent_name || 'Agent'
            : 'AI chatbot';
      return `${speaker}: ${message.content.trim()}`;
    })
    .join('\n');

const handler = async (params: { email?: string }) => {
  const email = (params?.email ?? '').trim();
  if (!email) {
    return { found: 0, chats: [], latestTranscript: '', error: 'Give an email address.' };
  }

  const asyntai = new AsyntaiClient({
    apiKey: process.env.ASYNTAI_API_KEY ?? '',
    website: process.env.ASYNTAI_WEBSITE,
  });

  try {
    const leads = (await asyntai.listLeadsByEmail(email)).slice(0, MAX_CHATS);
    const chats: Chat[] = [];

    for (const lead of leads) {
      const messages = await asyntai.getMessages(lead.session_id);
      chats.push({
        startedAt: lead.started_at,
        page: lead.page_url,
        website: hostOf(lead.page_url),
        transcript: transcriptText(messages),
      });
    }

    return {
      found: chats.length,
      chats,
      latestTranscript: chats[0]?.transcript ?? '',
      error: '',
    };
  } catch (error) {
    return { found: 0, chats: [], latestTranscript: '', error: describeAsyntaiError(error) };
  }
};

export default defineLogicFunction({
  universalIdentifier: FIND_CHATS_FUNCTION_UNIVERSAL_IDENTIFIER,
  name: 'get-asyntai-chats',
  description:
    'Returns the website chats that a contact had with the Asyntai AI chatbot, found by their email address, newest first, with the full text of each conversation. Use it to learn what a person asked on the website before you reply or call them.',
  timeoutSeconds: 30,
  handler,
  toolTriggerSettings: {
    inputSchema,
  },
  workflowActionTriggerSettings: {
    label: 'Get Asyntai chats',
    icon: 'IconMessageChatbot',
    inputSchema: jsonSchemaToInputSchema(inputSchema),
    outputSchema: [
      {
        type: 'object',
        properties: {
          found: { type: 'number' },
          latestTranscript: { type: 'string' },
          error: { type: 'string' },
        },
      },
    ],
  },
});
