import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  CHAT_COUNT_FIELD_NAME,
  CHAT_COUNT_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: CHAT_COUNT_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  name: CHAT_COUNT_FIELD_NAME,
  type: FieldType.NUMBER,
  label: 'Website chats',
  description: 'How many conversations this person had with your Asyntai AI chatbot.',
  icon: 'IconMessages',
  isAuditLogged: false,
});
