/** Deck editors (s11-10), the types the contract and the components share. Client-safe: no server imports. */
import type { DeckEditorStatus } from '@/lib/study/deck-access';

/** One row of the owner's list. */
export interface DeckEditorRow {
  userId: string;
  name: string;
  handle: string | null;
  status: DeckEditorStatus;
  /** When the invitation was sent (ISO). */
  invitedAt: string;
  /** When it was accepted (ISO); null while pending. */
  acceptedAt: string | null;
}

/**
 * What a deck page may say about its editors. The owner reads every row; an editor reads the owner and a count, no
 * names; anyone else reads nothing here (the public page's "with N editors" is on the deck itself).
 */
export type DeckEditorsView =
  | { role: 'owner'; editors: DeckEditorRow[]; max: number }
  | { role: 'editor'; owner: { name: string; handle: string | null }; count: number };

/** A deck the member was invited to edit: the line on the deck page and in `/study`. Never more than this. */
export interface DeckInvitation {
  deckId: string;
  title: string;
  owner: { name: string; handle: string | null };
  /** When the invitation lapses (ISO). */
  expiresAt: string;
}

/** A deck the member edits, for "Shared with you" on `/study`. */
export interface SharedDeckSummary {
  id: string;
  title: string;
  description: string | null;
  cardCount: number;
  /** Cards due today in this deck for the viewer. */
  dueCount: number;
  owner: { name: string; handle: string | null };
}
