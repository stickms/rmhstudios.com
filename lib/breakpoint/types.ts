// ============================================================
// BREAKPOINT — shared types
// ============================================================

export type Team = 'attackers' | 'defenders' | 'zombies';

export type MatchMode = 'standard' | 'zombies';
export type NetMode = 'solo' | 'host' | 'guest';

export type GamePhase =
  | 'menu'
  | 'agentSelect'
  | 'lobby'
  | 'loading'
  | 'match'
  | 'result';

/** Phases inside a live match. */
export type RoundPhase =
  | 'buy'        // freeze + buy menu
  | 'action'     // running
  | 'planted'    // spike is down, ticking
  | 'roundEnd';  // someone won the round

export type AgentRole = 'duelist' | 'sentinel' | 'controller' | 'initiator';

export type AbilityKind =
  | 'dash'       // quick burst movement
  | 'heal'       // self heal over time
  | 'wall'       // deployable cover
  | 'smoke'      // vision-blocking cloud
  | 'flash'      // blinds those looking at it
  | 'recon'      // reveals enemies briefly
  | 'molly'      // damage zone
  | 'shield';    // temporary overshield

export interface AbilityDef {
  id: string;
  name: string;
  kind: AbilityKind;
  slot: 'C' | 'Q' | 'E' | 'X'; // X = ultimate
  cost: number;       // credits (0 for ultimate / signature)
  charges: number;    // per buy
  ultPoints?: number; // points to charge ultimate
  cooldown?: number;  // seconds (signature recharge)
  desc: string;
  color: string;
}

export interface AgentDef {
  id: string;
  name: string;
  role: AgentRole;
  color: string;
  blurb: string;
  // Three signature/basic + one ultimate
  abilities: AbilityDef[];
  // small passive tuning
  passive?: { moveMul?: number; hpBonus?: number };
}

export type WeaponClass = 'sidearm' | 'smg' | 'shotgun' | 'rifle' | 'sniper' | 'heavy' | 'melee';

export interface WeaponDef {
  id: string;
  name: string;
  class: WeaponClass;
  cost: number;
  damageBody: number;
  damageHead: number;
  damageLeg: number;
  fireRate: number;     // rounds per second
  magazine: number;
  reserve: number;
  reloadTime: number;   // seconds
  spread: number;       // base inaccuracy (radians) standing still
  spreadMoving: number; // added when moving
  range: number;        // metres until falloff irrelevant (we keep simple)
  pellets?: number;     // shotgun
  automatic: boolean;
  wallPenetration?: number;
  zoom?: number;        // sniper ADS fov multiplier
  color: string;
}

export interface LoadoutState {
  primary: string | null; // weapon id
  sidearm: string;        // weapon id (always have classic)
  armor: number;          // 0 | 25 | 50
  abilities: Record<string, number>; // abilityId -> charges owned
}

export type ActorKind = 'human' | 'bot';

export interface Vec3 { x: number; y: number; z: number; }

/** Runtime combatant — both the local player and bots use this. */
export interface Actor {
  id: string;
  name: string;
  kind: ActorKind;
  team: Team;
  agentId: string;
  isLocal: boolean;

  // transform
  pos: Vec3;
  vel: Vec3;
  yaw: number;   // radians, around Y
  pitch: number; // radians, look up/down
  onGround: boolean;
  crouch: boolean;

  // combat
  hp: number;
  maxHp: number;
  armor: number;
  alive: boolean;
  credits: number;

  loadout: LoadoutState;
  currentWeapon: string; // weapon id in hand
  ammo: number;
  reserve: number;
  reloading: boolean;
  reloadEnd: number;     // timestamp ms
  lastShot: number;      // timestamp ms
  recoil: number;        // accumulated recoil (visual + spread)

  // abilities runtime
  abilityCharges: Record<string, number>;
  ultPoints: number;
  blindUntil: number;    // ms — flashed
  healUntil: number;     // ms — regen window
  shieldHp: number;
  revealedUntil: number; // ms — shown on enemy minimap (recon)
  speedBoostUntil: number; // ms — ult/speed window
  hasSpike: boolean;     // carries the spike (attackers)

  // bot brain
  brain?: BotBrain;

  // networking / mode
  remote?: boolean;       // state arrives over the network (don't simulate)
  isZombie?: boolean;     // PvE zombie actor
  attackReady?: number;   // ms — next melee attack allowed (zombies)
  lastHitBy?: string;     // id of last attacker (for kill attribution)
  net?: { px: number; py: number; pz: number; yaw: number; pitch: number; t: number; moveSpeed: number; firing: number; crouch: boolean }; // interp target

