/**
 * Massive March — the wire protocol.
 *
 * Shared verbatim by `server/socket-server/handlers/massive-march.ts` and the
 * browser client, and deliberately free of every browser and Node import so the
 * hub's esbuild bundle can swallow it whole (`server/CLAUDE.md` gotcha 7).
 *
 * Two things are worth knowing before reading it:
 *
 * **The server is the authority on everything that is not a camera.** Positions
 * are reported by clients (with a speed clamp, because a co-op game does not
 * need an arms race, only desync insurance); puzzle state, item ownership, the
 * clock, the orbs and every unlock are decided by the hub and broadcast. A
 * client that lied about pressing a button would be arguing with the only copy
 * of the state that exists.
 *
 * **What a client is told is what its player may know.** The sequence inside a
 * sealed booth is sent only to the sockets standing in that booth; the totem
 * target only to whoever is on the lookout; the finder's reading only to
 * whoever is holding it. Filtering in the UI would not be hiding anything — the
 * bytes would already be on the machine — and the entire game is built on the
 * asymmetry being real.
 */

import type { WorldVariant } from '../constants';
import type { ChatChannel } from '../world/audio';
import type { KeyId, SymbolId, UnlockId } from '../world/sites';

// ─── Client → server ────────────────────────────────────────────────────────

export const C2S = {
  CREATE: 'mm:create',
  JOIN: 'mm:join',
  RESUME: 'mm:resume',
  LIST: 'mm:list',
  LEAVE: 'mm:leave',
  SETTINGS: 'mm:settings',

  /** Position report. High frequency; the only unacknowledged message. */
  MOVE: 'mm:move',
  GESTURE: 'mm:gesture',

  CHAT: 'mm:chat',
  BOARD: 'mm:board',

  TAKE: 'mm:take',
  STOW: 'mm:stow',
  EQUIP: 'mm:equip',
  DROP: 'mm:drop',
  THROW: 'mm:throw',
  KICK: 'mm:kick',
  USE: 'mm:use',
  /** Reach into someone else's backpack — the one action you cannot do alone. */
  PACK: 'mm:pack',

  ACT: 'mm:act',
  SKIP: 'mm:skip',
  DEPOSIT: 'mm:deposit',
  CART: 'mm:cart',

  VOICE_SIGNAL: 'mm:voice:signal',
  VOICE_STATE: 'mm:voice:state',
} as const;

// ─── Server → client ────────────────────────────────────────────────────────

export const S2C = {
  SESSION: 'mm:session',
  CAMPAIGNS: 'mm:campaigns',
  JOINED: 'mm:joined',
  ERROR: 'mm:error',
  KICKED: 'mm:kicked',

  /** Slow: only when something changes, plus a heartbeat. */
  WORLD: 'mm:world',
  /** Fast: positions and loose objects. */
  TICK: 'mm:tick',

  CHAT: 'mm:chat',
  /** Private information, sent only to the sockets entitled to it. */
  REVEAL: 'mm:reveal',
  /** What is inside the backpack you just opened — sent only to the opener. */
  PACK_CONTENTS: 'mm:pack:contents',
  EVENT: 'mm:event',

  VOICE_SIGNAL: 'mm:voice:signal',
  VOICE_PEERS: 'mm:voice:peers',
} as const;

// ─── Session ────────────────────────────────────────────────────────────────

export interface MemberInfo {
  socketId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** Stable seat index; drives avatar colour and every compact tick payload. */
  slot: number;
  isHost: boolean;
  /** False while a dropped player is inside the grace window. */
  connected: boolean;
}

export interface SessionSnapshot {
  code: string;
  campaignId: string;
  name: string;
  variant: WorldVariant;
  /** Host-controlled: may any challenge be skipped (§17). */
  allowSkip: boolean;
  hostSocketId: string;
  members: MemberInfo[];
  maxPlayers: number;
}

