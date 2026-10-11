import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  CHAT_PAGE_FIELD_NAME,
  CHAT_PAGE_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: CHAT_PAGE_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  name: CHAT_PAGE_FIELD_NAME,
  type: FieldType.LINKS,
  label: 'Chat page',
  description: 'The page of your website where this person last chatted.',
  icon: 'IconWorldWww',
  isAuditLogged: false,
});
