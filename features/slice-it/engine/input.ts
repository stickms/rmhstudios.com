/**
 * Slice It — key binding resolution and keyboard diagnostics.
 *
 * `I1` (multiple bindings per lane) and `I9` (ghosting detection). Pure and
 * browser-free apart from the event types, so both are testable without a
 * keyboard.
 */

import type { Keybinds } from './store';

/**
 * Extra keys bound to each lane, beyond the primary in {@link Keybinds}.
 *
 * Indexed by lane. Additive rather than a reshape of `keybinds` on purpose:
 * `{lane1, lane2}` is persisted in every existing player's local storage and
 * read by four call sites, and widening it to arrays would mean a migration
 * that silently drops a binding if it goes wrong. This composes instead.
 *
 * The feature it exists for: alternating two keys on ONE lane is how a fast
 * jack is played, and one-binding-per-lane makes that physically impossible.
 */
export type ExtraBinds = string[][];

/** Every key bound to a lane, primary first. */
export function bindsForLane(
  keybinds: Keybinds,
  extra: ExtraBinds | undefined,
  lane: number,
): string[] {
  const primary = lane === 0 ? keybinds.lane1 : keybinds.lane2;
  const additional = extra?.[lane] ?? [];
  // De-duplicated: binding the primary key again as an "extra" must not make
  // the lane resolve twice or show a duplicate chip in settings.
  return [...new Set([primary, ...additional].filter(Boolean))];
}

/**
 * Which lane a key press belongs to, or `null`.
 *
 * Lane 0 wins a key bound to both. That is a real possibility — settings does
 * not forbid it — and resolving it deterministically here beats letting the
 * order of two `if`s at a call site decide.
 */
export function laneForKey(
  keybinds: Keybinds,
  extra: ExtraBinds | undefined,
  key: string,
): number | null {
  if (bindsForLane(keybinds, extra, 0).includes(key)) return 0;
  if (bindsForLane(keybinds, extra, 1).includes(key)) return 1;
  return null;
}

/**
 * Keys bound to more than one lane.
 *
 * Surfaced in settings rather than prevented: a player mid-rebind may
 * transiently hold a conflict, and refusing the keystroke is more confusing
 * than showing them the clash.
 */
export function conflictingBinds(keybinds: Keybinds, extra?: ExtraBinds): string[] {
  const zero = new Set(bindsForLane(keybinds, extra, 0));
  return bindsForLane(keybinds, extra, 1).filter((key) => zero.has(key));
}

/* ─── I9 — keyboard ghosting ─────────────────────────────────────────────── */

/**
 * Whether a keyboard can report a given set of keys pressed together.
 *
 * There is no API for this. Ghosting is a property of the keyboard's wiring
 * matrix, so it can only be measured empirically: ask the player to hold the
 * bound keys at once and count what arrives.
 *
 * It matters because the failure mode is invisible and reads as a game bug —
 * a membrane keyboard silently drops the third simultaneous key, the player
 * sees a missed note they know they hit, and nothing on screen suggests the
 * hardware.
 */
export interface GhostingResult {
  /** Keys that never arrived while the others were held. */
  missing: string[];
  /** True when every requested key registered. */
  ok: boolean;
}

export function evaluateGhosting(requested: string[], seen: Iterable<string>): GhostingResult {
  const arrived = new Set(seen);
  const missing = requested.filter((key) => !arrived.has(key));
  return { missing, ok: missing.length === 0 };
}

/**
 * Alternative bindings to suggest when a set ghosts.
 *
 * Modifier keys and the arrow cluster are wired on their own rows in almost
 * every matrix, which is exactly why they rarely ghost — so the suggestion is
 * "move one hand to a key that is electrically elsewhere", not "try again".
 */
export const GHOST_SAFE_KEYS = [
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'Space',
  'ArrowLeft',
  'ArrowRight',
] as const;

export function suggestGhostSafe(taken: string[]): string[] {
  const used = new Set(taken);
  return GHOST_SAFE_KEYS.filter((key) => !used.has(key));
}
