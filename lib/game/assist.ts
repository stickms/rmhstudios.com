/**
 * The cross-game assist layer (P7) — pure and client-safe.
 *
 * ## A promise the repo made to itself
 *
 * `lib/game-capabilities.ts` says, in its own header, that `accessibility` is
 * empty for almost every game and that *"this is not an oversight; the
 * cross-game assist layer has not been built"*. This is that layer.
 *
 * ## The settings
 *
 * Five, chosen because each one is the difference between a game being
 * playable and not for somebody, and because each can be expressed as a
 * modifier a game applies rather than a rewrite:
 *
 *   `holdToPress`   — a held input stands in for repeated mashing
 *   `speedFloor`    — the slowest the game may run its clock, 0.5–1
 *   `calmVisuals`   — suppress flashing, strobing and screen shake
 *   `colorSafe`     — use a palette that does not encode state in hue alone
 *   `noTimedInput`  — remove or extend reaction-time windows
 *
 * ## The hard rule, borrowed from the difficulty director
 *
 * **A run with assists on can never reach a leaderboard.** `lib/game/director.server.ts`
 * established this for adaptive difficulty and the argument is identical: a
 * board that mixes assisted and unassisted runs measures nothing, and choosing
 * silently is how a board stops meaning anything. It is enforced the same way,
 * starting in the type — {@link AssistProfile} is a union discriminated on
 * `ranked`, and the only value with `ranked: true` is {@link NO_ASSISTS}, whose
 * fields are literal types. There is no way to construct an assisted profile
 * that claims to be ranked.
 *
 * ## Why it ships inert
 *
 * Same reason the director does, and it is worth restating rather than
 * inheriting: an assist is applied by the CLIENT. Turning it on for a game
 * whose client ignores it would cost that game's players their leaderboard
 * eligibility in exchange for no assist at all — strictly worse than the
 * status quo. {@link ASSIST_CAPABLE} starts empty. **A game joins it in the
 * same change that teaches its client to honour the settings**, and
 * `lib/game-capabilities.ts` gains the matching `accessibility` entries in that
 * same change, because that file's claims are about code that exists today.
 */

/** Everything a member can ask for. */
export interface AssistSettings {
  holdToPress: boolean;
  /** 1 = full speed. Below 1 slows the game's clock. */
  speedFloor: number;
  calmVisuals: boolean;
  colorSafe: boolean;
  noTimedInput: boolean;
}

export const ASSIST_DEFAULTS: AssistSettings = {
  holdToPress: false,
  speedFloor: 1,
  calmVisuals: false,
  colorSafe: false,
  noTimedInput: false,
};

/** Slowest we will run a game. Below this, most games stop being the game. */
export const MIN_SPEED_FLOOR = 0.5;

/**
 * What a game is handed at run start.
 *
 * Discriminated on `ranked` so the rule lives in the type: the only ranked
 * value is {@link NO_ASSISTS}, and its fields are literals rather than the
 * general types, so no assisted profile can be widened into it.
 */
export type AssistProfile =
  | {
      ranked: true;
      holdToPress: false;
      speedFloor: 1;
      calmVisuals: false;
      colorSafe: false;
      noTimedInput: false;
    }
  | ({ ranked: false } & AssistSettings);

/** The one profile a leaderboard will accept. */
export const NO_ASSISTS: AssistProfile = {
  ranked: true,
  holdToPress: false,
  speedFloor: 1,
  calmVisuals: false,
  colorSafe: false,
  noTimedInput: false,
};

/** Has the member asked for anything at all? */
export function hasAnyAssist(s: AssistSettings): boolean {
  return (
    s.holdToPress ||
    s.calmVisuals ||
    s.colorSafe ||
    s.noTimedInput ||
    s.speedFloor < 1
  );
}

/** Narrow a profile for a caller that needs to branch on eligibility. */
export function profileIsRanked(p: AssistProfile): p is Extract<AssistProfile, { ranked: true }> {
  return p.ranked;
}

