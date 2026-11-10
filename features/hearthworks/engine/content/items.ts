import { z } from 'zod';

/** Every item that can sit in an inventory. Prices are what a stall pays, in in-game money. */
export const ITEM_IDS = [
  'wheat',
  'corn',
  'tomato',
  'pumpkin',
  'berries',
  'herbs',
  'mushroom',
  'flour',
  'bread',
  'stew',
  'jam',
  'mystery-tonic',
  'alley-stew',
] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export const itemSchema = z.object({
  name: z.string().min(1),
  /** What a stall pays per unit. */
  price: z.number().int().positive(),
  /** Back-alley goods: no stall will buy them, so they can only be hustled (see world/crime.ts). */
  contraband: z.boolean().optional(),
});
export type ItemDef = z.infer<typeof itemSchema>;

export const ITEMS: Record<ItemId, ItemDef> = {
  wheat: { name: 'Wheat', price: 4 },
  corn: { name: 'Corn', price: 6 },
  tomato: { name: 'Tomato', price: 7 },
  pumpkin: { name: 'Pumpkin', price: 14 },
  berries: { name: 'Wild berries', price: 5 },
  herbs: { name: 'Forest herbs', price: 4 },
  mushroom: { name: 'Mushroom', price: 9 },
  flour: { name: 'Flour', price: 16 },
  bread: { name: 'Bread', price: 40 },
  stew: { name: 'Hearty stew', price: 46 },
  jam: { name: 'Berry jam', price: 28 },
  'mystery-tonic': { name: 'Mystery tonic', price: 100, contraband: true },
  'alley-stew': { name: 'Back-alley stew', price: 90, contraband: true },
};

export const isItemId = (v: unknown): v is ItemId =>
  typeof v === 'string' && (ITEM_IDS as readonly string[]).includes(v);
