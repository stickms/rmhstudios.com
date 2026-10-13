/** Bracket pick'em (E5) — pure rules, client-safe. No stakes: points only. */

export const PICK_ROLES = {
  CHAMPION: { slots: 1, points: 8, maxPlacement: 1 },
  FINALIST: { slots: 1, points: 4, maxPlacement: 2 },
  SEMI: { slots: 2, points: 2, maxPlacement: 4 },
} as const;
export type PickRole = keyof typeof PICK_ROLES;
export const PICK_ROLE_LIST = Object.keys(PICK_ROLES) as PickRole[];

export interface PickInput {
  role: PickRole;
  entrantId: string;
}

/** An error message, or null when the set is a legal pick'em card. */
export function validatePicks(picks: readonly PickInput[]): string | null {
  const seen = new Set<string>();
  const used: Record<string, number> = {};
  for (const p of picks) {
    if (!(p.role in PICK_ROLES)) return 'Unknown pick';
    if (seen.has(p.entrantId)) return 'Each player can only be picked once';
    seen.add(p.entrantId);
    used[p.role] = (used[p.role] ?? 0) + 1;
    if (used[p.role] > PICK_ROLES[p.role].slots) return 'Too many picks for a slot';
  }
  return null;
}

/** Points for one pick given the entrant's final placement (null = unplaced). */
export function pickPoints(role: PickRole, placement: number | null): number {
  const r = PICK_ROLES[role];
  return placement != null && placement <= r.maxPlacement ? r.points : 0;
}

export const MAX_PICK_POINTS = PICK_ROLE_LIST.reduce(
  (s, k) => s + PICK_ROLES[k].points * PICK_ROLES[k].slots,
  0,
);
