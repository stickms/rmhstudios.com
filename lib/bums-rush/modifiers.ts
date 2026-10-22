/** Party modifiers for unranked rooms: lobby toggles that bend the engine's tuning table. */
export interface PartyModifiers {
  lowGravity: boolean;
  stickyHands: boolean;
  giantHeads: boolean;
}

export const MODIFIER_KEYS = ['lowGravity', 'stickyHands', 'giantHeads'] as const;

export const NO_MODIFIERS: PartyModifiers = {
  lowGravity: false,
  stickyHands: false,
  giantHeads: false,
};

export const MODIFIER_TUNING = {
  /** Gravity multiplier. */
  LOW_GRAVITY: 0.45,
  /** Grip break-force multiplier: hands hold on far longer. */
  STICKY_GRIP: 2.6,
  /** Head radius multiplier. */
  GIANT_HEAD: 1.5,
} as const;

export function anyModifier(m: PartyModifiers | null | undefined): boolean {
  return !!m && (m.lowGravity || m.stickyHands || m.giantHeads);
}