  // stats
  kills: number;
  deaths: number;
  assists: number;
  score: number;

  // animation hints (read by renderer)
  anim: {
    moveSpeed: number;   // 0..1 of run speed, for locomotion
    firing: number;      // ms timestamp of last fire (for muzzle/recoil)
    casting: number;     // ms timestamp ability cast (arm raise)
    hitFlash: number;    // ms timestamp last took damage
    deathTime: number;   // ms timestamp died (for death anim)
  };
}

export interface BotBrain {
  state: 'idle' | 'rotate' | 'engage' | 'plant' | 'defuse' | 'retreat' | 'peek';
  targetId: string | null;
  destination: Vec3 | null;
  nextThink: number;      // ms
  reactionEnd: number;    // ms — delay before reacting to a seen enemy
  aimError: number;       // radians of aim jitter (skill)
  pathWaypoints: Vec3[];
  strafeDir: number;      // -1 | 0 | 1
  burstUntil: number;     // ms — currently firing
}

// ── World objects (abilities deployed in the world) ──────────
export interface WorldFx {
  id: string;
  kind: AbilityKind;
  team: Team;
  pos: Vec3;
  radius: number;
  endsAt: number;     // ms
  ownerId: string;
}

export interface Tracer {
  id: number;
  from: Vec3;
  to: Vec3;
  bornAt: number;
  team: Team;
  hit: boolean;
}

export interface KillFeedEntry {
  id: number;
  killer: string;
  victim: string;
  weapon: string;
  headshot: boolean;
  killerTeam: Team;
  victimTeam: Team;
  at: number;
}

export interface SpikeState {
  carrierId: string | null; // who holds it (attackers)
  planted: boolean;
  pos: Vec3 | null;
  plantedAt: number;        // ms
  defusing: boolean;
  planting: boolean;
  progress: number;         // 0..1 plant/defuse progress
}

export interface RoundResult {
  round: number;
  winner: Team;
  reason: 'elimination' | 'spike' | 'defuse' | 'time';
}

export interface MatchSnapshot {
  now: number;              // engine clock (ms)
  mode: MatchMode;
  wave: number;             // zombies: current wave
  zombiesLeft: number;      // zombies: remaining this wave
  phase: RoundPhase;
  round: number;            // 1-indexed
  scoreAttackers: number;
  scoreDefenders: number;
  localTeam: Team;
  phaseEndsAt: number;      // ms
  spike: SpikeState;
  actors: Actor[];
  fx: WorldFx[];
  killFeed: KillFeedEntry[];
  lastResult: RoundResult | null;
  over: boolean;
  winner: Team | null;
}

// ── Lobby ────────────────────────────────────────────────────
export interface LobbyMember {
  id: string;
  name: string;
  agentId: string | null;
  team: Team;
  ready: boolean;
  isHost: boolean;
  isBot: boolean;
  rank: number; // cosmetic rating number
}

// ── Networking events (drained from the engine, sent over the socket) ──
export type NetEvent =
  | { kind: 'hit'; target: string; dmg: number; head: boolean; weapon: string }
  | { kind: 'bhit'; target: string; dmg: number; head: boolean; weapon: string }
  | { kind: 'death'; killer: string; weapon: string; head: boolean }
  | { kind: 'fx'; fx: WorldFx }
  | { kind: 'spike'; type: 'plant' | 'defuse'; active: boolean; pos: Vec3 | null };

/** Compact per-player state broadcast ~20Hz by every client for its own avatar. */
export interface NetPlayerState {
  px: number; py: number; pz: number;
  yaw: number; pitch: number;
  hp: number; armor: number; shieldHp: number;
  alive: boolean; crouch: boolean;
  weapon: string; agentId: string; team: Team;
  moveSpeed: number; firing: number; name: string;
  hasSpike: boolean;
}

/** Match-director state broadcast by the host. */
export interface NetMatchState {
  now: number;
  mode: MatchMode;
  phase: RoundPhase;
  round: number; wave: number; zombiesLeft: number;
  scoreAttackers: number; scoreDefenders: number;
  attackersTeam: Team;
  phaseEndsAt: number;
  spike: SpikeState;
  over: boolean; winner: Team | null;
  bots: NetBotState[];
}

export interface NetBotState {
  id: string; name: string; team: Team; agentId: string;
  px: number; py: number; pz: number; yaw: number; pitch: number;
  hp: number; alive: boolean; isZombie: boolean; moveSpeed: number; firing: number; crouch: boolean;
}
