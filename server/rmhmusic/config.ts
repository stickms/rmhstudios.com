function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  return v ? parseInt(v, 10) : fallback;
}

export const config = {
  syncHeartbeatMs: envInt('RMHMUSIC_SYNC_HEARTBEAT_MS', 5_000),
  emptyTimeoutMs: envInt('RMHMUSIC_EMPTY_TIMEOUT', 300_000),
  graceMs: envInt('RMHMUSIC_GRACE_MS', 30_000),
  gcIntervalMs: envInt('RMHMUSIC_GC_INTERVAL', 60_000),
} as const;
