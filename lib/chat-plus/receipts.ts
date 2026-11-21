/**
 * Read receipts and typing, pure part (sprint 06 #17).
 *
 * The effective value for a conversation is computed, never stored: it is OFF when either participant has the
 * account switch off or has that conversation's switch off. Turning an account switch back on therefore restores
 * each conversation's own choice, because no `ConversationPref` row is ever rewritten.
 */

export interface ParticipantReceiptPrefs {
  /** `UserProfile.readReceipts` (account-wide, default on). */
  accountReceipts: boolean;
  /** `UserProfile.typingIndicators` (account-wide, default on). */
  accountTyping: boolean;
  /** `ConversationPref.hideReceipts` for this conversation. */
  hideReceipts: boolean;
  /** `ConversationPref.hideTyping` for this conversation. */
  hideTyping: boolean;
}

export const DEFAULT_RECEIPT_PREFS: ParticipantReceiptPrefs =
  {
    accountReceipts: true,
    accountTyping: true,
    hideReceipts: false,
    hideTyping: false,
  };

/** Whether one participant has receipts / typing off, from the account switch or the conversation's. */
export function hiddenBy(
  p: ParticipantReceiptPrefs,
): {
  receipts: boolean;
  typing: boolean;
} {
  return {
    receipts:
      !p.accountReceipts ||
      p.hideReceipts,
    typing:
      !p.accountTyping ||
      p.hideTyping,
  };
}

/** Reciprocal: hidden for the pair when either participant has it off. */
export function effectiveHidden(
  a: ParticipantReceiptPrefs,
  b: ParticipantReceiptPrefs,
): {
  receipts: boolean;
  typing: boolean;
} {
  const x =
    hiddenBy(
      a,
    );
  const y =
    hiddenBy(
      b,
    );
  return {
    receipts:
      x.receipts ||
      y.receipts,
    typing:
      x.typing ||
      y.typing,
  };
}

/**
 * Every server path that returns a direct message's `read` flag to its sender, or publishes a read or typing event.
 * Each must take its answer from `@/lib/chat-plus/receipts.server`. `read-receipt-read-paths.test.ts` reads these
 * files, and fails any other file under `lib/` or `app/routes/` that selects `read` on `chatMessage` for a
 * conversation list or message page without being named here.
 */
export const READ_RECEIPT_READ_PATHS =
  [
    'lib/messages/api/messages.$conversationId.server.ts',
    'lib/messages/api/messages.$conversationId.read.server.ts',
    'lib/messages/api/messages.$conversationId.typing.server.ts',
    'lib/messages/api/messages.search.server.ts',
    'lib/messages/mutations.server.ts',
    'lib/messages.server.ts',
  ] as const;
