/** Client-safe shapes of the `/api/chats/$kind/$id/meta` response. */

export interface PinView {
  messageId: string;
  text: string;
  hasMedia: boolean;
  senderId: string;
  senderName: string | null;
  createdAt: string;
  pinnedById: string;
}

export interface ChatMeta {
  disappearAfterSec: number | null;
  themeKey: string | null;
  isSelf: boolean;
  prefs: { hideReceipts: boolean; hideTyping: boolean };
  pins: PinView[];
}
