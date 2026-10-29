/**
 * Sample HUD states for the HUD preview harness (scripts/tf2-game/hud-harness)
 * and for eyeballing the HUD without a running game.
 */

import {
  emptyAmmo,
  emptyConditions,
  emptyEngineer,
  emptyHudState,
  emptyMeters,
  type HudGame,
  type HudLocalPlayer,
  type HudScoreRow,
  type HudState,
} from '@/lib/tf2-game/client/hud-state';

const NOW = 100;

function local(over: Partial<HudLocalPlayer>): HudLocalPlayer {
  return {
    id: 3,
    name: 'Pyrotechnics',
    team: 2,
    cls: 3,
    alive: true,
    health: 200,
    maxHealth: 200,
    maxBuffedHealth: 300,
    ammo: { ...emptyAmmo(), kind: 'clip', clip: 4, maxClip: 4, reserve: 20, maxReserve: 20 },
    activeSlot: 0,
    activeWeapon: { slot: 0, defindex: 18, name: 'Rocket Launcher', active: true },
    slots: [
      { slot: 0, defindex: 18, name: 'Rocket Launcher', active: true },
      { slot: 1, defindex: 10, name: 'Shotgun', active: false },
      { slot: 2, defindex: 6, name: 'Shovel', active: false },
    ],
    meters: emptyMeters(),
    conditions: emptyConditions(),
    engineer: null,
    respawnIn: null,
    spectating: null,
    ...over,
  };
}

const NAMES = [
  ['Pyrotechnics', 2, 3],
  ['Saxton Fan', 2, 5],
  ['Hat Collector', 2, 6],
  ['Bonk Boy', 2, 1],
  ['Tavish', 2, 4],
  ['Doctor', 3, 5],
  ['Heavy Weapons Guy', 3, 6],
  ['Mundy', 3, 2],
  ['Dell', 3, 9],
  ['Pyro Bot', 3, 7],
  ['Gentleman', 3, 8],
] as const;

function scoreboard(localId = 3): HudScoreRow[] {
  return NAMES.map(([name, team, cls], i) => {
    const id = i === 0 ? localId : 10 + i;
    return {
      id,
      name,
      team,
      cls,
      score: 30 - i * 2,
      kills: 12 - i,
      deaths: 3 + (i % 4),
      assists: i % 3,
      ping: 25 + i * 7,
      dead: i === 4 || i === 8,
      bot: i >= 9,
      isLocal: i === 0,
      dominated: i === 6,
      nemesis: i === 7,
    };
  });
}

function base(game: HudGame = 'tf2'): HudState {
  const s = emptyHudState(game);
  s.now = NOW;
  s.connected = true;
  s.fps = 144;
  return s;
}

/** Soldier on 5CP: timer, control points mid-capture, kill feed, damage numbers, chat. */
export function soldierCp(): HudState {
  const s = base();
  s.local = local({
    health: 245,
    conditions: { ...emptyConditions(), overhealed: true },
  });
  s.match = {
    ...s.match,
    mode: 'cp',
    roundState: 'running',
    map: 'cp_granary',
    timer: { remaining: 412, setup: false, paused: false, overtime: false, length: 600 },
    controlPoints: [
      { index: 0, name: 'BLU Base', owner: 3, cappingTeam: 0, progress: 0, cappers: 0, requiredCappers: 1, locked: true, blocked: false, unlocksIn: null, trackPosition: null },
      { index: 1, name: 'BLU Yard', owner: 3, cappingTeam: 2, progress: 0.62, cappers: 2, requiredCappers: 1, locked: false, blocked: false, unlocksIn: null, trackPosition: null },
      { index: 2, name: 'Middle', owner: 2, cappingTeam: 0, progress: 0, cappers: 0, requiredCappers: 1, locked: false, blocked: false, unlocksIn: null, trackPosition: null },
      { index: 3, name: 'RED Yard', owner: 2, cappingTeam: 0, progress: 0, cappers: 0, requiredCappers: 1, locked: false, blocked: false, unlocksIn: null, trackPosition: null },
      { index: 4, name: 'RED Base', owner: 2, cappingTeam: 0, progress: 0, cappers: 0, requiredCappers: 1, locked: true, blocked: false, unlocksIn: null, trackPosition: null },
    ],
  };
  s.killfeed = [
    { id: 1, at: NOW - 3, attacker: { id: 3, name: 'Pyrotechnics', team: 2 }, assister: { id: 11, name: 'Saxton Fan', team: 2 }, victim: { id: 16, name: 'Heavy Weapons Guy', team: 3 }, icon: 'tf_projectile_rocket', weaponName: 'Rocket Launcher', crit: 2, customKill: 0, domination: true, revenge: false, involvesLocal: true },
    { id: 2, at: NOW - 2, attacker: { id: 17, name: 'Mundy', team: 3 }, assister: null, victim: { id: 13, name: 'Bonk Boy', team: 2 }, icon: 'sniperrifle', weaponName: 'Sniper Rifle', crit: 0, customKill: 1, domination: false, revenge: false, involvesLocal: false },
    { id: 3, at: NOW - 1, attacker: { id: 20, name: 'Gentleman', team: 3 }, assister: null, victim: { id: 14, name: 'Tavish', team: 2 }, icon: 'knife', weaponName: 'Knife', crit: 2, customKill: 2, domination: false, revenge: false, involvesLocal: false },
  ];
  s.damageNumbers = [
    { id: 7, at: NOW - 0.2, amount: 112, crit: 0, screen: { x: 0.56, y: 0.42 }, world: null },
    { id: 8, at: NOW - 0.1, amount: 38, crit: 0, screen: null, world: null },
  ];
  s.chat = [
    { id: 30, at: NOW - 4, name: 'Saxton Fan', team: 2, text: 'push the point, über is ready', teamOnly: true, dead: false, system: false },
    { id: 31, at: NOW - 2, name: 'Mundy', team: 3, text: 'nice shot mate', teamOnly: false, dead: true, system: false },
  ];
  s.scoreboard = scoreboard();
  return s;
}

