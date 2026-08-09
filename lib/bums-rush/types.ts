/**
 * Bum's Rush — the shared type contract.
 *
 * Every other module in `lib/bums-rush/` and `components/bums-rush/` codes
 * against this file, which is why it holds the level/prop/snapshot shapes even
 * though it does not own the zod schemas that validate them: `levels/schema.ts`
 * builds the schemas and asserts its inferred output is assignable to the types
 * here, so there is one declaration of the shape and one place that parses it.
 *
 * Design doc: docs/plans/2026-08-08-bums-rush-design.md. Section references in
 * the comments below point there.
 */

// ─── Geometry ───────────────────────────────────────────────────────────────

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Level geometry is authored as one of four shapes, all in design-space px.
 *
 * **`rect` is anchored TOP-LEFT and rotates about its centre.** Stated here
 * because it is the one ambiguity in this file that fails silently: matter.js
 * builds rectangles from their centre, so an engine that reads `x, y` as the
 * centre and a renderer that reads it as the corner both "work" and disagree by
 * `w/2, h/2` — every wall drawn half a wall away from the thing you collide
 * with. `circle` is centre-anchored, because a circle has no corner to mean.
 */
export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; angle?: number }
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'poly'; x: number; y: number; points: Vec2[]; angle?: number }
  | { kind: 'chain'; points: Vec2[]; thickness: number };

// ─── Materials & render styles (§6.2, §2.6) ─────────────────────────────────

/**
 * A material is grip + friction + fill pattern. The pattern is what makes the
 * material readable in monochrome, which is half of the colourblind-safe claim
 * — so a new material needs a new pattern, not just new numbers.
 */
export type MaterialId = 'paper' | 'rubber' | 'ice' | 'grease' | 'crumbly' | 'nogrip';

/** The paper-construction vocabulary from §2.6. If it moves, it is not `drawn`. */
export type RenderStyle = 'drawn' | 'cutout' | 'taped' | 'pinned' | 'torn';

// ─── Signals (§6.2 `signalRelay`) ───────────────────────────────────────────

export type SignalId = string;
export type SignalOp = 'and' | 'or' | 'not' | 'delay';

// ─── Props (§6.2) ───────────────────────────────────────────────────────────

interface PropBase {
  id: string;
  at: Vec2;
  /** Optional authored angle in radians. */
  angle?: number;
}

export type Prop =
  | (PropBase & { kind: 'crate'; size: Vec2; mass?: number; material?: MaterialId })
  | (PropBase & { kind: 'swing'; length: number; damping?: number })
  | (PropBase & { kind: 'rope'; segments: number; stiffness?: number })
  | (PropBase & { kind: 'platformMoving'; size: Vec2; path: Vec2[]; speed: number; loop?: boolean; material?: MaterialId })
  | (PropBase & { kind: 'platformFalling'; size: Vec2; delayMs: number; material?: MaterialId })
  | (PropBase & { kind: 'lever'; length: number; threshold: number; signal: SignalId; latching?: boolean })
  | (PropBase & { kind: 'button'; size: Vec2; minMass: number; signal: SignalId })
  | (PropBase & { kind: 'door'; size: Vec2; signal: SignalId; openOffset: Vec2; speed: number })
  | (PropBase & { kind: 'key'; lockId: string })
  | (PropBase & { kind: 'popCannon'; power: number; cooldownMs: number; arc: number })
  | (PropBase & { kind: 'fan'; size: Vec2; dir: Vec2; force: number; pulseMs?: number })
  | (PropBase & { kind: 'conveyor'; size: Vec2; speed: number })
  | (PropBase & { kind: 'skiLift'; path: Vec2[]; speed: number; chairs: number })
  | (PropBase & { kind: 'trampoline'; size: Vec2; bounce: number })
  | (PropBase & { kind: 'magnet'; radius: number; force: number; polarity: 1 | -1 })
  | (PropBase & { kind: 'zeroG'; size: Vec2; g: number })
  | (PropBase & { kind: 'thruster'; impulse: number; charges: number })
  | (PropBase & { kind: 'relic'; relicId: string })
  | (PropBase & { kind: 'parcel'; parcelId: string })
  | (PropBase & { kind: 'poseOutline'; poseId: string; tolerance: number })
  | (PropBase & { kind: 'camera' })
  | (PropBase & { kind: 'paperweight'; durationMs?: number })
  | (PropBase & { kind: 'stretchInk' })
  | (PropBase & { kind: 'rescueDrone'; cooldownMs?: number })
  | (PropBase & { kind: 'plate'; recipeId: string; slots: string[] })
  | (PropBase & { kind: 'signalRelay'; op: SignalOp; inputs: SignalId[]; out: SignalId; delayMs?: number });

