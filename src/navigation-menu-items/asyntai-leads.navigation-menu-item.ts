import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  LEADS_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  LEADS_VIEW_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: LEADS_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIER,
  name: 'Asyntai leads',
  icon: 'IconMessageChatbot',
  position: -1,
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: LEADS_VIEW_UNIVERSAL_IDENTIFIER,
});
