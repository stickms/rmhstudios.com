/**
 * Test state for the preview: the numbers and names the game would substitute
 * for `%Health%`, `%Ammo%`, `%redscore%` and friends. Every field is editable in
 * the test panel so each HUD state (low health, overheal, last second of the
 * round…) can be visualised without launching TF2.
 */

export const TF2_CLASSES = [
  'scout',
  'soldier',
  'pyro',
  'demoman',
  'heavy',
  'engineer',
  'medic',
  'sniper',
  'spy',
] as const;
export type Tf2Class = (typeof TF2_CLASSES)[number];

export type Team = 'red' | 'blue';

export const CLASS_MAX_HEALTH: Record<Tf2Class, number> = {
  scout: 125,
  soldier: 200,
  pyro: 175,
  demoman: 175,
  heavy: 300,
  engineer: 125,
  medic: 150,
  sniper: 125,
  spy: 125,
};

export interface TestState {
  playerClass: Tf2Class;
  team: Team;
  health: number;
  maxHealth: number;
  ammoClip: number;
  ammoReserve: number;
  metal: number;
  /** Medic ubercharge / generic meter, 0–100. */
  charge: number;
  redScore: number;
  blueScore: number;
  /** Round timer in seconds. */
  roundSeconds: number;
  playerName: string;
  currency: number;
  /** Fill for progress bars, 0–100. */
  progress: number;
}

export const DEFAULT_TEST_STATE: TestState = {
  playerClass: 'scout',
  team: 'red',
  health: 125,
  maxHealth: 125,
  ammoClip: 6,
  ammoReserve: 32,
  metal: 200,
  charge: 85,
  redScore: 2,
  blueScore: 1,
  roundSeconds: 272,
  playerName: 'RMH Player',
  currency: 1250,
  progress: 60,
};

export interface FixturePreset {
  id: string;
  label: string;
  patch: Partial<TestState>;
}

export const FIXTURE_PRESETS: readonly FixturePreset[] = [
  {
    id: 'full',
    label: 'Full health',
    patch: { health: 125, maxHealth: 125, ammoClip: 6, ammoReserve: 32 },
  },
  {
    id: 'low',
    label: 'Low health',
    patch: { health: 24, maxHealth: 125, ammoClip: 1, ammoReserve: 0 },
  },
  { id: 'overheal', label: 'Overhealed', patch: { health: 185, maxHealth: 125 } },
  { id: 'dead', label: 'Dead', patch: { health: 0, ammoClip: 0, ammoReserve: 0 } },
  {
    id: 'uber',
    label: 'Ubercharged',
    patch: { playerClass: 'medic', maxHealth: 150, health: 150, charge: 100 },
  },
  {
    id: 'engineer',
    label: 'Engineer',
    patch: { playerClass: 'engineer', maxHealth: 125, health: 125, metal: 200 },
  },
  { id: 'overtime', label: 'Last seconds', patch: { roundSeconds: 7 } },
];

const mmss = (total: number): string => {
  const t = Math.max(0, Math.floor(total));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/**
 * Lower-case variable table for `%name%` substitution. Unknown names are left
 * as written so a typo in a HUD is visible rather than silently blank.
 */
export function varsFromState(s: TestState): Map<string, string> {
  const own = s.team === 'red' ? 'red' : 'blue';
  const entries: [string, string | number][] = [
    ['health', s.health],
    ['maxhealth', s.maxHealth],
    ['ammo', s.ammoClip],
    ['ammoinclip', s.ammoClip],
    ['ammoinreserve', s.ammoReserve],
    ['ammoinreserve', s.ammoReserve],
    ['metal', s.metal],
    ['chargeamount', `${Math.round(s.charge)}%`],
    ['charge', Math.round(s.charge)],
    ['score', s.redScore],
    ['redscore', s.redScore],
    ['bluescore', s.blueScore],
    ['redteamscore', s.redScore],
    ['blueteamscore', s.blueScore],
    ['redteamname', 'RED'],
    ['blueteamname', 'BLU'],
    ['playername', s.playerName],
    ['teamname', own.toUpperCase()],
    ['timer', mmss(s.roundSeconds)],
    ['timeleft', mmss(s.roundSeconds)],
    ['servertimeleft', mmss(s.roundSeconds * 3)],
    ['countdowntime', Math.max(0, Math.min(99, Math.round(s.roundSeconds)))],
    ['countdown', Math.max(0, Math.min(99, Math.round(s.roundSeconds)))],
    ['respawntime', 8],
    ['currency', s.currency],
    ['server', 'rmhstudios.com'],
    ['specindex', 1],
    ['progresscount', `${Math.round(s.progress / 10)}/10`],
    ['victorytime', mmss(s.roundSeconds)],
    ['intelvalue', 0],
    ['flagvalue', 0],
    ['activepipes', 4],
    ['red_alive', 6],
    ['blue_alive', 6],
    ['red_escrow', 0],
    ['blue_escrow', 0],
    ['warkills', 0],
    ['readylabel', 'READY'],
    ['carrying', 'Carrying the intelligence'],
    ['goal', 'Capture the enemy intelligence'],
  ];
  return new Map(entries.map(([k, v]) => [k, String(v)]));
}
