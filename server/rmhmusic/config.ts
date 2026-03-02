function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  return v ? parseInt(v, 10) : fallback;
}

function envStr(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: envInt('RMHMUSIC_PORT', 7004),
  socketPath: envStr('RMHMUSIC_SOCKET_PATH', '/rmhmusic-ws/'),
  maxBuffer: envInt('RMHMUSIC_MAX_BUFFER', 1_048_576),
  pingInterval: envInt('RMHMUSIC_PING_INTERVAL', 25_000),
  pingTimeout: envInt('RMHMUSIC_PING_TIMEOUT', 20_000),
  syncHeartbeatMs: envInt('RMHMUSIC_SYNC_HEARTBEAT_MS', 5_000),
  emptyTimeoutMs: envInt('RMHMUSIC_EMPTY_TIMEOUT', 300_000),
  graceMs: envInt('RMHMUSIC_GRACE_MS', 30_000),
  gcIntervalMs: envInt('RMHMUSIC_GC_INTERVAL', 60_000),
  shutdownTimeoutMs: envInt('RMHMUSIC_SHUTDOWN_TIMEOUT', 10_000),
  cors: (() => {
    const raw = process.env.RMHMUSIC_CORS_ORIGIN ?? process.env.SOCKET_CORS_ORIGIN;
    if (!raw) {
      console.error('FATAL: SOCKET_CORS_ORIGIN is required');
      process.exit(1);
    }
    return raw.split(',').map((s) => s.trim());
  })(),
} as const;
