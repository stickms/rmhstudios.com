/** Per-key per-minute request budget by tier. Max+ gets a higher ceiling than Pro. */
const MINUTE_LIMITS: Record<string, number> = {
  starter: 120,
  pro: 600,
  enterprise: 600,
};

const DEFAULT_MINUTE_LIMIT = 120;

/** The tier's per-minute request limit for one API key. */
export function tierMinuteLimit(tier: string): number {
  return MINUTE_LIMITS[tier] ?? DEFAULT_MINUTE_LIMIT;
}

/**
 * The limit actually applied to a key: its own `rateLimitPerMinute` when set,
 * never above the tier's (a downgrade lowers an old, higher setting).
 */
export function effectiveMinuteLimit(tier: string, keyLimit: number | null): number {
  const max = tierMinuteLimit(tier);
  return keyLimit !== null && keyLimit >= 1 ? Math.min(keyLimit, max) : max;
}

export type LimitInputError = 'not_whole_number' | 'out_of_range';

/**
 * The "Requests per minute" field: blank means the tier's limit (null), otherwise
 * a whole number from 1 to the tier's limit.
 */
export function parseLimitInput(
  text: string,
  max: number,
):
  | {
      ok: true;
      value: number | null;
    }
  | {
      ok: false;
      error: LimitInputError;
    } {
  const trimmed = text.trim();
  if (trimmed === '')
    return {
      ok: true,
      value: null,
    };
  if (!/^\d{1,9}$/.test(trimmed))
    return {
      ok: false,
      error: 'not_whole_number',
    };
  const value = Number(trimmed);
  if (value < 1 || value > max)
    return {
      ok: false,
      error: 'out_of_range',
    };
  return {
    ok: true,
    value,
  };
}
