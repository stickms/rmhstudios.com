export type EffectId =
  | 'energizing' | 'calming' | 'gingeritis' | 'sneaky' | 'spicy'
  | 'euphoric' | 'focused' | 'jittery' | 'glowing' | 'sedating';
export type AdditiveId =
  | 'cuke' | 'banana' | 'paracetamol' | 'chili' | 'mouthwash'
  | 'battery' | 'donut' | 'energydrink';
export type BaseId = 'greenstart';
export type BuyerId = 'doug' | 'kim' | 'pablo';

export interface Effect { id: EffectId; name: string; multiplier: number; tier: 1 | 2 | 3; color: string; }
export interface Additive { id: AdditiveId; name: string; cost: number; baseEffect: EffectId; }
export interface Base { id: BaseId; name: string; baseValue: number; }
export interface TransformRule { additive: AdditiveId; from: EffectId; to: EffectId; }
export interface Buyer {
  id: BuyerId; name: string; preferredEffect: EffectId;
  preferenceBonus: number;   // multiplicative bonus when product has preferredEffect, e.g. 0.25 = +25%
  basePriceFactor: number;   // baseline willingness, e.g. 0.9
}
export interface Product { baseId: BaseId; effects: EffectId[]; }

export interface InventoryState {
  additives: Record<string, number>;       // additiveId → count owned
  rawBases: Record<string, number>;         // baseId → count of un-mixed base units
  workProduct: Product | null;              // product currently being mixed (on the bench)
  packaged: Array<{ product: Product; units: number }>; // ready-to-sell stacks
}