/**
 * Clamp a stored or submitted settings object into range.
 *
 * Total: every field is forced to a sane value rather than rejected, because
 * these arrive from a settings form and from a database row written by an older
 * version of this file, and neither is worth a 400.
 */
export function normalizeAssists(raw: Partial<AssistSettings> | null | undefined): AssistSettings {
  const speed = Number(raw?.speedFloor);
  return {
    holdToPress: Boolean(raw?.holdToPress),
    speedFloor: Number.isFinite(speed) ? Math.min(1, Math.max(MIN_SPEED_FLOOR, speed)) : 1,
    calmVisuals: Boolean(raw?.calmVisuals),
    colorSafe: Boolean(raw?.colorSafe),
    noTimedInput: Boolean(raw?.noTimedInput),
  };
}

/**
 * Build the profile for one run.
 *
 * Returns {@link NO_ASSISTS} — and therefore a ranked run — whenever the game
 * has not adopted the layer, whatever the member asked for. That is the
 * important direction: a member with assists switched on should not silently
 * lose leaderboard eligibility in a game that was never going to honour them.
 */
export function profileFor(game: string, settings: AssistSettings): AssistProfile {
  if (!ASSIST_CAPABLE.has(game)) return NO_ASSISTS;
  if (!hasAnyAssist(settings)) return NO_ASSISTS;
  return { ranked: false, ...settings };
}

/**
 * Games whose client actually honours an assist profile.
 *
 * **Empty, and that is the correct state today.** See the module header: a game
 * added here without client support trades its players' leaderboard
 * eligibility for nothing. Adding an entry is part of the change that teaches
 * the game to read the profile, alongside the `accessibility` entries in
 * `lib/game-capabilities.ts` — and `lib/__tests__/game-assist.test.ts` holds
 * those two to each other so the two halves cannot ship apart.
 */
export const ASSIST_CAPABLE: ReadonlySet<string> = new Set<string>();

/**
 * Which `AccessibilityFeature` strings a game must declare once it adopts.
 *
 * The join between this layer and the capabilities registry: a game in
 * {@link ASSIST_CAPABLE} has to claim these, because they are then true of it.
 */
export const ASSIST_FEATURES = [
  'assist-mode',
  'reduced-flashing',
  'colorblind-safe',
  'no-timed-input',
] as const;

/**
 * Games with their own assist implementation, predating this layer.
 *
 * **One-directional, like the allowlists in `design-consistency.test.ts`:
 * entries come out, they do not go in.** A new game gets its assists from the
 * shared layer; this list exists only for the one that already had a better
 * one before the layer was written.
 *
 * Two games qualify, and both got there before this file existed:
 *
 *   - **Slice It** — `lib/slice-it/modifiers.ts` implements a nine-setting
 *     assist family (assist mode, no-fail, colour-blind lane palettes, a
 *     photosensitivity mode independent of the performance tier, adjustable
 *     judgement windows, one-handed play) and already enforces the rule this
 *     layer enforces: an assisted run is unranked. It is the model this layer
 *     generalises, not an omission from it.
 *   - **Massive March** — host-enabled challenge skipping (§17), so a
 *     challenge that depends on hearing, speaking, reaction time or precise
 *     aim can be stepped past without ending the campaign. It has the same
 *     rule in its own words: `lib/massive-march/campaign.ts` — "a solved site
 *     pays out; a skipped one does not, and never will."
 *
 * Which means that rule is now stated in FOUR places: here,
 * `lib/game/director.server.ts`, Slice It's modifiers and Massive March's
 * campaign. That is three more than is healthy. Folding them together is the
 * obvious next consolidation and is deliberately not done here — it is a
 * refactor of three shipped, working systems and belongs in its own change,
 * not smuggled into the commit that adds a fourth.
 */
export const OWN_ASSIST_IMPLEMENTATION: ReadonlySet<string> = new Set([
  'slice-it',
  'massive-march',
]);