/** A campaign this account can rejoin, for the front screen. */
export interface CampaignSummary {
  id: string;
  code: string;
  name: string;
  variant: WorldVariant;
  orbs: number;
  solved: number;
  finished: boolean;
  updatedAt: number;
  hostName: string;
  /** True when the host is online right now and the campaign can be joined. */
  live: boolean;
  /** True when this account owns the save and may host it. */
  owned: boolean;
}

// ─── World ──────────────────────────────────────────────────────────────────

export type PuzzleState = 'locked' | 'idle' | 'active' | 'solved' | 'skipped';

export interface PuzzleStatus {
  id: string;
  state: PuzzleState;
  /** Steps completed and steps needed, for the site's own progress readout. */
  step: number;
  total: number;
  /** Reason the site will not run, when `state` is `locked`. */
  lockedBy?: 'key' | 'night' | 'crew';
  /** Pads/plates the site currently wants stood on. */
  lit?: string[];
  /** Which of the lit set are occupied right now. */
  held?: string[];
  /** Totem facings, 0–7. */
  facings?: number[];
  /** Console presses so far, as symbols — public, because they are lit up. */
  pressed?: SymbolId[];
  /** The console's button faces. Public: they are painted on the machine. */
  buttons?: SymbolId[];
  /** Slot of the player currently wearing the bucket at a blind site. */
  wearer?: number | null;
  /** Hoop passes made. */
  throws?: number;
  /** Buried markers found. */
  found?: number;
  /** Stage of the Final March: 0 read, 1 turn, 2 stand. */
  stage?: number;
}

export interface TowerStatus {
  id: string;
  deposited: number;
  threshold: number;
  satisfied: boolean;
}

export interface WorldSnapshot {
  /** Server clock at send, so the client can run the day forward locally. */
  serverTime: number;
  /** 0…1 through the in-game day at `serverTime`. */
  dayFraction: number;
  /** Red rounds banked in towers, plus those still being carried. */
  deposited: number;
  carried: number;
  puzzles: PuzzleStatus[];
  towers: TowerStatus[];
  keys: KeyId[];
  unlocks: UnlockId[];
  finished: boolean;
  /** Sites whose signs the group has walked past, for the map sheet. */
  discovered: string[];
  /**
   * What every loose object on the island IS. The fifteen-a-second tick carries
   * only ids and positions, so this is the lookup that gives them meaning — sent
   * whenever anything about the objects changes, and on the heartbeat.
   */
  items: ItemDescriptor[];
}

// ─── Ticks ──────────────────────────────────────────────────────────────────

/** Player state bits, packed into one number per tick. */
export const BIT = {
  RUN: 1,
  CROUCH: 2,
  SIT: 4,
  AIR: 8,
  TORCH: 16,
  LASER: 32,
  BLIND: 64,
  SPEAKING: 128,
  /** Transmitting on the radio right now. */
  RADIO: 256,
  /** Transmitting through a megaphone right now. */
  MEGAPHONE: 512,
  BINOCULARS: 1024,
  BOARD: 2048,
  /**
   * A radio is within reach — the RECEIVE side of the rule, which is separate
   * from transmitting because a radio call reaches only people carrying one, and
   * the listener's client has to be able to work that out for itself when it
   * decides how loud a peer should be.
   */
  HAS_RADIO: 4096,
} as const;

/** Bits the client owns; everything else the server derives and overwrites. */
export const CLIENT_BITS = BIT.RUN | BIT.CROUCH | BIT.SIT | BIT.AIR;

/**
 * One player, one tick: `[slot, x, y, z, yaw, pitch, bits, gesture]`.
 *
 * An array rather than an object because this is the only message that goes out
 * fifteen times a second to twelve people — the field names would be two thirds
 * of the bytes.
 */
export type PlayerTick = [number, number, number, number, number, number, number, number];

/** One loose object: `[itemId, x, y, z, holderSlot | -1, bits]`. */
export type ItemTick = [number, number, number, number, number, number];

export const ITEM_BIT = {
  LIT: 1, // torch on, flare burning, ball glowing
  HELD: 2,
  FLYING: 4,
} as const;

