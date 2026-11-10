import { z } from 'zod';

/** Request bodies of the /api/games Steam-style endpoints (trades, cards, market, hub, profile). */

const tradeItem = z.object({
  gameId: z.string().min(1).max(64),
  cardIndex: z.number().int().min(0).max(63),
  foil: z.boolean().default(false),
  qty: z.number().int().min(1).max(99),
});

export const proposeTradeBody = z.object({
  toId: z.string().min(1).max(64),
  give: z.array(tradeItem).max(12),
  ask: z.array(tradeItem).max(12),
});

export const tradeActionBody = z.object({ tradeId: z.string().min(1).max(64) });

export const craftBadgeBody = z.object({
  gameId: z.string().min(1).max(64),
  foil: z.boolean().default(false),
});

export const customizeLookBody = z.object({
  background: z.string().max(80).nullable(),
  frame: z.string().max(80).nullable(),
});

export const unpackGemsBody = z.object({
  gameId: z.string().min(1).max(64),
  cardIndex: z.number().int().min(0).max(63),
  foil: z.boolean().default(false),
  qty: z.number().int().min(1).max(99).default(1),
});

export const createHubThreadBody = z.object({
  gameId: z.string().min(1).max(64),
  title: z.string().max(400),
  body: z.string().max(20_000),
});

export const listCardBody = z.object({
  gameId: z.string().min(1).max(64),
  cardIndex: z.number().int().min(0).max(63),
  foil: z.boolean().default(false),
  priceCoins: z.number().int(),
});

export const saveShowcaseBody = z.object({
  achievements: z.array(z.string().max(64)).max(12),
  badges: z.array(z.string().max(80)).max(12),
});
