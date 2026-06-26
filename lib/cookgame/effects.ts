import type { Product, AdditiveId, EffectId } from './types';
import { ADDITIVES, BASES, EFFECTS, TRANSFORM_RULES, MAX_EFFECTS } from './content';

export function mix(product: Product, additiveId: AdditiveId): Product {
  const snapshot = [...product.effects];
  const rules = TRANSFORM_RULES.filter((r) => r.additive === additiveId);

  // Apply transforms reading from the snapshot, writing into result.
  let result: EffectId[] = snapshot.map((e) => {
    const rule = rules.find((r) => r.from === e);
    return rule ? rule.to : e;
  });

  // Add the additive's base effect.
  const baseEffect = ADDITIVES[additiveId].baseEffect;
  if (!result.includes(baseEffect)) result.push(baseEffect);

  // De-dupe, keep first occurrence.
  result = result.filter((e, i) => result.indexOf(e) === i);

  // Cap: drop lowest tier first (later index breaks ties).
  while (result.length > MAX_EFFECTS) {
    let dropIdx = 0;
    let dropTier = EFFECTS[result[0]].tier;
    for (let i = 1; i < result.length; i++) {
      if (EFFECTS[result[i]].tier <= dropTier) { dropTier = EFFECTS[result[i]].tier; dropIdx = i; }
    }
    result.splice(dropIdx, 1);
  }

  return { baseId: product.baseId, effects: result, qualityMult: product.qualityMult };
}

export function productValue(product: Product): number {
  const base = BASES[product.baseId].baseValue;
  const mult = product.effects.reduce((acc, e) => acc * EFFECTS[e].multiplier, 1);
  return Math.round(base * mult * (product.qualityMult ?? 1));
}

export function effectSetKey(effects: EffectId[]): string {
  return [...effects].sort().join('+');
}
