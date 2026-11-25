/** Contracts for deck editors (s11-10). Client-safe: request types by `import type`. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { DeckEditorRow, DeckEditorsView } from '@/lib/study/deck-editors';
import type { inviteEditorBody, respondInvitationBody } from '@/lib/study/deck-editors-schema';

/** The deck's editors: every row for the owner, the owner and a count for an editor; 404 for anyone else. */
export const listDeckEditorsApi = endpoint<{
  res: DeckEditorsView;
}>()({
  method: 'GET',
  path: '/api/study/decks/$id/editors',
});

/** Owner only. Invite a member by handle; 201 with their row. A refusal never says why a member is unavailable. */
export const inviteDeckEditorApi = endpoint<{
  body: z.infer<typeof inviteEditorBody>;
  res: { success: true; editor: DeckEditorRow };
}>()({
  method: 'POST',
  path: '/api/study/decks/$id/editors',
});

/** Owner only. Remove an editor, or withdraw a pending invitation. Their reviews and the cards they wrote stay. */
export const removeDeckEditorApi = endpoint<{
  res: { success: true };
}>()({
  method: 'DELETE',
  path: '/api/study/decks/$id/editors/$userId',
});

/** The invitee accepts or declines their own invitation. */
export const respondDeckInvitationApi = endpoint<{
  body: z.infer<typeof respondInvitationBody>;
  res: { success: true; accepted: boolean };
}>()({
  method: 'POST',
  path: '/api/study/decks/$id/invitation',
});

/** An editor leaves a deck. Their reviews stay theirs; the cards they wrote stay in the deck. */
export const leaveDeckApi = endpoint<{
  res: { success: true };
}>()({
  method: 'POST',
  path: '/api/study/decks/$id/leave',
});
