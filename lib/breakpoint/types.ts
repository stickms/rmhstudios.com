// ============================================================
// BREAKPOINT — shared types
// ============================================================

export type Team = 'attackers' | 'defenders';

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
  ready: boolean;
  isHost: boolean;
  isBot: boolean;
  rank: number; // cosmetic rating number
}
