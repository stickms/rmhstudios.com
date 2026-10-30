/**
 * Card trade offers as pure rules: what makes an offer well-formed and when it expires.
 * Client-safe. The server module applies them under locks; see
 * docs/superpowers/specs/2026-10-30-card-trades-design.md.
 */

import { SET_SIZE } from '@/lib/cards/cards';

export const TRADE_TTL_DAYS = 14;
export const MAX_CARDS_PER_SIDE = 6;
export const MAX_QTY_PER_CARD = 10;
export const MAX_PENDING_PER_PROPOSER = 20;

export type OfferItem = { gameId: string; cardIndex: number; foil: boolean; qty: number };
export type OfferCheck = 'ok' | 'empty' | 'bad-item' | 'duplicate' | 'too-many';

const keyOf = (i: OfferItem) => `${i.gameId}|${i.cardIndex}|${i.foil}`;

function checkSide(items: readonly OfferItem[]): OfferCheck {
  if (items.length > MAX_CARDS_PER_SIDE) return 'too-many';
  const seen = new Set<string>();
  for (const i of items) {
    if (!Number.isInteger(i.qty) || i.qty < 1 || i.qty > MAX_QTY_PER_CARD) return 'bad-item';
    if (!Number.isInteger(i.cardIndex) || i.cardIndex < 0 || i.cardIndex >= SET_SIZE) return 'bad-item';
    const k = keyOf(i);
    if (seen.has(k)) return 'duplicate';
    seen.add(k);
  }
  return 'ok';
}

/** Whether an offer is well-formed (title validity and ownership are checked by the server). */
export function validateOffer(offer: {
  give: readonly OfferItem[];
  ask: readonly OfferItem[];
}): OfferCheck {
  if (offer.give.length === 0 && offer.ask.length === 0) return 'empty';
  const a = checkSide(offer.give);
  if (a !== 'ok') return a;
  return checkSide(offer.ask);
}

export function expiresAtFrom(now: Date): Date {
  return new Date(now.getTime() + TRADE_TTL_DAYS * 86_400_000);
}

export function isExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}
