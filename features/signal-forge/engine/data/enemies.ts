/**
 * Signal Forge enemy table (v2): per-act ordinary enemies, elites and two bosses per act, with fixed move
 * patterns so every intent is readable a turn ahead. Numbers are tuned by __tests__/balance.test.ts.
 */
import type { EnemyDef, EnemyMove } from '../types';

const atk = (id: string, name: string, dmg: number, hits = 1, extra: Partial<EnemyMove> = {}): EnemyMove => ({
  id,
  name,
  kind: 'attack',
  dmg,
  ...(hits > 1 ? { hits } : {}),
  ...extra,
});
const def = (id: string, name: string, block: number, extra: Partial<EnemyMove> = {}): EnemyMove => ({
  id,
  name,
  kind: 'defend',
  block,
  ...extra,
});
const mv = (id: string, name: string, kind: EnemyMove['kind'], extra: Partial<EnemyMove>): EnemyMove => ({
  id,
  name,
  kind,
  ...extra,
});

export const ENEMIES: EnemyDef[] = [
  // ═════════════════════════════ ACT 1: THE FOUNDRY FLOOR ═════════════════════════════
  {
    id: 'ember_mite', name: 'Ember Mite', act: 1, tier: 'normal', hp: [12, 15], shape: 'crawler',
    moves: [atk('bite', 'Bite', 5), atk('scorch', 'Scorch', 3, 1, { weak: 1, kind: 'debuff' })],
    pattern: [0, 1, 0], lore: 'A cinder that learned to crawl.',
  },
  {
    id: 'scrap_drone', name: 'Scrap Drone', act: 1, tier: 'normal', hp: [16, 19], shape: 'drone',
    moves: [atk('ram', 'Ram', 7), def('patch', 'Patch Plating', 6)],
    pattern: [0, 1], lore: 'Welded together from whatever fell off the line.',
  },
  {
    id: 'wire_crawler', name: 'Wire Crawler', act: 1, tier: 'normal', hp: [18, 22], shape: 'crawler',
    moves: [atk('lash', 'Lash', 3, 2), mv('coil', 'Coil Up', 'buff', { strength: 2, block: 3 })],
    pattern: [1, 0, 0], loopFrom: 1, lore: 'Copper sinew, stripped and angry.',
  },
  {
    id: 'slag_hound', name: 'Slag Hound', act: 1, tier: 'normal', hp: [20, 24], shape: 'hound',
    moves: [atk('maul', 'Maul', 9), atk('snap', 'Snap', 4, 1, { vuln: 1, kind: 'debuff' })],
    pattern: [1, 0], lore: 'Runs on molten runoff. Never tires.',
  },
  {
    id: 'static_moth', name: 'Static Moth', act: 1, tier: 'normal', hp: [11, 14], shape: 'wraith',
    moves: [mv('dust', 'Static Dust', 'disrupt', { static: 2, dmg: 2 }), atk('flutter', 'Flutter', 4)],
    pattern: [0, 1], lore: 'Drawn to the hum of a live phrase.',
  },
  {
    id: 'bellows_imp', name: 'Bellows Imp', act: 1, tier: 'normal', hp: [14, 17], shape: 'furnace',
    moves: [mv('fan', 'Fan the Coals', 'buff', { strengthAll: 1, block: 4 }), atk('puff', 'Hot Puff', 5)],
    pattern: [0, 1, 1], lore: 'It breathes on its friends and they burn brighter.',
  },
  {
    id: 'rivet_press', name: 'Rivet Press', act: 1, tier: 'normal', hp: [26, 30], shape: 'press',
    moves: [def('brace', 'Brace', 8), atk('stamp', 'Stamp', 12)],
    pattern: [0, 1], passives: { armor: 1 }, lore: 'Pressure first, questions never.',
  },
  {
    id: 'spark', name: 'Spark', act: 1, tier: 'minion', hp: [6, 8], shape: 'arc',
    moves: [atk('zap', 'Zap', 3)], pattern: [0], lore: 'A loose spark with a grudge.',
  },
  // The tutorial's target: never in an encounter list.
  {
    id: 'calibration_drone', name: 'Calibration Drone', act: 1, tier: 'minion', hp: [60, 60], shape: 'drone',
    moves: [atk('tap', 'Test Tap', 6), def('hold', 'Hold Still', 5)],
    pattern: [0, 1], lore: 'Built to be hit. It takes notes.',
  },
  // Act 1 elites
  {
    id: 'foundry_sentinel', name: 'Foundry Sentinel', act: 1, tier: 'elite', hp: [58, 62], shape: 'sentinel',
    moves: [atk('cleave', 'Cleave', 14), def('bulwark', 'Bulwark', 12, { strength: 1 }), atk('sweep', 'Sweep', 5, 2)],
    pattern: [1, 0, 2], passives: { armor: 2 }, lore: 'It guards the foundry door. It has never opened it.',
  },
  {
    id: 'molten_golem', name: 'Molten Golem', act: 1, tier: 'elite', hp: [70, 76], shape: 'anvil',
    moves: [atk('slam', 'Slam', 11), mv('melt', 'Melt Down', 'debuff', { frail: 2, dmg: 6 }), atk('pour', 'Pour', 4, 3)],
    pattern: [0, 1, 2], passives: { enrage: 4 }, lore: 'Cools slowly. Grows angrier the more it cracks.',
  },
  {
    id: 'arc_twin', name: 'Arc Twin', act: 1, tier: 'elite', hp: [32, 36], shape: 'arc',
    moves: [atk('arc', 'Arc', 7), mv('link', 'Link Charge', 'buff', { strength: 2, blockAll: 5 })],
    pattern: [0, 1, 0], passives: { thorns: 1 }, lore: 'Two poles of one bad idea.',
  },
  // Act 1 bosses
  {
    id: 'the_crucible', name: 'The Crucible', act: 1, tier: 'boss', hp: [132, 132], shape: 'furnace',
    moves: [
      atk('pour', 'Molten Pour', 8, 2),
      def('stoke', 'Stoke the Fire', 14, { strength: 2 }),
      mv('slag', 'Slag Spill', 'disrupt', { glitch: 1, dmg: 6 }),
      atk('flood', 'Flood the Mould', 24),
    ],
    pattern: [1, 0, 2, 0], phase2: { pattern: [3, 1, 0, 2] }, passives: { startBlock: 10 },
    lore: 'The first furnace, and it does not want to be replaced.',
  },
  {
    id: 'the_modulator', name: 'The Modulator', act: 1, tier: 'boss', hp: [124, 124], shape: 'coil',
    moves: [
      atk('carrier', 'Carrier Strike', 10),
      mv('detune', 'Detune', 'disrupt', { scramble: true, static: 1, dmg: 5 }),
      def('sidebands', 'Sidebands', 12, { blockAll: 6 }),
      mv('summon', 'Emit Sparks', 'summon', { summon: ['spark', 'spark'] }),
      atk('crest', 'Wave Crest', 6, 3),
    ],
    pattern: [3, 0, 1, 2], loopFrom: 1, phase2: { pattern: [4, 1, 0, 3], passives: { burstHardened: 1 } },
    lore: 'It retunes the signal under your hands.',
  },

  // ═════════════════════════════ ACT 2: THE COIL HALLS ═════════════════════════════
  {
    id: 'coil_wraith', name: 'Coil Wraith', act: 2, tier: 'normal', hp: [30, 34], shape: 'wraith',
    moves: [atk('drain', 'Drain', 9, 1, { heal: 4 }), mv('haunt', 'Haunt', 'debuff', { weak: 2, dmg: 5 })],
    pattern: [0, 1], passives: { phased: true }, lore: 'Only a live phrase can touch it properly.',
  },
  {
    id: 'pressure_press', name: 'Pressure Press', act: 2, tier: 'normal', hp: [42, 46], shape: 'press',
    moves: [def('build', 'Build Pressure', 10, { strength: 3 }), atk('release', 'Release', 18)],
    pattern: [0, 1], passives: { armor: 2 }, lore: 'Every second turn, something gives.',
  },
  {
    id: 'glitch_hound', name: 'Glitch Hound', act: 2, tier: 'normal', hp: [34, 38], shape: 'hound',
    moves: [atk('gnaw', 'Gnaw', 8), mv('corrupt', 'Corrupt', 'disrupt', { glitch: 1, dmg: 6 })],
    pattern: [0, 1], lore: 'It chews holes in your deck.',
  },
  {
    id: 'shield_relay', name: 'Shield Relay', act: 2, tier: 'normal', hp: [28, 32], shape: 'core',
    moves: [def('project', 'Project Shields', 6, { blockAll: 9 }), atk('ping', 'Ping', 6)],
    pattern: [0, 0, 1], lore: 'Keeps everything else in one piece.',
  },
  {
    id: 'saw_wasp', name: 'Saw Wasp', act: 2, tier: 'normal', hp: [18, 22], shape: 'drone',
    moves: [atk('sting', 'Sting', 4, 2), atk('dive', 'Dive', 9)],
    pattern: [0, 1], lore: 'They travel in pairs. Three if you are unlucky.',
  },
  {
    id: 'signal_leech', name: 'Signal Leech', act: 2, tier: 'normal', hp: [36, 40], shape: 'crawler',
    moves: [atk('latch', 'Latch', 7, 1, { heal: 5 }), mv('siphon', 'Siphon Heat', 'disrupt', { static: 2, dmg: 8 })],
    pattern: [0, 1], passives: { regen: 2 }, lore: 'It feeds on the warmth you build.',
  },
  {
    id: 'fuse_box', name: 'Fuse Box', act: 2, tier: 'normal', hp: [40, 44], shape: 'core',
    moves: [mv('charge', 'Charge', 'charge', { block: 8 }), atk('blow', 'Blow a Fuse', 22)],
    pattern: [0, 0, 1], passives: { thorns: 2 }, lore: 'Count the charges. Then brace.',
  },
  {
    id: 'volt_spark', name: 'Volt Spark', act: 2, tier: 'minion', hp: [12, 14], shape: 'arc',
    moves: [atk('zap', 'Zap', 6)], pattern: [0], lore: 'Brighter, hotter, still small.',
  },
  // Act 2 elites
  {
    id: 'overseer_core', name: 'Overseer Core', act: 2, tier: 'elite', hp: [110, 116], shape: 'core',
    moves: [
      atk('beam', 'Beam', 16),
      mv('spawn', 'Deploy Sparks', 'summon', { summon: ['volt_spark', 'volt_spark'] }),
      def('shell', 'Shell', 18, { blockAll: 8 }),
    ],
    pattern: [1, 0, 2, 0], loopFrom: 1, lore: 'It watches the halls through a thousand sparks.',
  },
  {
    id: 'phase_phantom', name: 'Phase Phantom', act: 2, tier: 'elite', hp: [96, 100], shape: 'wraith',
    moves: [atk('rend', 'Rend', 7, 3), mv('fade', 'Fade', 'debuff', { weak: 2, vuln: 2, block: 12 }), atk('lunge', 'Lunge', 20)],
    pattern: [1, 0, 2], passives: { phased: true }, lore: 'Off the beat, it is barely there.',
  },
  {
    id: 'iron_choir', name: 'Iron Choir', act: 2, tier: 'elite', hp: [100, 106], shape: 'sentinel',
    moves: [atk('chord', 'Iron Chord', 12, 2), mv('hymn', 'Hymn', 'buff', { strength: 2, block: 12 }), mv('dissonance', 'Dissonance', 'disrupt', { scramble: true, static: 2, dmg: 10 })],
    pattern: [1, 0, 2, 0], passives: { armor: 2 }, lore: 'A wall of cast-iron singers, all slightly flat.',
  },
  // Act 2 bosses
  {
    id: 'the_fault', name: 'The Fault', act: 2, tier: 'boss', hp: [175, 175], shape: 'wraith',
    moves: [
      atk('crack', 'Crack', 10, 2),
      mv('flood', 'Static Flood', 'disrupt', { static: 3, glitch: 1, dmg: 10 }),
      def('seal', 'Seal', 18, { strength: 1 }),
      atk('quake', 'Quake', 26),
      mv('leak', 'Leak', 'debuff', { frail: 2, weak: 2, dmg: 8 }),
    ],
    pattern: [0, 1, 2, 0, 4], phase2: { pattern: [3, 1, 0, 4, 2], passives: { regen: 4 } }, passives: { startBlock: 15 },
    lore: 'A crack in the signal that grew a voice.',
  },
  {
    id: 'the_overwriter', name: 'The Overwriter', act: 2, tier: 'boss', hp: [170, 170], shape: 'press',
    moves: [
      atk('stamp', 'Overwrite', 15),
      mv('rewrite', 'Rewrite', 'disrupt', { glitch: 2, scramble: true, dmg: 6 }),
      def('format', 'Format', 14, { strength: 1 }),
      atk('burst', 'Burst Write', 4, 5),
    ],
    pattern: [2, 0, 1, 3], phase2: { pattern: [1, 3, 0, 2], passives: { armor: 2 } }, passives: { armor: 1 },
    lore: 'It prints over whatever you meant to play.',
  },

  // ═════════════════════════════ ACT 3: THE HEART ═════════════════════════════
  {
    id: 'void_arc', name: 'Void Arc', act: 3, tier: 'normal', hp: [48, 52], shape: 'arc',
    moves: [atk('discharge', 'Discharge', 11, 2), mv('ground', 'Ground Out', 'buff', { strength: 3, block: 10 })],
    pattern: [1, 0, 0], loopFrom: 1, passives: { thorns: 2 }, lore: 'Lightning with nowhere left to go.',
  },
  {
    id: 'null_drone', name: 'Null Drone', act: 3, tier: 'normal', hp: [44, 48], shape: 'drone',
    moves: [mv('null', 'Nullify', 'debuff', { weak: 2, frail: 2, dmg: 8 }), atk('pierce', 'Pierce', 16)],
    pattern: [0, 1, 1], lore: 'It erases what you were about to do.',
  },
  {
    id: 'plasma_smith', name: 'Plasma Smith', act: 3, tier: 'normal', hp: [58, 62], shape: 'anvil',
    moves: [atk('hammer', 'Plasma Hammer', 22), def('quench', 'Quench', 16, { strength: 2 })],
    pattern: [1, 0], passives: { armor: 3 }, lore: 'The forge has smiths of its own.',
  },
  {
    id: 'feedback_wraith', name: 'Feedback Wraith', act: 3, tier: 'normal', hp: [42, 46], shape: 'wraith',
    moves: [mv('howl', 'Howl', 'disrupt', { static: 3, scramble: true, dmg: 9 }), atk('shriek', 'Shriek', 6, 3)],
    pattern: [0, 1], passives: { phased: true }, lore: 'Your own signal, screamed back.',
  },
  {
    id: 'thermal_hound', name: 'Thermal Hound', act: 3, tier: 'normal', hp: [50, 54], shape: 'hound',
    moves: [atk('scald', 'Scald', 14, 1, { vuln: 2 }), atk('frenzy', 'Frenzy', 5, 4)],
    pattern: [0, 1], passives: { enrage: 5 }, lore: 'It hunts by the heat you carry.',
  },
  {
    id: 'bastion', name: 'Bastion', act: 3, tier: 'normal', hp: [64, 68], shape: 'sentinel',
    moves: [def('wall', 'Wall', 14, { blockAll: 12 }), atk('crush', 'Crush', 19)],
    pattern: [0, 1], passives: { armor: 2 }, lore: 'A door that decided to fight.',
  },
  {
    id: 'echo_coil', name: 'Echo Coil', act: 3, tier: 'normal', hp: [40, 44], shape: 'coil',
    moves: [atk('echo', 'Echo', 9, 2), mv('reverb', 'Reverb', 'buff', { strengthAll: 2, block: 8 })],
    pattern: [0, 1], lore: 'Every hit it lands comes round again.',
  },
  {
    id: 'plasma_spark', name: 'Plasma Spark', act: 3, tier: 'minion', hp: [18, 20], shape: 'arc',
    moves: [atk('zap', 'Zap', 9)], pattern: [0], lore: 'A spark the size of a fist.',
  },
  // Act 3 elites
  {
    id: 'time_eater', name: 'Time Eater', act: 3, tier: 'elite', hp: [170, 176], shape: 'coil',
    moves: [atk('devour', 'Devour', 10, 3), mv('slow', 'Slow Time', 'debuff', { weak: 3, frail: 2, dmg: 12 }), def('rewind', 'Rewind', 20, { heal: 20 })],
    pattern: [0, 1, 0, 2], lore: 'It eats the beat, one bar at a time.',
  },
  {
    id: 'null_sentinel', name: 'Null Sentinel', act: 3, tier: 'elite', hp: [138, 142], shape: 'sentinel',
    moves: [atk('annul', 'Annul', 22), def('harden', 'Harden', 22, { strength: 3 }), atk('lattice', 'Lattice', 8, 3)],
    pattern: [1, 0, 2], passives: { armor: 3 }, lore: 'Nothing gets through. Almost nothing.',
  },
  {
    id: 'infinite_loop', name: 'Infinite Loop', act: 3, tier: 'elite', hp: [150, 154], shape: 'core',
    moves: [atk('cycle', 'Cycle', 15), mv('iterate', 'Iterate', 'buff', { strength: 3, heal: 15 }), mv('recurse', 'Recurse', 'summon', { summon: ['plasma_spark'] })],
    pattern: [2, 0, 1, 0], loopFrom: 1, passives: { regen: 5 }, lore: 'It ends where it began, a little stronger.',
  },
  // Act 3 bosses
  {
    id: 'the_debugger', name: 'The Debugger', act: 3, tier: 'boss', hp: [220, 220], shape: 'core',
    moves: [
      atk('trace', 'Trace', 13, 2),
      mv('breakpoint', 'Breakpoint', 'debuff', { weak: 3, vuln: 3, dmg: 10 }),
      def('patch', 'Hotfix', 22, { strength: 2 }),
      mv('purge', 'Purge Routine', 'disrupt', { glitch: 2, static: 3, dmg: 14 }),
      atk('crash', 'Fatal Error', 38),
    ],
    pattern: [1, 0, 2, 3, 0], phase2: { pattern: [4, 0, 3, 2, 1], passives: { burstHardened: 2 } }, passives: { startBlock: 20 },
    lore: 'It has read your deck. It has notes.',
  },
  {
    id: 'forge_heart', name: 'Heart of the Forge', act: 3, tier: 'boss', hp: [235, 235], shape: 'furnace',
    moves: [
      atk('beat', 'Heartbeat', 9, 3),
      def('banked', 'Banked Fire', 20, { strength: 2 }),
      mv('eruption', 'Eruption', 'attack', { dmg: 12, hits: 2, glitch: 1 }),
      mv('summon', 'Kindle', 'summon', { summon: ['plasma_spark'] }),
      atk('supernova', 'Supernova', 40),
    ],
    pattern: [3, 0, 1, 2, 0], loopFrom: 1, phase2: { pattern: [4, 0, 2, 1, 3], passives: { regen: 6 } }, passives: { armor: 2 },
    lore: 'The forge itself, and it keeps time.',
  },
];

