/**
 * The wire protocol between a host and its peers. The host is authoritative: it orders every command into a tick,
 * and every peer runs the same deterministic sim (`stepWorld`) over the same ordered stream, so all worlds stay
 * identical without shipping state every frame. Peers are untrusted — everything they send is parsed against the
 * schemas here, and the host stamps the sender's (hub-vouched) identity itself; a command never carries one.
 */

import { z } from 'zod';
import { BUILDING_IDS, CROP_IDS, ITEM_IDS, WEAPON_IDS } from '../content';
import { SKIN_IDS } from '../skins';
import type { LocalCommand } from '../store';
import { decodeWorld, encodeWorld } from '../save';
import type { World } from '../world';

/**
 * v1: welcome / tick / successor. v2: `reject` (the host tells a peer, and only that peer, which of its commands
 * were refused and why). A v2 host talks to a v1 peer unchanged (the peer counts `reject` as a protocol error and
 * carries on), and a v2 peer accepts a v1 host (it simply never hears a `reject`); a host NEWER than we are is
 * refused (`PeerSession.incompatible`) rather than half-understood.
 */
export const PROTOCOL_VERSION = 2;
export const MIN_PROTOCOL_VERSION = 1;
/** A peer's JSON message may be at most this large. */
export const MAX_PEER_MESSAGE_BYTES = 4096;
/** A host's JSON message may be at most this large (a tick of 8 players' commands is a few KB). */
export const MAX_HOST_MESSAGE_BYTES = 64 * 1024;
/** Refusals in one `reject` frame. */
export const MAX_REJECT_ITEMS = 64;
/** The reason sent when the host dropped a command unread because the peer was over its rate (not a world rule). */
export const RATE_LIMITED = 'rate-limited';

const int = z.number().int();
const coord = int.min(0).max(4096);

export const localCommandSchema: z.ZodType<LocalCommand> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join') }).strict(),
  z.object({ type: z.literal('move'), x: z.number().finite(), z: z.number().finite() }).strict(),
  z
    .object({
      type: z.literal('place'),
      kind: z.enum(BUILDING_IDS),
      x: coord,
      z: coord,
      rot: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
    })
    .strict(),
  z.object({ type: z.literal('remove'), x: coord, z: coord }).strict(),
  z.object({ type: z.literal('plant'), crop: z.enum(CROP_IDS), x: coord, z: coord }).strict(),
  z.object({ type: z.literal('harvest'), x: coord, z: coord }).strict(),
  z.object({ type: z.literal('cook'), recipe: z.string().min(1).max(32) }).strict(),
  z.object({ type: z.literal('sell'), item: z.enum(ITEM_IDS), qty: int.min(1).max(9999) }).strict(),
  // The crime route. Aim points are finite and bounded; the sim enforces fire rate and ammo, not this schema.
  z.object({ type: z.literal('hustle'), item: z.enum(ITEM_IDS), qty: int.min(1).max(9999) }).strict(),
  z.object({ type: z.literal('buyWeapon'), weapon: z.enum(WEAPON_IDS) }).strict(),
  z.object({ type: z.literal('equip'), weapon: z.enum(WEAPON_IDS).nullable() }).strict(),
  z
    .object({ type: z.literal('shoot'), x: z.number().finite().min(-8192).max(8192), z: z.number().finite().min(-8192).max(8192) })
    .strict(),
  z.object({ type: z.literal('reload') }).strict(),
  z.object({ type: z.literal('forage'), x: coord, z: coord }).strict(),
  z.object({ type: z.literal('serve'), npcId: int.min(0).max(2 ** 31) }).strict(),
  z.object({ type: z.literal('collect'), x: coord, z: coord }).strict(),
  z.object({ type: z.literal('hire'), x: coord, z: coord }).strict(),
  z.object({ type: z.literal('fire'), workerId: int.min(0).max(2 ** 31) }).strict(),
  z.object({ type: z.literal('buySkin'), skin: z.enum(SKIN_IDS) }).strict(),
  z.object({ type: z.literal('setSkin'), skin: z.enum(SKIN_IDS) }).strict(),
]) as z.ZodType<LocalCommand>;

/**
 * Every command a player can issue needs a schema above, or a peer's command of that type is refused by
 * the host as a malformed frame (the `as` cast hides the gap). Adding a command type to the world makes
 * this fail to compile until the schema lists it — a loud break instead of "multiplayer ignores hire".
 */
const COMMAND_TYPES_HAVE_SCHEMAS: Record<LocalCommand['type'], true> = {
  join: true,
  move: true,
  place: true,
  remove: true,
  plant: true,
  harvest: true,
  cook: true,
  sell: true,
  hustle: true,
  buyWeapon: true,
  equip: true,
  shoot: true,
  reload: true,
  forage: true,
  serve: true,
  collect: true,
  hire: true,
  fire: true,
  buySkin: true,
  setSkin: true,
};
void COMMAND_TYPES_HAVE_SCHEMAS;

