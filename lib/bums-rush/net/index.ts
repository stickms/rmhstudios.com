/**
 * Bum's Rush — netcode barrel (§9).
 *
 * Client-side entry point. **The hub does not import this file** — it imports
 * `protocol`, `snapshot`, `input` and `migration` directly, because `socket`,
 * `lobby` and `guest` pull in socket.io-client and `@/` specifiers that the
 * esbuild server bundle has no business resolving (server/CLAUDE.md §Gotchas 7).
 */

export {
  ROOM_CODE_RE,
  RELAYED_EVENT_KINDS,
  digestMatches,
  resultDigest,
  sealResult,
  verifyResult,
  zClaimSeat,
  zCreateRoom,
  zEmote,
  zEventMsg,
  zHostHandoff,
  zJoinRoom,
  zLeave,
  zListRooms,
  zPing,
  zQuickPlay,
  zReady,
  zReleaseSeat,
  zResultMsg,
  zSelectLevel,
  zSetAssists,
  zSetCosmetics,
  zStart,
} from './protocol';
export type {
  BrErrorCode,
  BrErrorMsg,
  BrEventMsg,
  ClaimSeatMsg,
  CreateRoomMsg,
  DeviceKind,
  EmoteMsg,
  HostChangedMsg,
  HostHandoffMsg,
  JoinRoomMsg,
  LevelBounds,
  PeerMsg,
  PongMsg,
  QuickPlayMsg,
  RelayedEventKind,
  ResultAckMsg,
  ResultEnvelope,
  ResultVerdict,
  RoomListEntry,
  SeatAssignmentMsg,
  StartBroadcastMsg,
} from './protocol';

export {
  QUANTISATION_ERROR,
  SNAPSHOT_FIXED_BYTES,
  SNAPSHOT_PROP_BYTES,
  SNAPSHOT_SEAT_BYTES,
  SnapshotDecodeError,
  SnapshotDecoder,
  SnapshotEncoder,
  decodeSnapshot,
  encodeSnapshot,
  frameDelta,
  isKeyframe,
  normalizeTurn,
  peekSnapshotHeader,
  snapshotByteLength,
  unwrapFrame,
  wrapAngle,
} from './snapshot';

export {
  INPUT_ENTRY_BYTES,
  INPUT_QUANTISATION_ERROR,
  InputDecodeError,
  InputDeduper,
  InputHistory,
  MAX_INPUT_ENTRIES,
  buildInputPacket,
  decodeInputPacket,
  decodeInputSeats,
  encodeInputPacket,
  inputByteLength,
} from './input';

export { HostLoop, packEvent, unpackEvent } from './host';
export type { HostLoopOptions, HostTransport } from './host';

export { GuestInterpolator, LocalArmBlender } from './guest';
export type { GuestFrame, GuestRenderMode } from './guest';

export {
  ELECTION_WINDOW_MS,
  KEYFRAME_STALE_MS,
  MIGRATION_FREEZE_MS,
  RTT_BUCKET_MS,
  RttWindow,
  electHost,
  planMigration,
  rttNeedsGrabAssist,
  shouldOfferMigration,
} from './migration';
export type { HostCandidate, MigrationPlan, ResumeMode } from './migration';

export { BumsRushLobby, freeSeats } from './lobby';
export type { LobbyListener, LobbyState } from './lobby';

export {
  connectBumsRush,
  detectDevice,
  disconnectBumsRush,
  emitBumsRush,
  getBumsRushSocket,
  getBumsRushStatus,
  getClientKey,
  onBumsRush,
  onBumsRushStatus,
  reconnectBumsRushNow,
} from './socket';
