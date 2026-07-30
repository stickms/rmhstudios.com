/**
 * The Choir of Saints.
 *
 * Three stalls — nave, transept, apse — and twelve saints who will take any of
 * them. The nave gives a saint their full strength, the transept about half,
 * the apse a quarter. Most saints ask for something in return, so a choir is a
 * shape you commit to rather than a list of bonuses you accumulate.
 *
 * Re-seating costs an escalating cooldown, which is the whole mechanic: this is
 * a slot you re-plan around what you are doing this week, not a dial you turn
 * every five minutes.
 */
import type { ChoirState, SaintDef, SaintEffect, SaintId } from '../types';

/** How much of a saint's listed effect each stall grants. */
export const STALL_SHARE = [1, 0.5, 0.25];

export const STALL_NAMES = ['Nave', 'Transept', 'Apse'];

export const SAINTS: SaintDef[] = [
  {
    id: 'perpetua',
    name: 'Perpetua',
    epithet: 'of the Kept Vigil',
    icon: '🕯️',
    effects: [
      {
        description: 'Joy per second ×3, but offerings by hand count for a tenth.',
        jpsMultiplier: 3,
        touchMultiplier: 0.1,
      },
      { description: 'Joy per second ×2, offerings ×0.3.', jpsMultiplier: 2, touchMultiplier: 0.3 },
      {
        description: 'Joy per second ×1.5, offerings ×0.6.',
        jpsMultiplier: 1.5,
        touchMultiplier: 0.6,
      },
    ],
  },
  {
    id: 'anselm',
    name: 'Anselm',
    epithet: 'of the Open Hand',
    icon: '🤲',
    effects: [
      {
        description: 'Offerings ×15, but joy per second ×0.5.',
        touchMultiplier: 15,
        jpsMultiplier: 0.5,
      },
      {
        description: 'Offerings ×7, joy per second ×0.75.',
        touchMultiplier: 7,
        jpsMultiplier: 0.75,
      },
      { description: 'Offerings ×3, joy per second ×0.9.', touchMultiplier: 3, jpsMultiplier: 0.9 },
    ],
  },
  {
    id: 'lucia',
    name: 'Lucia',
    epithet: 'of the Watchful Light',
    icon: '👁️',
    effects: [
      {
        description: 'Halos come twice as often and hit twice as hard.',
        haloFrequency: 2,
        haloPotency: 2,
      },
      {
        description: 'Halos come 50% more often, 50% stronger.',
        haloFrequency: 1.5,
        haloPotency: 1.5,
      },
      { description: 'Halos come 25% more often.', haloFrequency: 1.25, haloPotency: 1.2 },
    ],
  },
  {
    id: 'thomas',
    name: 'Thomas',
    epithet: 'of Reasonable Doubt',
    icon: '🔍',
    effects: [
      {
        description: 'Manna ripens twice as fast; joy per second ×0.8.',
        mannaSpeed: 2,
        jpsPenalty: 0.8,
      },
      {
        description: 'Manna ripens 60% faster; joy per second ×0.9.',
        mannaSpeed: 1.6,
        jpsPenalty: 0.9,
      },
      { description: 'Manna ripens 30% faster.', mannaSpeed: 1.3 },
    ],
  },
  {
    id: 'hildegard',
    name: 'Hildegard',
    epithet: 'of the Green Growing',
    icon: '🌿',
    effects: [
      { description: 'The garden grows three times as fast.', gardenSpeed: 3 },
      { description: 'The garden grows twice as fast.', gardenSpeed: 2 },
      { description: 'The garden grows 40% faster.', gardenSpeed: 1.4 },
    ],
  },
  {
    id: 'benedict',
    name: 'Benedict',
    epithet: 'of the Ordered Day',
    icon: '📐',
    effects: [
      {
        description: 'Everything ×1.5. No conditions, no cost, no drama.',
        jpsMultiplier: 1.5,
        touchMultiplier: 1.5,
      },
      { description: 'Everything ×1.25.', jpsMultiplier: 1.25, touchMultiplier: 1.25 },
      { description: 'Everything ×1.12.', jpsMultiplier: 1.12, touchMultiplier: 1.12 },
    ],
  },
  {
    id: 'clare',
    name: 'Clare',
    epithet: 'of the Empty Purse',
    icon: '🕊️',
    effects: [
      { description: 'Ascensions grant twice the Grace.', graceGain: 2 },
      { description: 'Ascensions grant 60% more Grace.', graceGain: 1.6 },
      { description: 'Ascensions grant 30% more Grace.', graceGain: 1.3 },
    ],
  },
  {
    id: 'jerome',
    name: 'Jerome',
    epithet: 'of the Difficult Correspondence',
    icon: '✍️',
    effects: [
      {
        description: 'Sinners pay out three times as much. Everyone finds him tiring.',
        sinnerYield: 3,
      },
      { description: 'Sinners pay out twice as much.', sinnerYield: 2 },
      { description: 'Sinners pay out 40% more.', sinnerYield: 1.4 },
    ],
  },
  {
    id: 'cecilia',
    name: 'Cecilia',
    epithet: 'of the Sustained Note',
    icon: '🎼',
    effects: [
      { description: 'Halo blessings last three times as long.', haloPotency: 3 },
      { description: 'Halo blessings last twice as long.', haloPotency: 2 },
      { description: 'Halo blessings last 40% longer.', haloPotency: 1.4 },
    ],
  },
  {
    id: 'francis',
    name: 'Francis',
    epithet: 'of Everything Alive',
    icon: '🐦',
    effects: [
      {
        description: 'The garden grows twice as fast and crops are worth double.',
        gardenSpeed: 2,
        jpsMultiplier: 1.2,
      },
      {
        description: 'The garden grows 50% faster; joy per second ×1.1.',
        gardenSpeed: 1.5,
        jpsMultiplier: 1.1,
      },
      { description: 'The garden grows 25% faster.', gardenSpeed: 1.25 },
    ],
  },
  {
    id: 'catherine',
    name: 'Catherine',
    epithet: 'of the Unbroken Wheel',
    icon: '☸️',
    effects: [
      {
        description: 'Joy per second ×2.5. Manna ripens at half speed.',
        jpsMultiplier: 2.5,
        mannaSpeed: 0.5,
      },
      {
        description: 'Joy per second ×1.8. Manna at 70% speed.',
        jpsMultiplier: 1.8,
        mannaSpeed: 0.7,
      },
      {
        description: 'Joy per second ×1.4. Manna at 85% speed.',
        jpsMultiplier: 1.4,
        mannaSpeed: 0.85,
      },
    ],
  },
  {
    id: 'augustine',
    name: 'Augustine',
    epithet: 'of the Late Arrival',
    icon: '⏳',
    effects: [
      {
        description: 'Everything ×2 — but only counts from the second hour of a run onward.',
        jpsMultiplier: 2,
      },
      { description: 'Everything ×1.6 after the second hour.', jpsMultiplier: 1.6 },
      { description: 'Everything ×1.3 after the second hour.', jpsMultiplier: 1.3 },
    ],
  },
];

