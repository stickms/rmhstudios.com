import { seasonWindowAt } from '@/lib/seasons/clock';

/**
 * The dates a new prediction season gets (client-safe, pure): the admin's when
 * both are given, else the window of the current season on the site's one
 * season clock (`lib/seasons/clock.ts`).
 */
export function seasonDates(
  input: { startsAt?: string | undefined; endsAt?: string | undefined },
  now: Date = new Date(),
): { startsAt: Date; endsAt: Date } {
  if (input.startsAt && input.endsAt) return { startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt) };
  const { start, end } = seasonWindowAt(now);
  return { startsAt: start, endsAt: end };
}