/** Medic pushing the cart: über meter, payload track. */
export function medicPayload(): HudState {
  const s = base();
  s.local = local({
    team: 3,
    cls: 5,
    health: 61,
    maxHealth: 150,
    maxBuffedHealth: 225,
    ammo: emptyAmmo(),
    activeSlot: 1,
    activeWeapon: { slot: 1, defindex: 29, name: 'Medi Gun', active: true },
    meters: { ...emptyMeters(), uber: 0.78 },
    conditions: { ...emptyConditions(), burning: true },
  });
  s.match = {
    ...s.match,
    mode: 'pl',
    roundState: 'running',
    map: 'pl_badwater',
    timer: { remaining: 245, setup: false, paused: false, overtime: false, length: 600 },
    payloads: [
      {
        team: 3,
        progress: 0.41,
        pushers: 3,
        receding: false,
        blocked: false,
        checkpoints: [
          { at: 0.24, captured: true },
          { at: 0.52, captured: false },
          { at: 0.78, captured: false },
          { at: 1, captured: false },
        ],
      },
    ],
  };
  s.scoreboard = scoreboard();
  return s;
}

/** Engineer on CTF with buildings and the build PDA out. */
export function engineerCtf(): HudState {
  const s = base();
  const eng = emptyEngineer();
  eng.metal = 145;
  eng.sentry = { ...eng.sentry, exists: true, level: 2, health: 160, maxHealth: 180, shells: 140, maxShells: 200, kills: 7, upgradeMetal: 75, upgradeMetalRequired: 200 };
  eng.dispenser = { ...eng.dispenser, exists: true, level: 1, health: 150, maxHealth: 150, metal: 230, upgradeMetal: 0, upgradeMetalRequired: 200 };
  eng.entrance = { ...eng.entrance, exists: true, building: true, buildProgress: 0.45, level: 1, health: 60, maxHealth: 150 };
  s.local = local({
    team: 2,
    cls: 9,
    health: 125,
    maxHealth: 125,
    maxBuffedHealth: 185,
    ammo: emptyAmmo(),
    activeSlot: 3,
    activeWeapon: { slot: 3, defindex: 25, name: 'Construction PDA', active: true },
    slots: [
      { slot: 0, defindex: 9, name: 'Shotgun', active: false },
      { slot: 1, defindex: 22, name: 'Pistol', active: false },
      { slot: 2, defindex: 7, name: 'Wrench', active: false },
      { slot: 3, defindex: 25, name: 'Construction PDA', active: true },
      { slot: 4, defindex: 26, name: 'Destruction PDA', active: false },
    ],
    engineer: eng,
  });
  s.match = {
    ...s.match,
    mode: 'ctf',
    roundState: 'running',
    map: 'ctf_2fort',
    timer: { remaining: 1104, setup: false, paused: false, overtime: false, length: 1200 },
    redFlagCaps: 1,
    blueFlagCaps: 2,
    flagCapLimit: 3,
    flags: [
      { team: 2, status: 'stolen', carrierName: 'Gentleman', carriedByLocal: false, returnsIn: null },
      { team: 3, status: 'dropped', carrierName: '', carriedByLocal: false, returnsIn: 17 },
    ],
  };
  s.scoreboard = scoreboard();
  return s;
}

/** Sniper scoped in on KOTH. */
export function sniperKoth(): HudState {
  const s = base();
  s.local = local({
    team: 3,
    cls: 2,
    health: 125,
    maxHealth: 125,
    maxBuffedHealth: 185,
    ammo: { ...emptyAmmo(), kind: 'reserve-only', reserve: 21, maxReserve: 25 },
    activeWeapon: { slot: 0, defindex: 14, name: 'Sniper Rifle', active: true },
    meters: { ...emptyMeters(), sniperCharge: 0.7 },
    conditions: { ...emptyConditions(), zoomed: true },
  });
  s.match = {
    ...s.match,
    mode: 'koth',
    roundState: 'running',
    map: 'koth_viaduct',
    koth: { red: 104, blue: 152, active: 2 },
    controlPoints: [
      { index: 0, name: 'Hill', owner: 2, cappingTeam: 3, progress: 0.3, cappers: 1, requiredCappers: 1, locked: false, blocked: false, unlocksIn: null, trackPosition: null },
    ],
  };
  return s;
}

