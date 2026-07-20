/**
 * Post awards — client-safe catalog + zod (§7 of
 * docs/plans/2026-07-20-parity-qol-customization-design.md).
 *
 * Awards are a coin sink with public output: the giver spends `priceCoins`, the
 * recipient gets `recipientShareBps` of it (basis points), and the remainder is
 * the platform cut (net burn). No new CoinTxnType — see lib/awards/awards.server.ts.
 */
import { z } from 'zod';

export interface AwardDef {
  id: string;
  name: string;
  emoji: string;
  priceCoins: number;
  /** Recipient share in basis points (6000 = 60%). */
  recipientShareBps: number;
}

export const AWARD_CATALOG: AwardDef[] = [
  { id: 'bronze', name: 'Bronze', emoji: '🥉', priceCoins: 100, recipientShareBps: 6000 },
  { id: 'silver', name: 'Silver', emoji: '🥈', priceCoins: 250, recipientShareBps: 6000 },
  { id: 'gold', name: 'Gold', emoji: '🥇', priceCoins: 500, recipientShareBps: 6000 },
  { id: 'star', name: 'Star', emoji: '⭐', priceCoins: 150, recipientShareBps: 6000 },
  { id: 'heart', name: 'Heart', emoji: '❤️', priceCoins: 120, recipientShareBps: 6000 },
  { id: 'rocket', name: 'Rocket', emoji: '🚀', priceCoins: 300, recipientShareBps: 6000 },
];

const AWARD_MAP = new Map(AWARD_CATALOG.map((a) => [a.id, a]));
export function getAward(id: string): AwardDef | null {
  return AWARD_MAP.get(id) ?? null;
}

export const AWARD_ENTITY_TYPES = ['rmhark', 'comment', 'build', 'guide'] as const;
export type AwardEntityType = (typeof AWARD_ENTITY_TYPES)[number];

export const giveAwardSchema = z.object({
  awardId: z.string().min(1).max(32),
  entityType: z.enum(AWARD_ENTITY_TYPES),
  entityId: z.string().min(1).max(64),
  anonymous: z.boolean().optional(),
});

export type GiveAwardInput = z.infer<typeof giveAwardSchema>;

/** Recipient share (floored) for an award price. */
export function recipientShare(def: AwardDef): number {
  return Math.floor((def.priceCoins * def.recipientShareBps) / 10000);
}

/** A grouped award summary for rendering the badge row. */
export interface AwardGroup {
  awardId: string;
  count: number;
}