export type PropKind = Prop['kind'];

// ─── Hazards (§6.3) ─────────────────────────────────────────────────────────

interface HazardBase {
  id: string;
}

export type Hazard =
  | (HazardBase & { kind: 'spikes'; shape: Shape })
  | (HazardBase & { kind: 'laser'; from: Vec2; to: Vec2; onMs: number; offMs: number; phaseMs?: number })
  | (HazardBase & { kind: 'saw'; at: Vec2; r: number; path?: Vec2[]; speed?: number })
  | (HazardBase & { kind: 'crusher'; shape: Shape; path: Vec2[]; speed: number })
  | (HazardBase & { kind: 'heat'; shape: Shape; graceMs: number })
  | (HazardBase & { kind: 'void'; shape: Shape })
  | (HazardBase & { kind: 'wind'; shape: Shape; dir: Vec2; force: number; periodMs?: number })
  | (HazardBase & { kind: 'crumble'; shape: Shape; delayMs: number });

export type HazardKind = Hazard['kind'];

// ─── Objectives (§7) ────────────────────────────────────────────────────────

/**
 * A photo objective is a predicate over sim state at the shutter frame, never
 * image analysis — see §7. Every field is optional and ANDed together.
 */
export interface SnapshotPredicate {
  minSeats?: number;
  allSeatsInFrame?: boolean;
  allAirborne?: boolean;
  anyInverted?: boolean;
  nearPropId?: string;
  chainedSeats?: number;
}

export type Objective =
  | { kind: 'clock'; id: string }
  | { kind: 'haul'; id: string; relicIds: string[] }
  | { kind: 'pose'; id: string; poseId: string }
  | { kind: 'snapshot'; id: string; predicate: SnapshotPredicate }
  | { kind: 'recipe'; id: string; recipeId: string }
  | { kind: 'flawless'; id: string };

export type ObjectiveKind = Objective['kind'];

// ─── Levels (§6.1) ──────────────────────────────────────────────────────────

export interface LevelPalette {
  paper: string;
  ink: string;
  accent: string;
  /** §2.8 — a literal `true`, so an author cannot quietly opt out of flash safety. */
  flashSafe: true;
  /** Asserted against the computed ink/paper ratio by the loader; must be ≥ 7. */
  contrastRatio: number;
}

export interface Checkpoint {
  at: Vec2;
  /** Only active under the Extra Checkpoints assist (§4.7). */
  optional?: boolean;
}

export interface GeometryPiece {
  shape: Shape;
  material: MaterialId;
  render: RenderStyle;
  grabbable?: boolean;
}

export type Decoration =
  | { kind: 'note'; at: Vec2; textKey: string; width?: number }
  | { kind: 'doodle'; at: Vec2; sprite: string; angle?: number; scale?: number }
  | { kind: 'arrow'; from: Vec2; to: Vec2 }
  | { kind: 'stain'; at: Vec2; r: number };

export interface Level {
  version: 1;
  id: string;
  world: number;
  index: number;
  /** An i18n KEY, never display text (§15). */
  name: string;
  minPlayers: number;
  maxPlayers: number;
  parSeconds: number;
  /** §9.8 — the floor a reported completion time must clear to be ranked. */
  minPlausibleSeconds?: number;
  bounds: Rect;
  palette: LevelPalette;
  spawn: Vec2[];
  goal: { shape: Shape; requires: 'any' | 'all' };
  checkpoints: Checkpoint[];
  geometry: GeometryPiece[];
  props: Prop[];
  hazards: Hazard[];
  objectives: Objective[];
  decorations: Decoration[];
  assistBeams: Shape[];
  music: string;
  /** Marker Mosh drives visuals off the audio clock (§14). */
  bpm?: number;
  beatOffsetMs?: number;
  authorNotes?: string;
}

export interface LevelManifestEntry {
  id: string;
  world: number;
  index: number;
  name: string;
  minPlayers: number;
  parSeconds: number;
  /** Showdown arenas carry the round types they support (§8.2). */
  showdownRounds?: ShowdownRoundKind[];
}

export interface WorldManifestEntry {
  world: number;
  /** i18n key. */
  name: string;
  levels: LevelManifestEntry[];
}

export interface LevelManifest {
  version: 1;
  worlds: WorldManifestEntry[];
  showdown: LevelManifestEntry[];
}

// ─── Seats & input (§4, §9.2) ───────────────────────────────────────────────

