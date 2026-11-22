import { describe, expect, it } from 'vitest';
import {
  BUILDINGS,
  BUILDING_IDS,
  CROPS,
  CROP_IDS,
  ITEMS,
  ITEM_IDS,
  RECIPES,
  buildingSchema,
  cropSchema,
  itemSchema,
} from '..';

describe('hearthworks content tables', () => {
  it('validates every table row against its schema', () => {
    for (const id of ITEM_IDS) expect(() => itemSchema.parse(ITEMS[id])).not.toThrow();
    for (const id of CROP_IDS) expect(() => cropSchema.parse(CROPS[id])).not.toThrow();
    for (const id of BUILDING_IDS) expect(() => buildingSchema.parse(BUILDINGS[id])).not.toThrow();
  });

  it('only references item ids that exist', () => {
    for (const crop of Object.values(CROPS)) expect(ITEMS[crop.yieldItem]).toBeDefined();
    for (const r of Object.values(RECIPES)) {
      expect(ITEMS[r.output]).toBeDefined();
      for (const id of Object.keys(r.inputs)) expect(ITEMS[id as keyof typeof ITEMS]).toBeDefined();
    }
  });

  it('prices a cooked item above the raw items that make it', () => {
    for (const r of Object.values(RECIPES)) {
      const rawValue = Object.entries(r.inputs).reduce(
        (sum, [id, n]) => sum + ITEMS[id as keyof typeof ITEMS].price * (n ?? 0),
        0,
      );
      expect(ITEMS[r.output].price * r.outputQty).toBeGreaterThan(rawValue);
    }
  });

  it('makes every crop worth planting: yield value beats the seed', () => {
    for (const crop of Object.values(CROPS)) {
      expect(ITEMS[crop.yieldItem].price * crop.yieldQty).toBeGreaterThan(crop.seedPrice);
    }
  });
});
