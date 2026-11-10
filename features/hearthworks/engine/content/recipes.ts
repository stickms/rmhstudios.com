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
  // The back-alley trade (an underground cooking trade, kept pure fiction): worth far more, but only on the street.
  tonic: { name: 'Brew mystery tonic', inputs: { herbs: 2, mushroom: 2 }, output: 'mystery-tonic', outputQty: 1 },
  'alley-stew': { name: 'Simmer back-alley stew', inputs: { tomato: 2, mushroom: 1, berries: 1 }, output: 'alley-stew', outputQty: 1 },
};
