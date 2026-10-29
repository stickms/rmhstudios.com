/**
 * The HUD's per-frame snapshot: everything the in-game UI of the three games
 * draws, as plain data. The client loop builds one of these (from the
 * snapshot client and the event stream for TF2, from the single-player world
 * for Half-Life 2 and Portal — `hud-adapter.ts`) and hands it to the HUD
 * store (`hud-store.ts`); the React HUD in `components/tf2-game/` only reads it.
 *
 * Nothing here knows about React, the DOM or the network, so the adapters are
 * unit-tested against synthetic records and the HUD preview renders sample
 * states without a running game.
 *
 * Conventions: times are seconds; `*At` fields are client clock seconds
 * (`HudState.now` is the same clock), `*In` fields are seconds remaining;
 * fractions are 0…1; teams are TEAM_* numbers (core/constants.ts: 2 RED,
 * 3 BLU); classes are ETFClass (1 Scout … 9 Engineer).
 */

export type HudGame = 'tf2' | 'hl2' | 'portal';

/** Which ammo display a weapon uses (CTFHudWeaponAmmo). */
export type HudAmmoKind = 'clip' | 'reserve-only' | 'none';

export interface HudWeaponSlot {
  /** Loadout slot (0 primary, 1 secondary, 2 melee, 3/4 PDAs, 5 building). */
  slot: number;
  defindex: number;
  /** English item name from the game data (the HUD may localize by defindex). */
  name: string;
  active: boolean;
}

export interface HudAmmo {
  kind: HudAmmoKind;
  /** Rounds in the clip, −1 when the weapon has none. */
  clip: number;
  maxClip: number;
  /** Reserve of the weapon's ammo type. */
  reserve: number;
  maxReserve: number;
  reloading: boolean;
}

/** Charge meters; null when the local player's loadout has no such meter. */
export interface HudMeters {
  /** Medi Gun ÜberCharge 0…1. */
  uber: number | null;
  /** The über is being deployed (draining). */
  uberDeployed: boolean;
  /** Sniper Rifle charge 0…1 (charged damage / 150). */
  sniperCharge: number | null;
  /** Invisibility Watch cloak 0…1. */
  cloak: number | null;
  /** Stickybomb launcher charge 0…1 while holding attack. */
  stickyCharge: number | null;
  /** Stickybombs out, and the cap (8). */
  stickyCount: number | null;
  stickyMax: number;
  /** Minigun spin-up, 0 idle … 1 spinning. */
  minigunSpin: number | null;
}

export interface HudConditions {
  burning: boolean;
  bleeding: boolean;
  ubered: boolean;
  critBoosted: boolean;
  miniCritBoosted: boolean;
  cloaked: boolean;
  disguised: boolean;
  disguising: boolean;
  /** TEAM_* and ETFClass of the disguise (0 when not disguised). */
  disguiseTeam: number;
  disguiseClass: number;
  zoomed: boolean;
  taunting: boolean;
  jarated: boolean;
  milked: boolean;
  markedForDeath: boolean;
  overhealed: boolean;
  stunned: boolean;
}

export type HudBuildingKind = 'sentry' | 'dispenser' | 'entrance' | 'exit';

export interface HudBuilding {
  kind: HudBuildingKind;
  exists: boolean;
  level: number;
  health: number;
  maxHealth: number;
  /** Construction 0…1 (1 when built). */
  buildProgress: number;
  building: boolean;
  /** Upgrade metal so far / needed (200 per level). */
  upgradeMetal: number;
  upgradeMetalRequired: number;
  sapped: boolean;
  disabled: boolean;
  carried: boolean;
  /** Sentry. */
  shells: number;
  maxShells: number;
  rockets: number;
  maxRockets: number;
  kills: number;
  /** Dispenser metal. */
  metal: number;
  /** Teleporter recharge 0…1, ready, linked. */
  charge: number;
  ready: boolean;
  linked: boolean;
}

export interface HudEngineer {
  metal: number;
  maxMetal: number;
  sentry: HudBuilding;
  dispenser: HudBuilding;
  entrance: HudBuilding;
  exit: HudBuilding;
}

