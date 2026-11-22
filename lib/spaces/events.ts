/**
 * Live Spaces — socket event names (shared by the client room UI and the
 * socket-server handler). Imported by BOTH sides so the strings never drift
 * (server/CLAUDE.md §"Client connection conventions" — never inline event
 * strings). This is a plain, client-safe module: no server-only imports.
 */

export const SPACE_C2S = {
  JOIN: 'space:join',
  LEAVE: 'space:leave',
  CHAT: 'space:chat',
  REACT: 'space:react',
  PIN: 'space:pin',
  END: 'space:end',
} as const;

export const SPACE_S2C = {
  /** Full room snapshot (audience list/count, status, pinned, hostId). */
  STATE: 'space:state',
  /** One live chat message. */
  MESSAGE: 'space:message',
  /** Ephemeral reaction burst. */
  REACTION: 'space:reaction',
  /** Pinned content changed. */
  PINNED: 'space:pinned',
  /** Host ended the space. */
  ENDED: 'space:ended',
  /** Recoverable error surfaced to the acting socket. */
  ERROR: 'space:error',
} as const;
