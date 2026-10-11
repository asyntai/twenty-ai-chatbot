import { defineApplication } from 'twenty-sdk/define';

import {
  API_KEY_VARIABLE_UNIVERSAL_IDENTIFIER,
  APP_DESCRIPTION,
  APP_DISPLAY_NAME,
  APPLICATION_UNIVERSAL_IDENTIFIER,
  WEBSITE_VARIABLE_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: APP_DISPLAY_NAME,
  description: APP_DESCRIPTION,
  applicationVariables: {
    ASYNTAI_API_KEY: {
      universalIdentifier: API_KEY_VARIABLE_UNIVERSAL_IDENTIFIER,
      label: 'Asyntai API key',
      description:
        'In Asyntai, open Settings, then API, and copy your key. Needs the Starter plan or higher.',
      isSecret: true,
      isRequired: true,
    },
    ASYNTAI_WEBSITE: {
      universalIdentifier: WEBSITE_VARIABLE_UNIVERSAL_IDENTIFIER,
      label: 'Website',
      description:
        'Optional. Bring in leads from one website only, for example example.com. Leave it empty to bring in leads from all your websites.',
      isSecret: false,
      value: '',
    },
  },
  author: 'Asyntai',
  logo: 'public/logo.png',
  galleryImages: [
    'public/gallery-1.png',
    'public/gallery-2.png',
    'public/gallery-3.png',
  ],
  websiteUrl: 'https://asyntai.com/documentation/integrations/twenty/',
  termsUrl: 'https://asyntai.com/terms-and-conditions/',
  emailSupport: 'hello@asyntai.com',
  issueReportUrl: 'https://asyntai.com/contact/',
});