export const SAINT_MAP: Record<SaintId, SaintDef> = Object.fromEntries(
  SAINTS.map((s) => [s.id, s]),
) as Record<SaintId, SaintDef>;

export function createChoir(): ChoirState {
  return { unlocked: false, stalls: [null, null, null], cooldown: 0, swaps: 0 };
}

/**
 * Seconds of silence after a re-seating. Grows with use so that a choir is a
 * decision, then quickly plateaus so it never becomes a wall.
 */
export function swapCooldown(swaps: number): number {
  return Math.min(3_600, 60 * Math.pow(1.4, Math.min(swaps, 12)));
}

export interface ChoirEffects {
  jpsMultiplier: number;
  touchMultiplier: number;
  haloFrequency: number;
  haloPotency: number;
  mannaSpeed: number;
  sinnerYield: number;
  gardenSpeed: number;
  graceGain: number;
}

export const NO_CHOIR_EFFECTS: ChoirEffects = {
  jpsMultiplier: 1,
  touchMultiplier: 1,
  haloFrequency: 1,
  haloPotency: 1,
  mannaSpeed: 1,
  sinnerYield: 1,
  gardenSpeed: 1,
  graceGain: 1,
};

/**
 * A multiplier scaled by a stall's share. `1.5` at half share is `1.25`, and
 * `0.5` at half share is `0.75` — penalties soften on the weaker stalls too,
 * which is what makes the apse a good place to park a saint you half want.
 */
function scale(multiplier: number, share: number): number {
  return 1 + (multiplier - 1) * share;
}

/**
 * `runPlaytime` is passed because Augustine only pays after the second hour of
 * a run — a saint who rewards the long sitting rather than the fast restart.
 */
export function choirEffects(choir: ChoirState, runPlaytime: number): ChoirEffects {
  if (!choir.unlocked) return NO_CHOIR_EFFECTS;
  const out: ChoirEffects = { ...NO_CHOIR_EFFECTS };

  choir.stalls.forEach((saintId, stall) => {
    if (!saintId) return;
    const saint = SAINT_MAP[saintId];
    if (!saint) return;
    if (saintId === 'augustine' && runPlaytime < 7_200) return;

    const share = STALL_SHARE[stall]!;
    const effect: SaintEffect = saint.effects[stall]!;

    if (effect.jpsMultiplier) out.jpsMultiplier *= scale(effect.jpsMultiplier, share);
    if (effect.jpsPenalty) out.jpsMultiplier *= scale(effect.jpsPenalty, share);
    if (effect.touchMultiplier) out.touchMultiplier *= scale(effect.touchMultiplier, share);
    if (effect.haloFrequency) out.haloFrequency *= scale(effect.haloFrequency, share);
    if (effect.haloPotency) out.haloPotency *= scale(effect.haloPotency, share);
    if (effect.mannaSpeed) out.mannaSpeed *= scale(effect.mannaSpeed, share);
    if (effect.sinnerYield) out.sinnerYield *= scale(effect.sinnerYield, share);
    if (effect.gardenSpeed) out.gardenSpeed *= scale(effect.gardenSpeed, share);
    if (effect.graceGain) out.graceGain *= scale(effect.graceGain, share);
  });

  return out;
}
