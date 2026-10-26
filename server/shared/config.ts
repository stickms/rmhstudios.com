/** Invalid environment settings fall back instead of creating hot timers or unbounded pools. */
export function envInt(key: string, fallback: number, min = 1, max = 2_147_483_647): number {
  const raw = process.env[key]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
}