const BY_ID = new Map(ENEMIES.map((e) => [e.id, e]));
export function enemyDef(id: string): EnemyDef {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`Unknown enemy: ${id}`);
  return d;
}

export interface ActEncounters {
  /** The first two fights of an act. */
  easy: string[][];
  normal: string[][];
  elite: string[][];
  bosses: string[];
}

export const ENCOUNTERS: Record<1 | 2 | 3, ActEncounters> = {
  1: {
    easy: [['ember_mite', 'ember_mite'], ['scrap_drone'], ['static_moth', 'ember_mite'], ['wire_crawler'], ['slag_hound']],
    normal: [
      ['scrap_drone', 'ember_mite'],
      ['wire_crawler', 'static_moth'],
      ['slag_hound', 'bellows_imp'],
      ['rivet_press', 'static_moth'],
      ['bellows_imp', 'ember_mite', 'ember_mite'],
      ['rivet_press', 'ember_mite'],
      ['slag_hound', 'static_moth'],
      ['wire_crawler', 'scrap_drone'],
    ],
    elite: [['foundry_sentinel'], ['molten_golem'], ['arc_twin', 'arc_twin']],
    bosses: ['the_crucible', 'the_modulator'],
  },
  2: {
    easy: [['coil_wraith'], ['saw_wasp', 'saw_wasp'], ['glitch_hound'], ['signal_leech']],
    normal: [
      ['coil_wraith', 'saw_wasp'],
      ['pressure_press', 'shield_relay'],
      ['glitch_hound', 'saw_wasp'],
      ['signal_leech', 'shield_relay'],
      ['fuse_box', 'saw_wasp'],
      ['saw_wasp', 'saw_wasp', 'saw_wasp'],
      ['pressure_press', 'coil_wraith'],
      ['fuse_box', 'glitch_hound'],
    ],
    elite: [['overseer_core'], ['phase_phantom'], ['iron_choir']],
    bosses: ['the_fault', 'the_overwriter'],
  },
  3: {
    easy: [['null_drone', 'echo_coil'], ['plasma_smith'], ['void_arc'], ['thermal_hound']],
    normal: [
      ['void_arc', 'null_drone'],
      ['plasma_smith', 'echo_coil'],
      ['feedback_wraith', 'thermal_hound'],
      ['bastion', 'void_arc'],
      ['echo_coil', 'echo_coil', 'null_drone'],
      ['bastion', 'feedback_wraith'],
      ['thermal_hound', 'plasma_smith'],
    ],
    elite: [['time_eater'], ['null_sentinel'], ['infinite_loop']],
    bosses: ['the_debugger', 'forge_heart'],
  },
};
