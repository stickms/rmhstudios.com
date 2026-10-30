/**
 * Balatro multiplayer — hub limits and the protocol version (PLAN §3.a, frozen).
 *
 * Browser-free and dependency-free: the socket server's esbuild bundle pulls
 * this file in verbatim, so it only uses relative imports (none, here).
 *
 * A change to anything in this file is a PLAN amendment (§3 header): the
 * orchestrator approves it and every stream is told.
 */

/**
 * Bumped on any breaking change to §3.a, §3.b, §3.c or §3.f. It is the tail of
 * the content hash (`<core sha12><mp sha12>-v<MP_PROTOCOL_VERSION>`, D-36), so
 * two builds that disagree on it never meet in a lobby.
 */
export const MP_PROTOCOL_VERSION = 1;

export const BALATRO_LIMITS = {
  MAX_PLAYERS: 16,
  MAX_SPECTATORS: 8,
  PARTY_MAX: 8,
  /** The `generateRoomCode` alphabet (server/socket-server/utils.ts): no I, O, 0 or 1. */
  CODE_RE: /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/,
  SDP_MAX_LENGTH: 16_384,
  CANDIDATE_MAX_LENGTH: 512,
  PEER_ID_LENGTH: 12,
  TOKEN_LENGTH: 24,
  HOST_GRACE_MS: 30_000,
  MIGRATE_GRACE_MS: 2_000,
  SEAT_GRACE_MS: 120_000,
  CATCH_UP_LIMIT_MS: 180_000,
  MAX_ROOMS: 1_000,
  CONTENT_HASH_RE: /^[0-9a-f]{24}-v\d+$/,
  INVITES_PER_MIN: 20,
} as const;

export const BALATRO_RELAY_LIMITS = {
  MAX_PEERS_PER_ROOM: 15,
  BYTES_PER_SEC: 8 * 1024,
  BURST_BYTES: 64 * 1024,
  MAX_DEBT_BYTES: 1 << 20,
  MAX_PACKET_BYTES: 16 * 1024 + 64,
} as const;
