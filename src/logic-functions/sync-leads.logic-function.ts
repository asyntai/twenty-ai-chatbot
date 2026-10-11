import { defineLogicFunction } from 'twenty-sdk/define';
import { kv } from 'twenty-sdk/logic-function';

import { AsyntaiClient, describeAsyntaiError } from 'src/asyntai/api';
import { SYNC_LEADS_FUNCTION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';
import { runSync } from 'src/sync/engine';
import { TwentyCrmStore } from 'src/sync/twenty-store';

// Every five minutes: new chat leads become people with the conversation as a
// note, and conversations that went on get their note brought up to date.
const handler = async () => {
  if (!process.env.ASYNTAI_API_KEY?.trim()) {
    console.log('Asyntai sync: waiting for the Asyntai API key in the app settings.');
    return { skipped: 'Add your Asyntai API key in the app settings.' };
  }

  const asyntai = new AsyntaiClient({
    apiKey: process.env.ASYNTAI_API_KEY,
    website: process.env.ASYNTAI_WEBSITE,
  });

  try {
    const result = await runSync({
      asyntai,
      crm: new TwentyCrmStore(),
      kv: {
        get: <T>(key: string) => kv.get<T>(key),
        set: async (key: string, value: unknown) => {
          await kv.set(key, value);
        },
      },
    });
    console.log(
      `Asyntai sync: ${result.notesCreated} new chats, ${result.notesUpdated} updated, ` +
        `${result.peopleCreated} new people, ${result.failed} failed.`,
    );
    for (const error of result.errors) {
      console.error(`Asyntai sync: ${error}`);
    }
    return result;
  } catch (error) {
    const reason = describeAsyntaiError(error);
    console.error(`Asyntai sync stopped: ${reason}`);
    throw new Error(reason);
  }
};

export default defineLogicFunction({
  universalIdentifier: SYNC_LEADS_FUNCTION_UNIVERSAL_IDENTIFIER,
  name: 'sync-asyntai-leads',
  description:
    'Brings new Asyntai chatbot leads into Twenty as people, with each conversation as a note on the person.',
  timeoutSeconds: 120,
  handler,
  cronTriggerSettings: {
    pattern: '*/5 * * * *',
  },
});