export type SeatIndex = 0 | 1 | 2 | 3;

export const SEAT_INDICES: readonly SeatIndex[] = [0, 1, 2, 3];

/** The forehead marks that carry seat identity without colour (§2.8). */
export type SeatMark = 'circle' | 'triangle' | 'square' | 'cross';

export interface Cosmetics {
  head: string;
  hat: string | null;
  gloves: string;
  ink: string;
}

/** Per-player assists (§4.7). All are visible in the HUD; none are secret. */
export interface Assists {
  grabAssist: boolean;
  stickyGrip: boolean;
  analogTriggers: boolean;
  autoGrab: boolean;
  slowMo: boolean;
  extraCheckpoints: boolean;
  noFallDamage: boolean;
  aimSmoothing: number;
  oneHanded: boolean;
}

/** Button bitfield in the wire input packet (§9.4). */
export const enum InputButton {
  Emote = 1 << 0,
  UseItem = 1 << 1,
  Drop = 1 << 2,
  ToggleTags = 1 << 3,
  SwapArm = 1 << 4,
}

/**
 * One seat's input for one host frame. `aimL`/`aimR` are unit-ish vectors
 * (length ≤ 1); `gripL`/`gripR` are 0..1 analog pulls.
 */
export interface InputFrame {
  seat: SeatIndex;
  frame: number;
  aimL: Vec2;
  aimR: Vec2;
  gripL: number;
  gripR: number;
  buttons: number;
}

export type SeatLifeState = 'alive' | 'dead' | 'respawning' | 'drone' | 'frozen';

// ─── Snapshots (§9.4) ───────────────────────────────────────────────────────

export interface SnapshotSeat {
  seat: SeatIndex;
  state: SeatLifeState;
  head: Vec2;
  headV: Vec2;
  headAngle: number;
  handL: Vec2;
  handR: Vec2;
  /** 0 = not gripping; otherwise the grip strength 1..255 as sent on the wire. */
  gripL: number;
  gripR: number;
  /** Body id being gripped, 0 = static world geometry. */
  gripTargetL: number;
  gripTargetR: number;
}

export interface SnapshotProp {
  id: number;
  x: number;
  y: number;
  angle: number;
}

export const enum SnapshotFlag {
  Paused = 1 << 0,
  CatActive = 1 << 1,
  Keyframe = 1 << 2,
  Finished = 1 << 3,
}

export interface Snapshot {
  frame: number;
  flags: number;
  seats: SnapshotSeat[];
  props: SnapshotProp[];
}

// ─── Discrete host events (§9.3 `br:event`) ─────────────────────────────────

export type GameEvent =
  | { kind: 'death'; seat: SeatIndex; at: Vec2; cause: 'bounds' | 'hazard' | 'impact' }
  | { kind: 'respawn'; seat: SeatIndex; at: Vec2 }
  | { kind: 'checkpoint'; index: number }
  | { kind: 'objective'; objectiveId: string }
  | { kind: 'parcel'; parcelId: string; seat: SeatIndex }
  | { kind: 'item'; propId: string; seat: SeatIndex; kindOf: PropKind }
  | { kind: 'signal'; signal: SignalId; value: boolean }
  | { kind: 'cat' }
  | { kind: 'finish'; ms: number; objectives: string[]; deaths: number; assisted: boolean }
  | { kind: 'grip'; seat: SeatIndex; hand: 'l' | 'r'; on: boolean }
  | { kind: 'emote'; seat: SeatIndex; emoteId: string };

// ─── Rooms & multiplayer (§9.2) ─────────────────────────────────────────────

export type RoomMode = 'campaign' | 'showdown' | 'solo-ladder';

export type ShowdownRoundKind = 'race' | 'survive' | 'handle';

export interface SeatView {
  seat: SeatIndex;
  clientId: string;
  userId: string | null;
  name: string;
  localIndex: number;
  cosmetics: Cosmetics;
  assists: Assists;
  ready: boolean;
  connected: boolean;
  /** Round-trip time to the host in ms, or null before the first probe. */
  rtt: number | null;
}

export interface RoomView {
  id: string;
  code: string;
  mode: RoomMode;
  private: boolean;
  hostClientId: string;
  levelId: string | null;
  phase: 'lobby' | 'playing' | 'results';
  seats: SeatView[];
  showdown?: {
    ranked: boolean;
    teams: boolean;
    scores: number[];
    round: number;
    roundKind: ShowdownRoundKind | null;
  };
}

// ─── Results (§9.8, §10) ────────────────────────────────────────────────────

