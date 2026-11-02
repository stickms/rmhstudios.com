/**
 * Harmonic's HUD state: the one object the HUD (`components/harmonic-game/HarmonicHud.tsx`) draws.
 * Pure data, environment-agnostic.
 *
 * Who fills what — every field except `health`/`maxHealth`/`dead` is optional so each work package
 * adds its own slice without touching the others, and the HUD hides a field that is `undefined`:
 *
 *   health, maxHealth, dead   H1.4 (here, from the sp world's player)
 *   weapon                    H1.1 combat/weapons (`readHudState` gains the equipped weapon)
 *   cold                      cold exposure + shelter (the cold meter)
 *   tuner                     H2.1 phase layers (the Tuner's charge; `listening` while it is held)
 *   layer                     H2.1 (which time the player is in)
 *   hint                      level scripts / tutorials (a one-line prompt)
 *   subtitles                 narrative runner (dialogue lines; `until` is on the HUD clock, `HudState.now`)
 *
 * How it reaches React: `harmonicContent().hud` (the `SpContent.hud` seam) returns this object each
 * HUD tick (20 Hz) and the sp client publishes it as `HudState.ext`, through the same store the
 * HL2/Portal HUDs use. Strings are keys with defaults, translated in the component.
 */

export interface HarmonicHudState {
  health: number;
  maxHealth: number;
  cold?: { value: number; max: number; sheltered: boolean };
  weapon?: { id: string; ammo: number; reserve: number; reloading: boolean };
  tuner?: { charge: number; max: number; listening: boolean };
  layer?: 'past' | 'present';
  hint?: { key: string; defaultValue: string } | null;
  subtitles: { speaker: string; key: string; defaultValue: string; until: number }[];
  dead: boolean;
}

/** What `readHudState` reads: the sp world's snapshot of the player (a structural slice of `SpSnapshot`). */
export interface HudSource {
  player: { health: number; dead: boolean };
}

export const HARMONIC_MAX_HEALTH = 100;

export const emptyHarmonicHud = (): HarmonicHudState => ({
  health: HARMONIC_MAX_HEALTH,
  maxHealth: HARMONIC_MAX_HEALTH,
  subtitles: [],
  dead: false,
});

/** Fills what exists today (health, dead). Pure; later work packages extend it. */
export function readHudState(world: HudSource): HarmonicHudState {
  const hp = Number.isFinite(world.player.health) ? world.player.health : 0;
  const state = emptyHarmonicHud();
  state.health = Math.max(0, Math.min(state.maxHealth, Math.round(hp)));
  state.dead = world.player.dead || hp <= 0;
  return state;
}

/** Type guard for `HudState.ext`. */
export function isHarmonicHud(v: unknown): v is HarmonicHudState {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as HarmonicHudState).health === 'number' &&
    Array.isArray((v as HarmonicHudState).subtitles)
  );
}
