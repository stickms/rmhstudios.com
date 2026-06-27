import type { Effect, Additive, Base, Input, TransformRule, Buyer, EffectId, AdditiveId, BaseId, InputId } from './types';

export const MAX_EFFECTS = 8 as const;

export const EFFECTS: Record<EffectId, Effect> = {
  energizing: { id: 'energizing', name: 'Energizing', multiplier: 1.2, tier: 1, color: '#fbbf24' },
  calming:    { id: 'calming',    name: 'Calming',    multiplier: 1.2, tier: 1, color: '#60a5fa' },
  gingeritis: { id: 'gingeritis', name: 'Gingeritis', multiplier: 1.3, tier: 1, color: '#f97316' },
  sneaky:     { id: 'sneaky',     name: 'Sneaky',     multiplier: 1.35, tier: 2, color: '#a3a3a3' },
  spicy:      { id: 'spicy',      name: 'Spicy',      multiplier: 1.4, tier: 2, color: '#ef4444' },
  euphoric:   { id: 'euphoric',   name: 'Euphoric',   multiplier: 1.6, tier: 2, color: '#e879f9' },
  focused:    { id: 'focused',    name: 'Focused',    multiplier: 1.5, tier: 2, color: '#22d3ee' },
  jittery:    { id: 'jittery',    name: 'Jittery',    multiplier: 0.9, tier: 1, color: '#84cc16' }, // a downside effect
  glowing:    { id: 'glowing',    name: 'Glowing',    multiplier: 1.8, tier: 3, color: '#34d399' },
  sedating:   { id: 'sedating',   name: 'Sedating',   multiplier: 1.45, tier: 2, color: '#818cf8' },
};

export const ADDITIVES: Record<AdditiveId, Additive> = {
  cuke:        { id: 'cuke',        name: 'Cuke',         cost: 2, baseEffect: 'energizing' },
  banana:      { id: 'banana',      name: 'Banana',       cost: 2, baseEffect: 'gingeritis' },
  paracetamol: { id: 'paracetamol', name: 'Paracetamol',  cost: 3, baseEffect: 'sneaky' },
  chili:       { id: 'chili',       name: 'Chili',        cost: 3, baseEffect: 'spicy' },
  mouthwash:   { id: 'mouthwash',   name: 'Mouthwash',    cost: 4, baseEffect: 'calming' },
  battery:     { id: 'battery',     name: 'Battery',      cost: 5, baseEffect: 'euphoric' },
  donut:       { id: 'donut',       name: 'Donut',        cost: 3, baseEffect: 'focused' },
  energydrink: { id: 'energydrink', name: 'Energy Drink', cost: 4, baseEffect: 'jittery' },
};

export const BASES: Record<BaseId, Base> = {
  greenstart:  { id: 'greenstart',  name: 'Green Start',  baseValue: 35 },
  couchlock:   { id: 'couchlock',   name: 'Couch-Lock',   baseValue: 55, bonusEffect: 'sedating' },
  zoomhaze:    { id: 'zoomhaze',    name: 'Zoom Haze',    baseValue: 60, bonusEffect: 'focused' },
  glimmerdust: { id: 'glimmerdust', name: 'Glimmer Dust', baseValue: 95, bonusEffect: 'glowing' },
};

export const INPUTS: Record<InputId, Input> = {
  seed_couchlock: { id: 'seed_couchlock', name: 'Couch-Lock Seeds', cost: 6 },
  seed_zoomhaze:  { id: 'seed_zoomhaze',  name: 'Zoom Haze Seeds',  cost: 6 },
  nutrient:       { id: 'nutrient',       name: 'Nutrient Mix',     cost: 3 },
  reagent:        { id: 'reagent',        name: 'Reagent Pack',     cost: 15 },
};

// growable strains keyed by their base id
export const GROWABLE: Record<string, { baseId: BaseId; seedId: InputId }> = {
  couchlock: { baseId: 'couchlock', seedId: 'seed_couchlock' },
  zoomhaze:  { baseId: 'zoomhaze',  seedId: 'seed_zoomhaze' },
};

export const COOKABLE_BASES: BaseId[] = ['glimmerdust'];

// Mixing `additive` into a product carrying `from` flips it to `to`.
export const TRANSFORM_RULES: TransformRule[] = [
  { additive: 'battery',     from: 'energizing', to: 'glowing' },
  { additive: 'battery',     from: 'jittery',    to: 'euphoric' },
  { additive: 'mouthwash',   from: 'spicy',      to: 'sedating' },
  { additive: 'donut',       from: 'jittery',    to: 'focused' },
  { additive: 'chili',       from: 'calming',    to: 'spicy' },
  { additive: 'cuke',        from: 'sedating',   to: 'energizing' },
  { additive: 'paracetamol', from: 'spicy',      to: 'sneaky' },
  { additive: 'banana',      from: 'sneaky',     to: 'gingeritis' },
  { additive: 'donut',       from: 'calming',    to: 'focused' },
  { additive: 'battery',     from: 'focused',    to: 'glowing' },
  { additive: 'mouthwash',   from: 'jittery',    to: 'calming' },
  { additive: 'chili',       from: 'sneaky',     to: 'spicy' },
];

export const BUYERS: Buyer[] = [
  { id: 'doug',  name: 'Doug',  preferredEffect: 'energizing', preferenceBonus: 0.25, basePriceFactor: 0.9 },
  { id: 'kim',   name: 'Kim',   preferredEffect: 'euphoric',   preferenceBonus: 0.3,  basePriceFactor: 1.0 },
  { id: 'pablo', name: 'Pablo', preferredEffect: 'glowing',    preferenceBonus: 0.4,  basePriceFactor: 1.1 },
  { id: 'marcus', name: 'Marcus', preferredEffect: 'focused',  preferenceBonus: 0.35, basePriceFactor: 1.2 },
  { id: 'vera',   name: 'Vera',   preferredEffect: 'glowing',  preferenceBonus: 0.4,  basePriceFactor: 1.3 },
  { id: 'silas',  name: 'Silas',  preferredEffect: 'euphoric', preferenceBonus: 0.45, basePriceFactor: 1.45 },
];

export const getEffect = (id: EffectId): Effect => EFFECTS[id];
export const getAdditive = (id: AdditiveId): Additive => ADDITIVES[id];
export const getBase = (id: BaseId): Base => BASES[id];
export const getInput = (id: InputId): Input => INPUTS[id];
