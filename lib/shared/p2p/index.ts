/**
 * The shared peer-to-peer transport (extracted from the TF2 stack, PLAN §3.e):
 * framing, relay header, ICE, WebRTC/relay channels and the generic
 * `ReliableLink`. The in-memory test channels are NOT re-exported here
 * (import `./fake-channel.test-support` from tests only).
 */

export type { ChannelLike, ChannelPair } from './channel';
export * from './wire';
export * from './relay';
export * from './ice';
export * from './webrtc';
export * from './reliable-link';
