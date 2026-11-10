/**
 * Env readers with the Go `pkg/config` semantics, so every variable the Go bot read means the
 * same thing here: an unset OR empty value is the fallback, an unparseable one is the fallback,
 * durations are Go duration strings ("30s", "10m", "1h30m").
 */

type Env = Record<string, string | undefined>;

export function getString(key: string, fallback: string, env: Env = process.env): string {
  const v = env[key];
  return v !== undefined && v !== '' ? v : fallback;
}

/** Go strconv.Atoi: an optional sign and decimal digits only. */
export function getInt(key: string, fallback: number, env: Env = process.env): number {
  const v = env[key];
  if (v === undefined || v === '') return fallback;
  return /^[+-]?\d+$/.test(v) ? Number(v) : fallback;
}

/** Go strconv.ParseBool. */
export function getBool(key: string, fallback: boolean, env: Env = process.env): boolean {
  const v = env[key];
  if (v === undefined || v === '') return fallback;
  if (['1', 't', 'T', 'TRUE', 'true', 'True'].includes(v)) return true;
  if (['0', 'f', 'F', 'FALSE', 'false', 'False'].includes(v)) return false;
  return fallback;
}

export function getCSV(key: string, env: Env = process.env): string[] {
  const raw = env[key];
  if (!raw) return [];
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

const UNIT_MS: Record<string, number> = {
  ns: 1e-6,
  us: 1e-3,
  µs: 1e-3,
  μs: 1e-3,
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
};

/** Parse a Go duration string to ms; null when invalid (Go time.ParseDuration). */
export function parseGoDuration(input: string): number | null {
  let s = input.trim();
  if (s === '') return null;
  let sign = 1;
  if (s[0] === '-' || s[0] === '+') {
    if (s[0] === '-') sign = -1;
    s = s.slice(1);
  }
  if (s === '0') return 0;
  if (s === '') return null;
  const re = /(\d+(?:\.\d*)?|\.\d+)(ns|us|µs|μs|ms|s|m|h)/y;
  let total = 0;
  let pos = 0;
  while (pos < s.length) {
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m) return null;
    total += Number(m[1]) * (UNIT_MS[m[2]!] ?? 0);
    pos = re.lastIndex;
  }
  return sign * total;
}

export function getDuration(key: string, fallbackMs: number, env: Env = process.env): number {
  const v = env[key];
  if (v === undefined || v === '') return fallbackMs;
  const d = parseGoDuration(v);
  return d === null ? fallbackMs : d;
}

/**
 * A cron for "every `ms`", for the periodic work the Go bot ran on tickers. pg-boss crons are
 * minute-grained: sub-minute values round up to a minute, values that do not divide an hour fall
 * back to the nearest whole-minute step that does, hours step the hour field.
 */
export function cronEvery(ms: number, minuteOffset = 0): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) {
    let step = minutes;
    while (60 % step !== 0) step--;
    if (step === 1) return '* * * * *';
    const off = minuteOffset % step;
    return off === 0 ? `*/${step} * * * *` : `${off}-59/${step} * * * *`;
  }
  let hours = Math.max(1, Math.round(minutes / 60));
  while (24 % hours !== 0) hours--;
  const minute = minuteOffset % 60;
  return hours === 1 ? `${minute} * * * *` : `${minute} */${hours} * * *`;
}
