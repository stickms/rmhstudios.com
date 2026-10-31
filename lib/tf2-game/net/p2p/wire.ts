/**
 * Peer-to-peer play — what travels on the two DataChannels between a host and
 * one member (or, as a fallback, through the hub's relay).
 *
 * The game packets are EXACTLY the hub path's bytes (usercmd-codec input
 * packets, snapshot.ts snapshots, protocol.ts reliable batches); this module
 * only adds a one-byte tag so the two channels can carry them next to the
 * link's own messages.
 *
 * `unreliable` (ordered: false, maxRetransmits: 0) — every message ≤
 * `UNRELIABLE_MAX_BYTES` (1200: below the path MTU once DTLS/SCTP/UDP/IP
 * headers are added, so a datagram is never IP-fragmented):
 *
 *   INPUT     member → host   tag · seq header · input packet (≤ TF2_LIMITS.INPUT_MAX_BYTES)
 *   SNAPSHOT  host → member   tag · seq header · snapshot (≤ P2P_SNAPSHOT_MAX_BYTES)
 *   PING      both            tag · u32 seq · f64 sentAt
 *   PONG      both            tag · u32 seq · f64 sentAt (echoed) · f64 tick (−1: none)
 *
 * The seq header (`SEQ_HEADER_BYTES`, added and stripped by the link) is
 * u16 sequence · u16 sender clock (ms, wrapping) · u8 choke (messages of this
 * kind the sender had to drop since the last one it sent): the receiver's
 * loss, jitter and choke come from the real traffic (`./loss.ts`), not from
 * pings alone.
 *
 * `reliable` (ordered, retransmitted): link frames carrying one message each —
 *
 *   WHOLE     0x10 · message
 *   FRAGMENT  0x11 · u32 messageId · u16 index · u16 count · chunk
 *             (a message larger than `RELIABLE_CHUNK_BYTES` is split; the
 *             channel is ordered, so the pieces arrive in order)
 *
 * and a message is
 *
 *   EVENTS    host → member   tag · reliable batch (protocol.ts)
 *   CONTROL   both            tag · UTF-8 JSON, parsed with zod on receipt
 *                             (`control.ts`) — never evaluated.
 *
 * The generic framing (ping/pong, WHOLE/FRAGMENT reliable frames, CONTROL)
 * lives in lib/shared/p2p/wire.ts, shared with other peer-to-peer apps, and is
 * re-exported here unchanged; this file keeps TF2's own game tags.
 *
 * Environment-agnostic.
 */

export {
  TAG_PING,
  TAG_PONG,
  FRAME_WHOLE,
  FRAME_FRAGMENT,
  TAG_CONTROL,
  UNRELIABLE_MAX_BYTES,
  RELIABLE_CHUNK_BYTES,
  FRAGMENT_HEADER_BYTES,
  RELIABLE_MESSAGE_MAX_BYTES,
  RELIABLE_MAX_FRAGMENTS,
  tagged,
  encodeControl,
  decodeControl,
  encodePing,
  decodePing,
  frameReliable,
  ReliableAssembler,
} from '../../../shared/p2p/wire';

export const TAG_INPUT = 0x01;
export const TAG_SNAPSHOT = 0x02;

export const TAG_EVENTS = 0x20;
/** host → its successor: a packed migration checkpoint (sim/checkpoint/pack.ts). */
export const TAG_CHECKPOINT = 0x22;

/** Unreliable game messages carry a sequence header (loss, jitter and choke from real traffic). */
export const SEQUENCED_TAGS: ReadonlySet<number> = new Set([TAG_INPUT, TAG_SNAPSHOT]);
/** u16 seq · u16 sender ms · u8 choke. */
export const SEQ_HEADER_BYTES = 5;

/**
 * The snapshot budget for P2P matches (SNAPSHOT_MAX_BYTES is 1400 on the hub,
 * where WebSocket frames have no MTU): a snapshot plus its tag stays one datagram.
 */
export const P2P_SNAPSHOT_MAX_BYTES = 1_100;

/** A sequenced message: tag · u16 seq · u16 sentMs · u8 choke · body, one allocation. */
export function sequenced(tag: number, seq: number, sentMs: number, choke: number, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(1 + SEQ_HEADER_BYTES + body.byteLength);
  out[0] = tag;
  out[1] = seq & 0xff;
  out[2] = (seq >>> 8) & 0xff;
  const ms = Math.floor(sentMs) & 0xffff;
  out[3] = ms & 0xff;
  out[4] = (ms >>> 8) & 0xff;
  out[5] = Math.min(255, Math.max(0, choke | 0));
  out.set(body, 1 + SEQ_HEADER_BYTES);
  return out;
}

/** The header of a sequenced message, or null when it is too short. */
export function readSequence(m: Uint8Array): { seq: number; sentMs: number; choke: number } | null {
  if (m.byteLength < 1 + SEQ_HEADER_BYTES) return null;
  return { seq: m[1] | (m[2] << 8), sentMs: m[3] | (m[4] << 8), choke: m[5] };
}
