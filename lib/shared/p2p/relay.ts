/**
 * The hub relay's frame header, shared by every peer-to-peer app on the games
 * hub (TF2 `tf2:p2p:relay`, Balatro `balatro:p2p:relay`).
 *
 *   byte 0  flags  (bit 0 = reliable; every other bit must be 0)
 *   byte 1  slot   (the member's relay slot, 1…127; the hub stamps it on
 *                   member → host frames and routes host → member frames by it)
 *   …       payload (opaque to the hub)
 *
 * ## Relay slots in peer ids (hub resolution, Balatro)
 *
 * The Balatro contract (lib/balatro/net/events.ts) has no "relay ready" event
 * that tells the host which slot a member relays on, so the hub encodes the
 * slot in the peer id it issues: the last two characters of a 12-character
 * peer id are the slot as two lowercase hex digits (`…01` … `…7f`). The host
 * learns a member's peer id from its join request and so its slot, with no
 * extra round trip; `relaySlotOf` / `peerIdWithSlot` are the only code that
 * knows the layout. (TF2 announces slots in `tf2:p2p:relay:ready` instead and
 * does not use these helpers.)
 *
 * Environment-agnostic; no `@/` specifiers (the hub imports it relatively).
 */

export const RELAY_HEADER_BYTES = 2;
export const RELAY_FLAG_RELIABLE = 1;
export const RELAY_MAX_SLOT = 127;

export function encodeRelay(slot: number, reliable: boolean, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(RELAY_HEADER_BYTES + payload.byteLength);
  out[0] = reliable ? RELAY_FLAG_RELIABLE : 0;
  out[1] = slot & 0x7f;
  out.set(payload, RELAY_HEADER_BYTES);
  return out;
}

/** The header and payload of a relay frame, or null (empty payload, unknown flag bits). */
export function decodeRelay(
  bytes: Uint8Array,
): { slot: number; reliable: boolean; payload: Uint8Array } | null {
  if (bytes.byteLength <= RELAY_HEADER_BYTES) return null;
  const flags = bytes[0];
  if ((flags & ~RELAY_FLAG_RELIABLE) !== 0) return null;
  return {
    reliable: (flags & RELAY_FLAG_RELIABLE) !== 0,
    slot: bytes[1] & 0x7f,
    payload: bytes.subarray(RELAY_HEADER_BYTES),
  };
}

const SLOT_SUFFIX_RE = /^[0-9a-f]{2}$/;

/** A peer id of `length` characters: `random` (trimmed / required long enough) + the slot in hex. */
export function peerIdWithSlot(random: string, slot: number, length = 12): string {
  if (!Number.isInteger(slot) || slot < 1 || slot > RELAY_MAX_SLOT) throw new RangeError(`relay slot ${slot}`);
  if (random.length < length - 2) throw new RangeError('peer id prefix too short');
  return random.slice(0, length - 2) + slot.toString(16).padStart(2, '0');
}

/** The relay slot encoded in a hub-issued peer id, or null when it carries none. */
export function relaySlotOf(peerId: string): number | null {
  const tail = peerId.slice(-2);
  if (peerId.length < 3 || !SLOT_SUFFIX_RE.test(tail)) return null;
  const slot = parseInt(tail, 16);
  return slot >= 1 && slot <= RELAY_MAX_SLOT ? slot : null;
}