/**
 * Where a carried object is kept, packed into the same tick byte.
 *
 * The client needs this for more than a tidy inventory panel: a backpack in the
 * `worn` slot is what makes its wearer somebody you can walk up to and rummage
 * through, and a radio on a belt still receives while one in a pack does not.
 */
export const ITEM_SLOTS = ['hands', 'belt', 'pack', 'worn'] as const;
export const ITEM_SLOT_SHIFT = 3;
export const ITEM_SLOT_MASK = 3;

export interface TickFrame {
  t: number;
  p: PlayerTick[];
  i: ItemTick[];
}

/** Item identity is numeric on the wire; this is the lookup that goes with it. */
export interface ItemDescriptor {
  id: number;
  kind: string;
  /** Text written on a whiteboard, if this is one. */
  label?: string;
}

// ─── Chat ───────────────────────────────────────────────────────────────────

export interface ChatLine {
  id: string;
  fromSlot: number;
  name: string;
  text: string;
  channel: ChatChannel;
  /** 0…1; the UI dims and italicises in proportion. */
  muffle: number;
  at: number;
}

// ─── Reveals ────────────────────────────────────────────────────────────────

export type Reveal =
  /** The glyph sequence painted inside a booth. */
  | { kind: 'booth'; site: string; booth: string; symbols: SymbolId[]; offset: number }
  /** Target facings, legible only from the lookout. */
  | { kind: 'totems'; site: string; facings: number[] }
  /**
   * Which plate the blinded player must reach next.
   *
   * Normally never sent to them — that asymmetry IS the puzzle. Solo is the one
   * exception: there is nobody to hand it to, so it goes to the wearer with a
   * `guide` (compass point + metres) and nothing else. They still cannot see,
   * still have to walk it, and still lose the route by stepping on the wrong
   * plate; what they no longer need is a second person to read it out.
   */
  | {
      kind: 'plate';
      site: string;
      plate: string;
      index: number;
      guide?: { compass: number; distance: number };
    }
  /** Distance to the nearest unfound marker, for whoever holds the finder. */
  | { kind: 'finder'; site: string; distance: number }
  /** Nothing to show any more — clears whatever was on screen. */
  | { kind: 'clear'; site: string };

// ─── Events ─────────────────────────────────────────────────────────────────

export type WorldEvent =
  | { kind: 'joined'; name: string; slot: number }
  | { kind: 'left'; name: string; slot: number }
  | { kind: 'host'; name: string; slot: number }
  | { kind: 'solved'; site: string; reward: number }
  | { kind: 'skipped'; site: string }
  | { kind: 'reset'; site: string; reason: string }
  | { kind: 'orb'; slot: number; carried: number }
  | { kind: 'deposit'; tower: string; deposited: number; threshold: number }
  | { kind: 'key'; key: KeyId; tower: string }
  | { kind: 'unlock'; unlock: UnlockId }
  | { kind: 'flare'; x: number; z: number }
  | { kind: 'bell'; x: number; z: number; slot: number }
  | { kind: 'cart'; to: 'north' | 'south' }
  | { kind: 'discovered'; site: string }
  | { kind: 'finished' };

// ─── Actions ────────────────────────────────────────────────────────────────

/** Everything a player can do to a puzzle installation. */
export type PuzzleAction =
  /** Press a console button showing `symbol`. */
  | { site: string; action: 'press'; symbol: SymbolId }
  /** Rotate a totem one eighth turn. */
  | { site: string; action: 'turn'; totem: string }
  /** Put the bucket on / take it off at a blind site. */
  | { site: string; action: 'wear' }
  /** Dig where the finder is loudest. */
  | { site: string; action: 'dig' }
  /** Start (or restart) the installation. */
  | { site: string; action: 'begin' };

export interface VoiceSignal {
  /** Peer socket id. */
  peer: string;
  kind: 'offer' | 'answer' | 'ice';
  /** SDP string or a serialised ICE candidate — opaque to the hub. */
  data: unknown;
}

export const MAX_JOIN_CODE_LENGTH = 8;