/** Who the camera follows while dead or spectating. */
export interface HudSpectatorTarget {
  id: number;
  name: string;
  team: number;
  cls: number;
  health: number;
  maxHealth: number;
}

export interface HudLocalPlayer {
  id: number;
  name: string;
  team: number;
  /** 0 before a class is picked. */
  cls: number;
  alive: boolean;
  health: number;
  maxHealth: number;
  /** Overheal cap (1.5 × max, rounded down to 5). */
  maxBuffedHealth: number;
  ammo: HudAmmo;
  activeSlot: number;
  activeWeapon: HudWeaponSlot | null;
  slots: HudWeaponSlot[];
  meters: HudMeters;
  conditions: HudConditions;
  engineer: HudEngineer | null;
  /** Seconds until respawn while dead, null when alive or not scheduled. */
  respawnIn: number | null;
  spectating: HudSpectatorTarget | null;
}

export type HudMode = 'ctf' | 'cp' | 'cp_ad' | 'koth' | 'pl' | 'arena' | '';

export type HudRoundState =
  | 'pregame'
  | 'preround'
  | 'running'
  | 'team_win'
  | 'stalemate'
  | 'game_over'
  | 'other';

export interface HudTimer {
  /** Seconds left (never negative). */
  remaining: number;
  setup: boolean;
  paused: boolean;
  overtime: boolean;
  /** Seconds the timer counts from, for the progress ring (0 when unknown). */
  length: number;
}

export interface HudKothTimers {
  red: number;
  blue: number;
  /** The team whose clock is running (0 for none). */
  active: number;
}

export interface HudControlPoint {
  index: number;
  name: string;
  owner: number;
  /** Team currently capturing (0 for none). */
  cappingTeam: number;
  /** Capture progress of `cappingTeam`, 0…1. */
  progress: number;
  /** Players of the capping team on the point. */
  cappers: number;
  requiredCappers: number;
  locked: boolean;
  blocked: boolean;
  /** Seconds until it unlocks (null when not counting). */
  unlocksIn: number | null;
  /** Payload: place along the track, 0…1; null for ordinary points. */
  trackPosition: number | null;
}

export type HudFlagStatus = 'home' | 'stolen' | 'dropped';

export interface HudFlag {
  /** The team that owns the flag (RED's intelligence is team 2). */
  team: number;
  status: HudFlagStatus;
  carrierName: string;
  /** The local player is carrying it. */
  carriedByLocal: boolean;
  /** Seconds until a dropped flag returns. */
  returnsIn: number | null;
}

export interface HudPayload {
  /** The pushing team. */
  team: number;
  progress: number;
  /** Players pushing (0–3+ speed levels show as cappers). */
  pushers: number;
  /** Receding back toward the last checkpoint. */
  receding: boolean;
  /** Pushers present but an enemy is contesting. */
  blocked: boolean;
  /** Checkpoint positions along the track, 0…1, and whether passed. */
  checkpoints: Array<{ at: number; captured: boolean }>;
}

export interface HudWinPanel {
  /** 0 for a stalemate. */
  team: number;
  /** WINREASON_* (rules.ts). */
  reason: number;
  redScore: number;
  blueScore: number;
  /** The round's top players by score (up to 3). */
  top: Array<{ name: string; team: number; cls: number; score: number }>;
  /** Seconds until the next round. */
  nextRoundIn: number | null;
}

export interface HudMatch {
  mode: HudMode;
  roundState: HudRoundState;
  /** The main round timer, null when the map shows none. */
  timer: HudTimer | null;
  koth: HudKothTimers | null;
  redScore: number;
  blueScore: number;
  redFlagCaps: number;
  blueFlagCaps: number;
  flagCapLimit: number;
  controlPoints: HudControlPoint[];
  flags: HudFlag[];
  payloads: HudPayload[];
  win: HudWinPanel | null;
  map: string;
}

