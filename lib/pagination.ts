/** Parse the entire input; partial numbers, fractions and unsafe integers use the fallback. */
export function boundedInteger(
  value: string | number | null | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = typeof value === 'string' ? value.trim() : value;
  const parsed = typeof raw === 'string' && /^[+-]?\d+$/.test(raw) ? Number(raw) : raw;
  const integer = typeof parsed === 'number' && Number.isSafeInteger(parsed) ? parsed : fallback;
  return Math.min(max, Math.max(min, integer));
}

/** Page sizes must stay positive: negative Prisma `take` reverses pagination. */
export function pageSize(
  value: string | number | null | undefined,
  fallback = 20,
  max = 50,
): number {
  return boundedInteger(value, fallback, 1, max);
}
