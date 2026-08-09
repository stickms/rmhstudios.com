/**
 * Bum's Rush — every tunable in one place.
 *
 * `PHYSICS` is a system, not a list: `GRIP_BREAK_FORCE`, `HEAD_MASS` and the
 * player count are one equation, so raising head mass makes four-player chains
 * tear at rest. Any change to a value here must be validated against the four
 * feel tests in `__tests__/physics-feel.test.ts` (design doc §3.6), which are
 * the executable statement of what "feels right" means:
 *
 *   1. One player can swing from a handhold and reach a ledge 300px away.
 *   2. Two chained players cross a 420px gap with one anchored.
 *   3. Four players hanging from one anchor do NOT tear at rest, but do tear
 *      if the bottom one swings hard.
 *   4. A 1000px fall is survivable; 1600px is not.
 *
 * Nothing else in the engine should carry a magic number.
 */

export const PHYSICS = {
  FIXED_DT_MS: 1000 / 60,
  /** Accumulator clamp — a tab that was backgrounded must not spiral. */
  MAX_SUBSTEPS: 3,
  GRAVITY_Y: 1.15,

  HEAD_RADIUS: 26,
  HEAD_MASS: 1.2,
  HEAD_AIR_FRICTION: 0.012,
  HEAD_RESTITUTION: 0.15,

  ARM_SEGMENTS: 4,
  ARM_SEG_LENGTH: 22,
  ARM_SEG_RADIUS: 4,
  ARM_SEG_MASS: 0.05,
  /** Shoulder pulls hardest, wrist least — this is what makes an arm whip. */
  ARM_SEG_WEIGHT: [1.0, 0.85, 0.7, 0.55] as const,
  ARM_REACH_GAIN: 0.0016,
  ARM_FORCE_MAX: 0.0055,
  /** A centred stick goes limp, which is how you read a falling player. */
  ARM_LIMP_GAIN: 0.15,
  ARM_REACH_PX: 118,
  ARM_REACH_PX_STRETCHED: 176,
  STRETCH_INK_MS: 20_000,
  SHOULDER_OFFSET_X: 18,
  SHOULDER_OFFSET_Y: -6,

  HAND_RADIUS: 10,
  HAND_MASS: 0.12,
  HAND_FRICTION: 0.9,

  GRAB_RADIUS: 18,
  GRAB_RADIUS_ASSIST: 24,
  GRIP_STIFFNESS: 0.95,
  GRIP_DAMPING: 0.12,
  GRIP_BREAK_FORCE: 0.085,
  /** Above this fraction of break force the arm renders stretched and rumbles. */
  GRIP_WARN_RATIO: 0.7,
  /** Analog trigger below this reports no grip at all. */
  TRIGGER_GRIP_FLOOR: 0.25,
  /** A light analog pull grips at 60% strength; a full pull at 100%. */
  TRIGGER_GRIP_MIN_SCALE: 0.6,

  RELEASE_ASSIST_WINDOW_MS: 80,
  RELEASE_ASSIST_SCALE: 1.08,

  /** Player-to-player grips cap out, or one strong player pins another (§8.3). */
  PVP_GRIP_MAX_MS: 3500,
  PVP_GRIP_COOLDOWN_MS: 1500,
  RESPAWN_INVULN_MS: 1200,

  DEATH_SPEED: 26,
  RESPAWN_DELAY_MS: 900,

  DESIGN_WIDTH: 1920,
  DESIGN_HEIGHT: 1080,
} as const;

/** Grip multiplier and surface friction per material (§6.2). */
export const MATERIALS = {
  paper: { grip: 1.0, friction: 0.6, pattern: 'crosshatch' },
  rubber: { grip: 1.6, friction: 0.95, pattern: 'stipple' },
  ice: { grip: 0.45, friction: 0.05, pattern: 'thin' },
  grease: { grip: 0.25, friction: 0.02, pattern: 'streak' },
  crumbly: { grip: 1.0, friction: 0.6, pattern: 'broken' },
  nogrip: { grip: 0.0, friction: 0.4, pattern: 'wash' },
} as const;

/** Matter.js collision categories (§3.1). */
export const LAYER = {
  WORLD: 0x0001,
  HEAD: 0x0002,
  ARM: 0x0004,
  HAND: 0x0008,
  PROP: 0x0010,
  HAZARD: 0x0020,
  CARRY: 0x0040,
} as const;

/**
 * Masks, stated rather than derived, because the one decision that matters is
 * legible only when written out: arms collide with neither heads nor other
 * arms. Four players tangling in one gap is the point of the game; arm-vs-arm
 * collision turns that into a jittering knot that ejects everyone.
 */
export const MASK = {
  WORLD: 0xffff,
  HEAD: LAYER.WORLD | LAYER.PROP | LAYER.HAZARD | LAYER.HEAD,
  ARM: LAYER.WORLD | LAYER.PROP,
  HAND: LAYER.WORLD | LAYER.PROP | LAYER.HAZARD,
  PROP: 0xffff,
  HAZARD: LAYER.HEAD | LAYER.HAND | LAYER.PROP,
  CARRY: LAYER.WORLD,
} as const;

export const CAMERA = {
  MIN_ZOOM: 0.55,
  MAX_ZOOM: 1.35,
  SOLO_MIN_ZOOM: 0.85,
  SOLO_MAX_ZOOM: 1.2,
  MARGIN: 140,
  /** Critically damped: no overshoot, no motion sickness. */
  SPRING_OMEGA: 6.0,
  SPRING_ZETA: 1.0,
  LOOKAHEAD: 0.18,
  LOOKAHEAD_MAX: 180,
  DEAD_EXCLUDE_MS: 400,
} as const;

