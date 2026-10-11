import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  LAST_CHAT_AT_FIELD_NAME,
  LAST_CHAT_AT_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: LAST_CHAT_AT_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  name: LAST_CHAT_AT_FIELD_NAME,
  type: FieldType.DATE_TIME,
  label: 'Last website chat',
  description: 'When this person last chatted with your Asyntai AI chatbot.',
  icon: 'IconMessageChatbot',
  isAuditLogged: false,
});
