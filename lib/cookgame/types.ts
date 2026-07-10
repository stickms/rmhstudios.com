import type { TimeWindow } from './timeOfDay';

export type EffectId =
  | 'energizing' | 'calming' | 'gingeritis' | 'sneaky' | 'spicy'
  | 'euphoric' | 'focused' | 'jittery' | 'glowing' | 'sedating';
export type AdditiveId =
  | 'cuke' | 'banana' | 'paracetamol' | 'chili' | 'mouthwash'
  | 'battery' | 'donut' | 'energydrink';
export type BaseId = 'greenstart' | 'couchlock' | 'zoomhaze' | 'glimmerdust';
export type InputId = 'seed_couchlock' | 'seed_zoomhaze' | 'nutrient' | 'reagent';
export type BuyerId = 'doug' | 'kim' | 'pablo' | 'marcus' | 'vera' | 'silas';
export type GrowStage = 'empty' | 'seedling' | 'vegetative' | 'flowering';

export interface Effect { id: EffectId; name: string; multiplier: number; tier: 1 | 2 | 3; color: string; }
export interface Additive { id: AdditiveId; name: string; cost: number; baseEffect: EffectId; }
export interface Base { id: BaseId; name: string; baseValue: number; bonusEffect?: EffectId; }
export interface Input { id: InputId; name: string; cost: number; }
export interface TransformRule { additive: AdditiveId; from: EffectId; to: EffectId; }
export interface Buyer {
  id: BuyerId; name: string; preferredEffect: EffectId;
  preferenceBonus: number;   // multiplicative bonus when product has preferredEffect, e.g. 0.25 = +25%
  basePriceFactor: number;   // baseline willingness, e.g. 0.9
  timeWindow?: TimeWindow;   // when set, this buyer only deals during the window (M4)
}

export interface BuyerDynamicState { demand: number; reputation: number; preferredEffect: EffectId; }

export interface Product { baseId: BaseId; effects: EffectId[]; qualityMult?: number; }

export interface PlotState {
  baseId: BaseId | null;        // strain being grown (null when empty)
  stage: GrowStage;
  plantedAt: number | null;     // ms epoch
  lastAdvancedAt: number | null;// ms epoch when current stage began (cooldown anchor)
  careAccum: number;            // accumulated care credit
}
export interface WetBatch { baseId: BaseId; quality: number; dryStartedAt: number; }
export interface BaseStockEntry { baseId: BaseId; qualityMult: number; bonusEffects: EffectId[]; units: number; }
export interface CookSession { baseId: BaseId; target: number[]; dials: number[]; }

export interface RecipeMeta { name?: string; favorite?: boolean; bestValue?: number }

export interface InventoryState {
  additives: Record<string, number>;
  inputs: Record<string, number>;
  baseStock: BaseStockEntry[];
  plots: PlotState[];
  dryingRack: WetBatch[];
  workProduct: Product | null;
  packaged: Array<{ product: Product; units: number }>;
}