export const RENDER = {
  /** The boil advances every 3rd frame — a 20fps wobble under a 60fps sim. */
  BOIL_FRAME_DIVISOR: 3,
  BOIL_AMPLITUDE_WORLD: 1.4,
  BOIL_AMPLITUDE_ACTOR: 0.8,
  /** The graphite under-pass that does most of the "drawn" impression. */
  GRAPHITE_OFFSET: 1.5,
  GRAPHITE_ALPHA: 0.4,
  STROKE_TAPER: 0.35,
  MAX_PARTICLES: 120,
  MAX_SPLATS: 40,
  /** Velocity at which head stretch saturates. */
  STRETCH_REF_SPEED: 1800,
  STRETCH_MAX: 0.35,
  SQUASH_ON_IMPACT: 0.75,
  SQUASH_RECOVER_MS: 180,
} as const;

export const NET = {
  /** Host simulates at 60Hz, ships state at 20Hz, receives input at 30Hz. */
  SNAPSHOT_HZ: 20,
  INPUT_HZ: 30,
  /** Every 20th snapshot carries every prop, so a joiner resyncs within 1s. */
  KEYFRAME_INTERVAL: 20,
  /** Inputs repeat the last 3 frames; the host de-duplicates by frame number. */
  INPUT_REDUNDANCY: 3,
  INTERP_BUFFER_MS: 100,
  INTERP_BUFFER_MAX_MS: 200,
  EXTRAPOLATE_MAX_MS: 120,
  /** Bounded rewind for lag-compensated grabs (§9.5). */
  LAGCOMP_MAX_MS: 250,
  LOCAL_ARM_BLEND_MS: 80,
  /** Above this RTT a seat auto-enables grab assist, and says so. */
  RTT_ASSIST_MS: 120,
  RTT_MIGRATE_MS: 300,
  RECONNECT_GRACE_MS: 90_000,
  DEVICE_REJOIN_GRACE_MS: 60_000,
  MAX_SEATS: 4,
  /** Quantisation: positions to 1/4 px, angles to 1/64 rad. */
  POS_SCALE: 4,
  ANGLE_SCALE: 64,
  PROP_DIRTY_EPSILON: 0.25,
} as const;

export const ASSIST = {
  /** Inkblot the studio cat arrives after this many wipes on one checkpoint. */
  CAT_WIPES_DEFAULT: 6,
  DRONE_STRANDED_MS: 20_000,
  DRONE_COOLDOWN_MS: 45_000,
  SLOWMO_SCALE: 0.75,
} as const;

/** Seat colours are CSS custom properties; the marks are what carry identity. */
export const SEAT_INK = ['--bum-seat-1', '--bum-seat-2', '--bum-seat-3', '--bum-seat-4'] as const;
export const SEAT_MARKS = ['circle', 'triangle', 'square', 'cross'] as const;

/** Socket event names. Client and server import these so they cannot drift. */
export const BR_C2S = {
  CREATE_ROOM: 'br:createRoom',
  JOIN_ROOM: 'br:joinRoom',
  QUICK_PLAY: 'br:quickPlay',
  LIST_ROOMS: 'br:listRooms',
  CLAIM_SEAT: 'br:claimSeat',
  RELEASE_SEAT: 'br:releaseSeat',
  SET_COSMETICS: 'br:setCosmetics',
  SET_ASSISTS: 'br:setAssists',
  READY: 'br:ready',
  SELECT_LEVEL: 'br:selectLevel',
  START: 'br:start',
  INPUT: 'br:input',
  SNAPSHOT: 'br:snapshot',
  EVENT: 'br:event',
  EMOTE: 'br:emote',
  RESULT: 'br:result',
  HOST_HANDOFF: 'br:hostHandoff',
  PING: 'br:ping',
  LEAVE: 'br:leave',
} as const;

export const BR_S2C = {
  ROOM: 'br:room',
  ROOM_LIST: 'br:roomList',
  SEAT: 'br:seat',
  START: 'br:start',
  INPUT: 'br:input',
  SNAPSHOT: 'br:snapshot',
  EVENT: 'br:event',
  EMOTE: 'br:emote',
  HOST_CHANGED: 'br:hostChanged',
  PEER_JOINED: 'br:peerJoined',
  PEER_LEFT: 'br:peerLeft',
  PONG: 'br:pong',
  ERROR: 'br:error',
  KICKED: 'br:kicked',
} as const;

/** Wire payload ceilings, enforced server-side (§9.3). */
export const NET_LIMITS = {
  SNAPSHOT_BYTES: 2048,
  INPUT_BYTES: 256,
  GENERIC_BYTES: 1024,
  MAX_NAME_LEN: 32,
  MAX_CODE_LEN: 6,
} as const;

export const DEFAULT_ASSISTS = {
  grabAssist: false,
  stickyGrip: false,
  analogTriggers: true,
  autoGrab: false,
  slowMo: false,
  extraCheckpoints: false,
  noFallDamage: false,
  aimSmoothing: 0.35,
  oneHanded: false,
} as const;

export const DEFAULT_COSMETICS = {
  head: 'biro',
  hat: null,
  gloves: 'mitten',
  ink: 'seat-1',
} as const;
