/**
 * The maps each game publishes as map packages (scripts/tf2-game/build-maps.ts builds
 * exactly these by default, and the sync workflow relies on that). TF2's list is the
 * hub's allowlist (lib/tf2-game/data/maps.ts); Half-Life 2 is the two maps the demo licence
 * ships data for (the rest of its depot is empty placeholders), Portal is the First Slice's test chambers — never more, both are
 * single-player ('sp'). CS:GO publishes de_dust2 alone: bomb defusal ('de'), and deathmatch plays
 * the same package.
 *
 * Environment-agnostic.
 */
import { TF2_MAPS } from '../data/maps';
import type { GameId } from './versions';

export interface GameMapEntry {
  /** BSP name (`d1_trainstation_01`). */
  name: string;
  title: string;
  /** TF2 game mode, 'sp', or CS:GO's map prefix mode ('de': bomb defusal; deathmatch reuses it). */
  mode: string;
}

export const HL2_MAPS: readonly GameMapEntry[] = [
  { name: 'd1_trainstation_01', title: 'Point Insertion: Arrival', mode: 'sp' },
  { name: 'd1_trainstation_02', title: 'Point Insertion: City 17 Plaza', mode: 'sp' },
];

export const PORTAL_MAPS: readonly GameMapEntry[] = [
  { name: 'testchmb_a_00', title: 'Test Chambers 00–01', mode: 'sp' },
  { name: 'testchmb_a_01', title: 'Test Chambers 02–03', mode: 'sp' },
  { name: 'testchmb_a_02', title: 'Test Chambers 04–05', mode: 'sp' },
  { name: 'testchmb_a_03', title: 'Test Chambers 06–07', mode: 'sp' },
  { name: 'testchmb_a_04', title: 'Test Chamber 08', mode: 'sp' },
  { name: 'testchmb_a_05', title: 'Test Chamber 09', mode: 'sp' },
  { name: 'testchmb_a_06', title: 'Test Chamber 10', mode: 'sp' },
];

export const CSGO_MAPS: readonly GameMapEntry[] = [
  { name: 'de_dust2', title: 'Dust II', mode: 'de' },
];

export const GAME_MAPS: Record<GameId, readonly GameMapEntry[]> = {
  tf2: TF2_MAPS.map((m) => ({ name: m.name, title: m.title, mode: m.mode })),
  hl2: HL2_MAPS,
  portal: PORTAL_MAPS,
  csgo: CSGO_MAPS,
};

/** The published entry for a map, or null when the game does not publish it. */
export function findGameMap(game: GameId, name: string): GameMapEntry | null {
  return GAME_MAPS[game].find((m) => m.name === name) ?? null;
}