export interface LevelResult {
  levelId: string;
  playerCount: number;
  durationMs: number;
  deaths: number;
  objectiveIds: string[];
  assisted: boolean;
  catUsed: boolean;
  seats: { seat: SeatIndex; userId: string | null }[];
}

export interface ShowdownResult {
  ranked: boolean;
  teams: boolean;
  rounds: number;
  players: { seat: SeatIndex; userId: string | null; roundsWon: number; won: boolean }[];
}

// ─── Progress (§10, §11) ────────────────────────────────────────────────────

export interface LevelClear {
  levelId: string;
  playerCount: number;
  bestMs: number;
  /** Bitmask over the level's three objectives, in authored order. */
  objectives: number;
  assisted: boolean;
  clears: number;
}

export interface Profile {
  cosmetics: Cosmetics;
  unlockedCosmetics: string[];
  parcelsFound: string[];
  posesFound: string[];
  recipesMade: string[];
  clears: Record<string, LevelClear>;
  levelsCleared: number;
  deaths: number;
  metresSwung: number;
  showdownRating: number;
  showdownWins: number;
  showdownLosses: number;
  settings: GameSettings;
  updatedAt: number;
}

// ─── The engine↔everything contract ─────────────────────────────────────────

/**
 * What the physics engine exposes to the host loop, the renderer and the HUD.
 *
 * This interface is the seam the whole implementation is split along: `net/`
 * drives a `Simulation` without knowing it is matter.js, `render/` reads a
 * `RenderState` without knowing it is a simulation at all, and a guest client
 * feeds interpolated snapshots into the same renderer with no engine present.
 * Keep it free of matter.js types for exactly that reason.
 */
export interface Simulation {
  /** Advance by one fixed step, applying the inputs supplied since the last call. */
  step(inputs: InputFrame[]): void;
  /** The current authoritative frame number. */
  readonly frame: number;
  /** Take a wire snapshot of the current state. */
  snapshot(keyframe: boolean): Snapshot;
  /** Events produced since the last drain, in order. */
  drainEvents(): GameEvent[];
  /** State for the renderer, interpolated `alpha` between the last two steps. */
  render(alpha: number): RenderState;
  addSeat(seat: SeatIndex, cosmetics: Cosmetics, assists: Assists): void;
  removeSeat(seat: SeatIndex): void;
  setAssists(seat: SeatIndex, assists: Assists): void;
  /** Rewind support for lag-compensated grabs (§9.5); bounded by NET.LAGCOMP_MAX_MS. */
  resolveGrabAt(seat: SeatIndex, hand: 'l' | 'r', frame: number): void;
  dispose(): void;
}

/** One character as the renderer needs it — positions only, no bodies. */
export interface RenderSeat {
  seat: SeatIndex;
  state: SeatLifeState;
  cosmetics: Cosmetics;
  head: Vec2;
  headAngle: number;
  /** Squash/stretch, derived from velocity and recent impacts (§2.7). */
  scaleX: number;
  scaleY: number;
  /** Arm polylines, shoulder → hand, ARM_SEGMENTS + 1 points each. */
  armL: Vec2[];
  armR: Vec2[];
  gripL: boolean;
  gripR: boolean;
  /** 0..1 of GRIP_BREAK_FORCE — drives the thinning stroke and the rumble ramp. */
  tensionL: number;
  tensionR: number;
  /** Within GRAB_RADIUS of something grabbable — drives the "reaching" hand pose. */
  reachingL: boolean;
  reachingR: boolean;
  carrying: string | null;
}

export interface RenderProp {
  id: string;
  kind: PropKind;
  at: Vec2;
  angle: number;
  /** Props whose visual state is not implied by their transform. */
  active?: boolean;
  progress?: number;
}

export interface RenderState {
  seats: RenderSeat[];
  props: RenderProp[];
  /** Hazards whose visual state cycles (lasers, crushers). */
  hazards: { id: string; active: boolean; progress?: number }[];
  splats: { at: Vec2; sprite: number; angle: number; seat: SeatIndex }[];
  camera: { x: number; y: number; zoom: number };
  frame: number;
  elapsedMs: number;
  checkpointIndex: number;
  catActive: boolean;
}

export interface GameSettings {
  assists: Assists;
  music: number;
  sfx: number;
  ui: number;
  rumble: number;
  alwaysShowTags: boolean;
  catAfterWipes: 0 | 3 | 6;
  touchScheme: 'auto-grab' | 'two-stick';
  touchTilt: boolean;
  deadzone: number;
  saturation: number;
  padBrand: 'auto' | 'xbox' | 'playstation' | 'nintendo' | 'generic';
}