/** Peer → host. */
export const peerMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('cmd'), seq: int.min(0).max(2 ** 31), cmd: localCommandSchema }).strict(),
  z.object({ t: z.literal('resync') }).strict(),
]);
export type PeerMessage = z.infer<typeof peerMessageSchema>;

/** One ordered command in a tick, as every replica applies it. */
export interface TickCommand {
  /** Hub-vouched sender, stamped by the host. */
  p: string;
  cmd: LocalCommand;
}

/** One refusal: the peer's command `seq` and why (a world `RejectReason`, or `rate-limited`). */
export type RejectItem = [seq: number, reason: string];

/** Host → peer (JSON frames; snapshots are a separate binary frame). */
export type HostMessage =
  | { t: 'welcome'; v: number; you: string; successor: string | null }
  | { t: 'tick'; n: number; cmds: TickCommand[]; acks: Record<string, number> }
  | { t: 'successor'; id: string | null }
  /** To the issuing peer ONLY (never broadcast): these commands were refused, here is why. */
  | { t: 'reject'; items: RejectItem[] };

const zPlayerId = z.string().min(1).max(64);
/** A reason is a short kebab-case code; the UI maps the ones it knows and shows a generic line for the rest. */
const zReason = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);

/**
 * Every host frame is parsed before a peer acts on it: the host is another player's browser, and a modified one
 * must not be able to crash or confuse the replicas (a tick's commands go through the same command schema the
 * host applies to peers).
 */
export const hostMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('welcome'), v: int.min(0).max(1000), you: zPlayerId, successor: zPlayerId.nullable() }).strict(),
  z
    .object({
      t: z.literal('tick'),
      n: int.min(0).max(2 ** 31),
      cmds: z.array(z.object({ p: zPlayerId, cmd: localCommandSchema }).strict()).max(512),
      acks: z.record(zPlayerId, int.min(-1).max(2 ** 31)).refine((a) => Object.keys(a).length <= 64),
    })
    .strict(),
  z.object({ t: z.literal('successor'), id: zPlayerId.nullable() }).strict(),
  z
    .object({
      t: z.literal('reject'),
      items: z.array(z.tuple([int.min(0).max(2 ** 31), zReason])).max(MAX_REJECT_ITEMS),
    })
    .strict(),
]);

const FRAME_JSON = 1;
const FRAME_SNAPSHOT = 2;

export function encodeJson(msg: HostMessage | PeerMessage): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(msg));
  const out = new Uint8Array(body.length + 1);
  out[0] = FRAME_JSON;
  out.set(body, 1);
  return out;
}

/** A snapshot frame: the world at tick `n`, plus the acks the new replica needs to know what was already applied. */
export function encodeSnapshot(world: World, acks: Record<string, number>): Uint8Array {
  const ackBytes = new TextEncoder().encode(JSON.stringify(acks));
  const worldBytes = encodeWorld(world);
  const out = new Uint8Array(1 + 4 + ackBytes.length + worldBytes.length);
  out[0] = FRAME_SNAPSHOT;
  new DataView(out.buffer).setUint32(1, ackBytes.length);
  out.set(ackBytes, 5);
  out.set(worldBytes, 5 + ackBytes.length);
  return out;
}

export type Frame =
  | { kind: 'json'; value: unknown }
  | { kind: 'snapshot'; world: World; acks: Record<string, number> }
  | { kind: 'invalid' };

export function decodeFrame(data: Uint8Array, opts: { maxJsonBytes?: number } = {}): Frame {
  try {
    if (data.length < 2) return { kind: 'invalid' };
    if (data[0] === FRAME_JSON) {
      if (opts.maxJsonBytes !== undefined && data.length > opts.maxJsonBytes) return { kind: 'invalid' };
      return { kind: 'json', value: JSON.parse(new TextDecoder().decode(data.subarray(1))) };
    }
    if (data[0] === FRAME_SNAPSHOT) {
      const ackLen = new DataView(data.buffer, data.byteOffset).getUint32(1);
      if (ackLen > data.length - 5) return { kind: 'invalid' };
      const acks = JSON.parse(new TextDecoder().decode(data.subarray(5, 5 + ackLen)));
      const world = decodeWorld(data.subarray(5 + ackLen));
      return { kind: 'snapshot', world, acks: sanitiseAcks(acks) };
    }
  } catch {
    // fall through
  }
  return { kind: 'invalid' };
}

function sanitiseAcks(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') {
    for (const [k, n] of Object.entries(v)) if (Number.isInteger(n) && (n as number) >= -1) out[k] = n as number;
  }
  return out;
}

/** The part of a byte channel the session needs (a subset of lib/shared/p2p's `ChannelLike`). */
export interface Link {
  readonly open: boolean;
  send(data: Uint8Array): void;
  onmessage: ((data: Uint8Array) => void) | null;
  onclose: (() => void) | null;
  close(): void;
}