/** Dead Spy: freeze cam, respawn countdown. */
export function spyDead(): HudState {
  const s = base();
  s.local = local({ team: 3, cls: 8, alive: false, health: 0, maxHealth: 125, ammo: emptyAmmo(), respawnIn: 7.2 });
  s.freezecam = { killerName: 'Hat Collector', killerTeam: 2, killerCls: 6, killerHealth: 212, killerMaxHealth: 300, kind: 'player', dominated: true, revenge: false, at: NOW - 1 };
  s.match = { ...soldierCp().match };
  s.killfeed = soldierCp().killfeed;
  s.scoreboard = scoreboard(15);
  return s;
}

/** Dead Spy after the freeze cam: respawning, watching a teammate (the spectator GUI). */
export function spectating(): HudState {
  const s = spyDead();
  s.freezecam = null;
  s.local = { ...s.local!, respawnIn: 6.4, spectating: { id: 7, name: 'Pocket Medic', team: 3, cls: 5, health: 131, maxHealth: 150 } };
  return s;
}

/** Spy alive and disguised, cloak meter, disguise kit out. */
export function spyDisguise(): HudState {
  const s = base();
  s.local = local({
    team: 3,
    cls: 8,
    health: 125,
    maxHealth: 125,
    maxBuffedHealth: 185,
    ammo: emptyAmmo(),
    activeSlot: 3,
    meters: { ...emptyMeters(), cloak: 0.64 },
    conditions: { ...emptyConditions(), disguised: true, disguiseTeam: 2, disguiseClass: 5 },
  });
  s.match = { ...soldierCp().match };
  return s;
}

/** Round over: BLU wins. */
export function winPanel(): HudState {
  const s = soldierCp();
  s.match = {
    ...s.match,
    roundState: 'team_win',
    blueScore: 2,
    redScore: 1,
    win: {
      team: 3,
      reason: 1,
      redScore: 1,
      blueScore: 2,
      top: [
        { name: 'Doctor', team: 3, cls: 5, score: 34 },
        { name: 'Heavy Weapons Guy', team: 3, cls: 6, score: 29 },
        { name: 'Pyrotechnics', team: 2, cls: 3, score: 26 },
      ],
      nextRoundIn: 9,
    },
  };
  return s;
}

/** A fresh join: no class yet (the class menu opens). */
export function joinClass(): HudState {
  const s = base();
  s.local = local({ cls: 0, alive: false, health: 0, ammo: emptyAmmo(), slots: [], activeWeapon: null });
  s.match = { ...soldierCp().match };
  s.scoreboard = scoreboard();
  return s;
}

/** Half-Life 2: suit, ammo, aux power draining, pickups, captions. */
export function hl2(): HudState {
  const s = base('hl2');
  s.hl2 = {
    hasSuit: true,
    health: 73,
    armor: 25,
    aux: 0.46,
    auxSprint: true,
    auxFlashlight: false,
    auxOxygen: false,
    flashlightOn: false,
    weaponName: 'SMG',
    clip: 32,
    reserve: 117,
    altAmmo: 2,
    pickups: [
      { id: 1, at: NOW - 1, label: 'SMG ammo', amount: 45 },
      { id: 2, at: NOW - 0.5, label: 'Health', amount: 1 },
    ],
    damageDirections: [{ id: 3, at: NOW - 0.2, angle: 60 }],
  };
  s.captions = [
    { id: 1, at: NOW - 1, duration: 5, text: 'Get over here! Let me take a look at you.', color: 'rgb(255 212 160)', sfx: false, speaker: 'Barney' },
    { id: 2, at: NOW - 0.5, duration: 3, text: 'Train horn', color: null, sfx: true },
  ];
  return s;
}

/** Portal: both portals placed, captions. */
export function portal(): HudState {
  const s = base('portal');
  s.portal = { hasGun: true, canFireBlue: true, canFireOrange: true, bluePlaced: true, orangePlaced: false, lastFired: 'blue', health: 100 };
  s.captions = [
    { id: 1, at: NOW - 1, duration: 6, text: 'Please proceed to the chamberlock. Mind the gap.', color: 'rgb(230 230 230)', sfx: false, speaker: 'GLaDOS' },
  ];
  return s;
}

export const SCENARIOS = {
  soldierCp,
  medicPayload,
  engineerCtf,
  sniperKoth,
  spyDead,
  spectating,
  spyDisguise,
  winPanel,
  joinClass,
  hl2,
  portal,
} as const;
export type ScenarioName = keyof typeof SCENARIOS;
