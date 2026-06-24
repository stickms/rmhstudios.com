/**
 * Socket Server Configuration
 *
 * All tunable values for the unified WebSocket server.
 * Environment variables override defaults for production flexibility.
 */

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function envString(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  // ─── Network ───
  PORT: envInt('SOCKET_PORT', 7001),
  SOCKET_PATH: envString('SOCKET_PATH', '/socket/'),
  CORS_ORIGIN: envString('SOCKET_CORS_ORIGIN', ''),

  // ─── Socket.io Tuning ───
  MAX_HTTP_BUFFER_SIZE: envInt('SOCKET_MAX_BUFFER', 1_048_576),
  PING_INTERVAL_MS: envInt('SOCKET_PING_INTERVAL', 25_000),
  PING_TIMEOUT_MS: envInt('SOCKET_PING_TIMEOUT', 20_000),

  // ─── Shared Room Constants ───
  ROOM_CODE_LENGTH: 6,
  ROOM_CODE_ALPHABET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  MAX_LOBBY_ID_LENGTH: 64,
  MAX_USER_NAME_LENGTH: 32,
  CHAT_MAX_LENGTH: 300,
  CHAT_HISTORY_LENGTH: 200,

  // ─── Rate Limits ───
  SOCKET_RATE_LIMITS: {
    'rmhtype:room:create':    { max: 3,   windowMs: 60_000 },
    'rmhtype:room:join':      { max: 10,  windowMs: 60_000 },
    'rmhtype:room:chat':      { max: 30,  windowMs: 60_000 },
    'rmhtype:game:progress':  { max: 600, windowMs: 60_000 },
    'rmhtype:game:start':     { max: 10,  windowMs: 60_000 },
    'rmhtype:solo:start':     { max: 10,  windowMs: 60_000 },
    'rmhstudy:room:create':   { max: 3,   windowMs: 60_000 },
    'rmhstudy:room:join':     { max: 10,  windowMs: 60_000 },
    'rmhstudy:room:chat':     { max: 30,  windowMs: 60_000 },
    'rmhstudy:timer:start':   { max: 10,  windowMs: 60_000 },
    'rmhstudy:task:add':      { max: 30,  windowMs: 60_000 },
    'rmhstudy:chat:react':    { max: 30,  windowMs: 60_000 },
    'altair:lobby:create':    { max: 3,   windowMs: 60_000 },
    'altair:lobby:join':      { max: 10,  windowMs: 60_000 },
    'altair:lobby:browse':    { max: 20,  windowMs: 60_000 },
    'altair:lobby:chat':      { max: 30,  windowMs: 60_000 },
    'altair:game:input':      { max: 1200, windowMs: 60_000 },
    'altair:game:state_snapshot': { max: 1200, windowMs: 60_000 },
    'altair:game:ping':       { max: 30,  windowMs: 60_000 },
    'altair:game:quick_chat': { max: 20,  windowMs: 60_000 },
    'bj:join_table':          { max: 30,  windowMs: 60_000 },
    'bj:leave_table':         { max: 30,  windowMs: 60_000 },
    'bj:place_bet':           { max: 200, windowMs: 60_000 },
    'bj:hit':                 { max: 300, windowMs: 60_000 },
    'bj:stand':               { max: 300, windowMs: 60_000 },
    'bj:double_down':         { max: 200, windowMs: 60_000 },
    'bacc:create_room':       { max: 15,  windowMs: 60_000 },
    'bacc:join_room':         { max: 30,  windowMs: 60_000 },
    'bacc:place_bet':         { max: 300, windowMs: 60_000 },
    'rl:create_room':         { max: 15,  windowMs: 60_000 },
    'rl:join_room':           { max: 30,  windowMs: 60_000 },
    'rl:place_bet':           { max: 300, windowMs: 60_000 },
    'rl:clear_bets':          { max: 200, windowMs: 60_000 },
    'lights-out:join':        { max: 5,   windowMs: 60_000 },
    'lights-out:ready':       { max: 30,  windowMs: 60_000 },
    'lights-out:start':       { max: 10,  windowMs: 60_000 },
    'lights-out:update':      { max: 120, windowMs: 60_000 },
    'lights-out:leave':       { max: 10,  windowMs: 60_000 },
    'lights-out:return':      { max: 10,  windowMs: 60_000 },
    'holdem:list_rooms':      { max: 60,  windowMs: 60_000 },
    'holdem:create_room':     { max: 15,  windowMs: 60_000 },
    'holdem:join_room':       { max: 30,  windowMs: 60_000 },
    'holdem:leave_room':      { max: 30,  windowMs: 60_000 },
    'holdem:update_room':     { max: 60,  windowMs: 60_000 },
    'holdem:fold':            { max: 300, windowMs: 60_000 },
    'holdem:check':           { max: 300, windowMs: 60_000 },
    'holdem:call':            { max: 300, windowMs: 60_000 },
    'holdem:raise':           { max: 300, windowMs: 60_000 },
    'holdem:all_in':          { max: 200, windowMs: 60_000 },
    'holdem:sit_in':          { max: 60,  windowMs: 60_000 },
    'holdem:sit_out':         { max: 60,  windowMs: 60_000 },
    'holdem:rebuy':           { max: 60,  windowMs: 60_000 },
    'holdem:show_cards':      { max: 100, windowMs: 60_000 },
  } as Record<string, { max: number; windowMs: number }>,

  // ─── Shutdown ───
  SHUTDOWN_TIMEOUT_MS: envInt('SOCKET_SHUTDOWN_TIMEOUT', 10_000),

  // ─── Database ───
  DATABASE_URL: envString('DATABASE_URL', ''),

  // ─── Disconnect Grace Period ───
  DISCONNECT_GRACE_PERIOD_MS: envInt('SOCKET_GRACE_MS', 120_000),
} as const;
