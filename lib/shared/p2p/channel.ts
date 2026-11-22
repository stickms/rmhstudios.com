/**
 * The part of `RTCDataChannel` the peer-to-peer links use (`ChannelLike`),
 * and the two-channel pair every host ↔ member connection carries.
 *
 * Implemented by a real DataChannel (`./webrtc.ts` DataChannelAdapter), by the
 * hub relay's stand-in (`./webrtc.ts` RelayChannel) and by the in-memory test
 * pair (`./fake-channel.test-support.ts`). Extracted from the TF2 transport
 * (lib/tf2-game/net/p2p/link.ts declares the same shape; TypeScript treats the
 * two as one type).
 *
 * Environment-agnostic.
 */

export interface ChannelLike {
  readonly readyState: 'connecting' | 'open' | 'closing' | 'closed';
  readonly bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  send(data: Uint8Array): void;
  onmessage: ((data: Uint8Array) => void) | null;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onbufferedamountlow: (() => void) | null;
  close(): void;
}

/**
 * The two negotiated channels of one connection: id 0 `unreliable`
 * (`ordered: false, maxRetransmits: 0`) and id 1 `reliable` (ordered).
 */
export interface ChannelPair {
  unreliable: ChannelLike;
  reliable: ChannelLike;
}
