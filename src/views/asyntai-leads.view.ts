import {
  defineView,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
  ViewFilterOperand,
  ViewSortDirection,
} from 'twenty-sdk/define';

import {
  CHAT_COUNT_FIELD_UNIVERSAL_IDENTIFIER,
  CHAT_PAGE_FIELD_UNIVERSAL_IDENTIFIER,
  LAST_CHAT_AT_FIELD_UNIVERSAL_IDENTIFIER,
  LEADS_VIEW_COUNT_FIELD_UNIVERSAL_IDENTIFIER,
  LEADS_VIEW_EMAILS_FIELD_UNIVERSAL_IDENTIFIER,
  LEADS_VIEW_FILTER_UNIVERSAL_IDENTIFIER,
  LEADS_VIEW_LAST_CHAT_FIELD_UNIVERSAL_IDENTIFIER,
  LEADS_VIEW_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  LEADS_VIEW_PAGE_FIELD_UNIVERSAL_IDENTIFIER,
  LEADS_VIEW_PHONES_FIELD_UNIVERSAL_IDENTIFIER,
  LEADS_VIEW_SORT_UNIVERSAL_IDENTIFIER,
  LEADS_VIEW_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

const PERSON = STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person;

// Every person the chatbot brought in, newest chat first.
export default defineView({
  universalIdentifier: LEADS_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Asyntai leads',
  objectUniversalIdentifier: PERSON.universalIdentifier,
  icon: 'IconMessageChatbot',
  position: 0,
  fields: [
    {
      universalIdentifier: LEADS_VIEW_NAME_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier: PERSON.fields.name.universalIdentifier,
      position: 0,
      isVisible: true,
      size: 200,
    },
    {
      universalIdentifier: LEADS_VIEW_EMAILS_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier: PERSON.fields.emails.universalIdentifier,
      position: 1,
      isVisible: true,
      size: 220,
    },
    {
      universalIdentifier: LEADS_VIEW_PHONES_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier: PERSON.fields.phones.universalIdentifier,
      position: 2,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: LEADS_VIEW_LAST_CHAT_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier: LAST_CHAT_AT_FIELD_UNIVERSAL_IDENTIFIER,
      position: 3,
      isVisible: true,
      size: 170,
    },
    {
      universalIdentifier: LEADS_VIEW_COUNT_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier: CHAT_COUNT_FIELD_UNIVERSAL_IDENTIFIER,
      position: 4,
      isVisible: true,
      size: 120,
    },
    {
      universalIdentifier: LEADS_VIEW_PAGE_FIELD_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier: CHAT_PAGE_FIELD_UNIVERSAL_IDENTIFIER,
      position: 5,
      isVisible: true,
      size: 260,
    },
  ],
  filters: [
    {
      universalIdentifier: LEADS_VIEW_FILTER_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier: LAST_CHAT_AT_FIELD_UNIVERSAL_IDENTIFIER,
      operand: ViewFilterOperand.IS_NOT_EMPTY,
      value: '',
    },
  ],
  sorts: [
    {
      universalIdentifier: LEADS_VIEW_SORT_UNIVERSAL_IDENTIFIER,
      fieldMetadataUniversalIdentifier: LAST_CHAT_AT_FIELD_UNIVERSAL_IDENTIFIER,
      direction: ViewSortDirection.DESC,
    },
  ],
});