export interface HudScoreRow {
  id: number;
  name: string;
  team: number;
  cls: number;
  score: number;
  kills: number;
  deaths: number;
  assists: number;
  ping: number;
  dead: boolean;
  bot: boolean;
  isLocal: boolean;
  /** The local player dominates this player. */
  dominated: boolean;
  /** This player dominates the local player. */
  nemesis: boolean;
}

export interface HudKillParty {
  id: number;
  name: string;
  team: number;
}

export interface HudKillEntry {
  id: number;
  at: number;
  attacker: HudKillParty | null;
  assister: HudKillParty | null;
  victim: HudKillParty;
  /** Kill-icon name ("tf_projectile_rocket", "sniperrifle"…). */
  icon: string;
  /** English weapon name for the text fallback. */
  weaponName: string;
  crit: 0 | 1 | 2;
  /** TF_DMG_CUSTOM_* (headshot 1, backstab 2, burning 3…). */
  customKill: number;
  domination: boolean;
  revenge: boolean;
  /** The local player is the attacker, assister or victim (drawn highlighted). */
  involvesLocal: boolean;
  /** An object (building) kill rather than a player death. */
  object?: boolean;
}

export interface HudChatLine {
  id: number;
  at: number;
  name: string;
  team: number;
  text: string;
  teamOnly: boolean;
  dead: boolean;
  /** Server / game messages without a speaker. */
  system: boolean;
}

export interface HudDamageNumber {
  id: number;
  at: number;
  amount: number;
  crit: 0 | 1 | 2;
  /** Screen position 0…1 when the renderer projected the victim; null → beside the crosshair. */
  screen: { x: number; y: number } | null;
  /** World position of the hit, for the renderer to project. */
  world: { x: number; y: number; z: number } | null;
}

/** Monotonic counters the audio layer watches to play the hit / kill sounds. */
export interface HudCues {
  hitSeq: number;
  killSeq: number;
  /** The last hit was a crit (a different hitsound pitch). */
  lastHitCrit: boolean;
}

export interface HudFreezeCam {
  killerName: string;
  killerTeam: number;
  killerCls: number;
  killerHealth: number;
  killerMaxHealth: number;
  /** Killed by a building (sentry), the world, or self. */
  kind: 'player' | 'object' | 'world' | 'suicide';
  dominated: boolean;
  revenge: boolean;
  at: number;
}

export interface HudCaption {
  id: number;
  at: number;
  /** Seconds to keep it. */
  duration: number;
  text: string;
  /** `<clr:r,g,b>` from the caption file, as CSS `rgb(...)`. */
  color: string | null;
  /** A sound effect caption (drawn bracketed and dimmer). */
  sfx: boolean;
  speaker?: string;
}

export interface HudCenterMessage {
  id: number;
  at: number;
  duration: number;
  text: string;
  kind: 'center' | 'announce' | 'alert' | 'training' | 'text';
}

/** Half-Life 2's suit. */
export interface HudHl2 {
  hasSuit: boolean;
  health: number;
  armor: number;
  /** Aux power 0…1, and what is draining it. */
  aux: number;
  auxSprint: boolean;
  auxFlashlight: boolean;
  auxOxygen: boolean;
  flashlightOn: boolean;
  weaponName: string;
  /** −1 for no clip. */
  clip: number;
  reserve: number;
  /** Alt-fire ammo (SMG grenades, AR2 balls), −1 for none. */
  altAmmo: number;
  /** Recent pickups (top-right list). */
  pickups: Array<{ id: number; at: number; label: string; amount: number }>;
  /** Damage direction indicators, degrees relative to the view (0 = ahead). */
  damageDirections: Array<{ id: number; at: number; angle: number }>;
}

export interface HudPortal {
  hasGun: boolean;
  canFireBlue: boolean;
  canFireOrange: boolean;
  bluePlaced: boolean;
  orangePlaced: boolean;
  /** Last portal fired, for the crosshair's highlight. */
  lastFired: 'blue' | 'orange' | null;
  health: number;
}

/** env_fade / death fade over the whole view. */
export interface HudFade {
  /** CSS colour. */
  color: string;
  alpha: number;
}

