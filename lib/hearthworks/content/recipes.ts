import type { ItemId } from './items';

export interface RecipeDef {
  name: string;
  inputs: Partial<Record<ItemId, number>>;
  output: ItemId;
  outputQty: number;
}

/** Cooked at a kitchen. Kept small in v1; effect-stacking arrives with the trade layer. */
export const RECIPES: Record<string, RecipeDef> = {
  flour: { name: 'Mill flour', inputs: { wheat: 3 }, output: 'flour', outputQty: 1 },
  bread: { name: 'Bake bread', inputs: { flour: 2 }, output: 'bread', outputQty: 1 },
  stew: { name: 'Hearty stew', inputs: { tomato: 2, herbs: 1, mushroom: 1 }, output: 'stew', outputQty: 1 },
  jam: { name: 'Berry jam', inputs: { berries: 3 }, output: 'jam', outputQty: 1 },
};
