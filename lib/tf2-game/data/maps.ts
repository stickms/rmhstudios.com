/**
 * The maps the game can host — the allowlist the hub validates `tf2:room:create`
 * against, and the list the server browser and the create-match menu offer.
 *
 * A map here is a promise that its package exists in object storage (built by
 * the `tf2-assets-sync` workflow from a Steam install) and that the simulation
 * implements its mode. Add a map by adding a row; the hub refuses anything else,
 * so a client cannot ask a match worker to fetch an arbitrary key.
 *
 * Environment-agnostic (browser, hub, match worker), so no imports.
 */

/** Game modes, by their map-name prefix (`cp_ad` is attack/defend control points). */
export type Tf2Mode = 'ctf' | 'cp' | 'cp_ad' | 'koth' | 'pl' | 'arena';

export const TF2_MODES: readonly Tf2Mode[] = ['ctf', 'cp', 'cp_ad', 'koth', 'pl', 'arena'];

export interface Tf2MapInfo {
  /** The BSP name, exactly as in the game (`ctf_2fort`). Also the package key. */
  name: string;
  mode: Tf2Mode;
  /** Display name. */
  title: string;
  /**
   * The game the map's content comes from. Absent means TF2 — the only game on
   * this allowlist. Other games' maps (HL2/Portal single-player) live in their
   * own lists, never here.
   */
  game?: string;
}

/**
 * Deliberately minimal: every entry is a map package in object storage, and
 * storage is capped. Grow it only when a map's package is synced.
 */
export const TF2_MAPS: readonly Tf2MapInfo[] = [
  // Capture the Flag
  { name: 'ctf_2fort', mode: 'ctf', title: '2Fort' },
  { name: 'ctf_turbine', mode: 'ctf', title: 'Turbine' },
  // Attack/Defend control points
  { name: 'cp_dustbowl', mode: 'cp_ad', title: 'Dustbowl' },
  // 5CP symmetric control points
  { name: 'cp_granary', mode: 'cp', title: 'Granary' },
  { name: 'cp_badlands', mode: 'cp', title: 'Badlands' },
  // King of the Hill
  { name: 'koth_viaduct', mode: 'koth', title: 'Viaduct' },
  { name: 'koth_harvest_final', mode: 'koth', title: 'Harvest' },
  // Payload
  { name: 'pl_badwater', mode: 'pl', title: 'Badwater Basin' },
  { name: 'pl_upward', mode: 'pl', title: 'Upward' },
];

const BY_NAME = new Map(TF2_MAPS.map((m) => [m.name, m]));

/** The map's entry, or null when it is not on the allowlist. */
export function findTf2Map(name: unknown): Tf2MapInfo | null {
  return typeof name === 'string' ? (BY_NAME.get(name) ?? null) : null;
}
