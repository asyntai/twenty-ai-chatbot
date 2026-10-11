import { defineHealthCheck } from 'twenty-sdk/define';

import { AsyntaiClient, AsyntaiError } from 'src/asyntai/api';
import { HEALTH_CHECK_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

// Shown on the app's settings page: a key that Asyntai refuses, or an account
// without API access. A missing key is covered by isRequired on the variable.
export default defineHealthCheck({
  universalIdentifier: HEALTH_CHECK_UNIVERSAL_IDENTIFIER,
  name: 'health-check',
  handler: async () => {
    const apiKey = process.env.ASYNTAI_API_KEY?.trim();
    if (!apiKey) {
      return { status: 'OK' };
    }

    try {
      await new AsyntaiClient({ apiKey }).getAccount();
      return { status: 'OK' };
    } catch (error) {
      if (error instanceof AsyntaiError && error.status === 401) {
        return {
          status: 'ERROR',
          title: 'Asyntai does not accept this API key',
          description: 'In Asyntai, open Settings, then API, copy the key, and paste it here.',
          action: { label: 'Change the key', location: '#variables' },
        };
      }
      if (error instanceof AsyntaiError && error.status === 403) {
        return {
          status: 'WARNING',
          title: 'Your Asyntai plan has no API access',
          description: 'The Asyntai API needs the Starter plan or higher. Upgrade at asyntai.com/pricing/.',
        };
      }
      throw error;
    }
  },
});