export interface HudState {
  game: HudGame;
  /** Client clock seconds; every `at` field is on this clock. */
  now: number;
  connected: boolean;
  local: HudLocalPlayer | null;
  match: HudMatch;
  scoreboard: HudScoreRow[];
  killfeed: HudKillEntry[];
  chat: HudChatLine[];
  damageNumbers: HudDamageNumber[];
  cues: HudCues;
  freezecam: HudFreezeCam | null;
  center: HudCenterMessage[];
  captions: HudCaption[];
  hl2: HudHl2 | null;
  portal: HudPortal | null;
  fade: HudFade | null;
  /** Frames per second (shown when the setting is on). */
  fps: number;
}

// ─── Factories ─────────────────────────────────────────────────────────────

export const emptyMeters = (): HudMeters => ({
  uber: null,
  uberDeployed: false,
  sniperCharge: null,
  cloak: null,
  stickyCharge: null,
  stickyCount: null,
  stickyMax: 8,
  minigunSpin: null,
});

export const emptyConditions = (): HudConditions => ({
  burning: false,
  bleeding: false,
  ubered: false,
  critBoosted: false,
  miniCritBoosted: false,
  cloaked: false,
  disguised: false,
  disguising: false,
  disguiseTeam: 0,
  disguiseClass: 0,
  zoomed: false,
  taunting: false,
  jarated: false,
  milked: false,
  markedForDeath: false,
  overhealed: false,
  stunned: false,
});

export const emptyAmmo = (): HudAmmo => ({
  kind: 'none',
  clip: -1,
  maxClip: 0,
  reserve: 0,
  maxReserve: 0,
  reloading: false,
});

export const emptyBuilding = (kind: HudBuildingKind): HudBuilding => ({
  kind,
  exists: false,
  level: 0,
  health: 0,
  maxHealth: 0,
  buildProgress: 0,
  building: false,
  upgradeMetal: 0,
  upgradeMetalRequired: 0,
  sapped: false,
  disabled: false,
  carried: false,
  shells: 0,
  maxShells: 0,
  rockets: 0,
  maxRockets: 0,
  kills: 0,
  metal: 0,
  charge: 0,
  ready: false,
  linked: false,
});

export const emptyEngineer = (): HudEngineer => ({
  metal: 0,
  maxMetal: 200,
  sentry: emptyBuilding('sentry'),
  dispenser: emptyBuilding('dispenser'),
  entrance: emptyBuilding('entrance'),
  exit: emptyBuilding('exit'),
});

export const emptyMatch = (): HudMatch => ({
  mode: '',
  roundState: 'pregame',
  timer: null,
  koth: null,
  redScore: 0,
  blueScore: 0,
  redFlagCaps: 0,
  blueFlagCaps: 0,
  flagCapLimit: 3,
  controlPoints: [],
  flags: [],
  payloads: [],
  win: null,
  map: '',
});

export const emptyHudState = (game: HudGame = 'tf2'): HudState => ({
  game,
  now: 0,
  connected: false,
  local: null,
  match: emptyMatch(),
  scoreboard: [],
  killfeed: [],
  chat: [],
  damageNumbers: [],
  cues: { hitSeq: 0, killSeq: 0, lastHitCrit: false },
  freezecam: null,
  center: [],
  captions: [],
  hl2: null,
  portal: null,
  fade: null,
  fps: 0,
});

// ─── Small shared helpers ──────────────────────────────────────────────────

/** "m:ss" for a timer (TF2's CTFHudTimeStatus format; hours roll into minutes). */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

/** TF2's overheal cap: 1.5 × max health, rounded down to a multiple of 5 (CTFPlayerShared::GetMaxBuffedHealth). */
export function maxBuffedHealth(maxHealth: number): number {
  return Math.floor((maxHealth * 1.5) / 5) * 5;
}

/** The health cross's low-health warning threshold (HudPlayerHealth "HealthDeathWarning" 0.49). */
export const HEALTH_DEATH_WARNING = 0.49;

export const isLowHealth = (health: number, maxHealth: number): boolean =>
  maxHealth > 0 && health > 0 && health / maxHealth <= HEALTH_DEATH_WARNING;
