import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProtocolVariant } from './types';

/** One-time run modifier: applied to next run only, then consumed */
export type RunModifierId =
  | 'chaosRun'       // 2x mutation chance, 2x glitch
  | 'glassCannon'    // Start 2 Integrity, your Strikes +1
  | 'probeMaster'    // Probe reveals this round + next round
  | 'doubleDown'     // Both sides' Strikes deal 2 base
  | 'fortress';     // Start 7 Integrity, Charge cap 6

/** Unlock a Protocol variant so it can appear in runs */
export type VariantUnlockId = 'aggressor' | 'defender' | 'chaotic';

const RUN_MODIFIERS: Record<
  RunModifierId,
  { label: string; description: string; cost: number }
> = {
  chaosRun: {
    label: 'Chaos Run',
    description: 'Next run: 2× mutations, Protocol glitches more. Wild ride.',
    cost: 5,
  },
  glassCannon: {
    label: 'Glass Cannon',
    description: 'Next run: Start 2 Integrity, your Strikes deal +1. High risk.',
    cost: 10,
  },
  probeMaster: {
    label: 'Probe Master',
    description: 'Next run: Probe reveals intent for this round and next.',
    cost: 12,
  },
  doubleDown: {
    label: 'Double Down',
    description: 'Next run: All Strikes deal 2 base. Fast and deadly.',
    cost: 8,
  },
  fortress: {
    label: 'Fortress',
    description: 'Next run: Start 7 Integrity, Charge cap 6. Defensive.',
    cost: 10,
  },
};

const VARIANT_UNLOCKS: Record<
  VariantUnlockId,
  { label: string; description: string; cost: number; variant: ProtocolVariant }
> = {
  aggressor: {
    label: 'Unlock: Aggressor',
    description: 'Protocol that favors Strikes can appear in runs.',
    cost: 7,
    variant: 'aggressor',
  },
  defender: {
    label: 'Unlock: Defender',
    description: 'Protocol that favors Block can appear in runs.',
    cost: 7,
    variant: 'defender',
  },
  chaotic: {
    label: 'Unlock: Chaotic',
    description: 'Protocol that glitches often can appear in runs.',
    cost: 7,
    variant: 'chaotic',
  },
};

interface ShopState {
  fragments: number;
  /** Consumed when a run starts */
  pendingRunModifier: RunModifierId | null;
  /** Unlocked protocol variants (default always available) */
  unlockedVariants: ProtocolVariant[];
  awardRun: (roundsSurvived: number, won: boolean) => void;
  purchaseRunModifier: (id: RunModifierId) => boolean;
  purchaseVariantUnlock: (id: VariantUnlockId) => boolean;
  getRunModifiers: () => {
    startCharge: number;
    startIntegrity: number;
    protocolHealth: number;
    protocolVariant: ProtocolVariant;
    runModifier: RunModifierId | null;
  };
  consumeRunModifier: () => void;
}

const START_CHARGE = 3;
const START_INTEGRITY = 5;
const PROTOCOL_HEALTH = 10;

function pickRandomVariant(unlocked: ProtocolVariant[]): ProtocolVariant {
  const pool: ProtocolVariant[] = ['default', ...unlocked];
  return pool[Math.floor(Math.random() * pool.length)] ?? 'default';
}

export const useShopStore = create<ShopState>()(
  persist(
    (set, get) => ({
      fragments: 0,
      pendingRunModifier: null,
      unlockedVariants: [],

      awardRun: (roundsSurvived, won) =>
        set((s) => {
          const earned = roundsSurvived * 1 + (won ? 3 : 0);
          return { fragments: s.fragments + earned };
        }),

      purchaseRunModifier: (id) => {
        const s = get();
        const meta = RUN_MODIFIERS[id];
        if (s.fragments < meta.cost) return false;
        set({ fragments: s.fragments - meta.cost, pendingRunModifier: id });
        return true;
      },

      purchaseVariantUnlock: (id) => {
        const s = get();
        if (s.unlockedVariants.includes(VARIANT_UNLOCKS[id].variant)) return false;
        const cost = VARIANT_UNLOCKS[id].cost;
        if (s.fragments < cost) return false;
        set({
          fragments: s.fragments - cost,
          unlockedVariants: [...s.unlockedVariants, VARIANT_UNLOCKS[id].variant],
        });
        return true;
      },

      getRunModifiers: () => {
        const { pendingRunModifier, unlockedVariants } = get();
        let startCharge = START_CHARGE;
        let startIntegrity = START_INTEGRITY;
        const protocolHealth = PROTOCOL_HEALTH;
        if (pendingRunModifier === 'glassCannon') {
          startIntegrity = 2;
        } else if (pendingRunModifier === 'fortress') {
          startIntegrity = 7;
        }
        if (pendingRunModifier === 'fortress') {
          startCharge = Math.min(6, 6);
        }
        return {
          startCharge,
          startIntegrity,
          protocolHealth,
          protocolVariant: pickRandomVariant(unlockedVariants),
          runModifier: pendingRunModifier,
        };
      },

      consumeRunModifier: () => set({ pendingRunModifier: null }),
    }),
    { name: 'cursed-logic-shop' }
  )
);

export { RUN_MODIFIERS, VARIANT_UNLOCKS };
