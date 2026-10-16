/**
 * Tiny search-param validators for posts-plus routes. They live in lib/ rather
 * than in a component file because a route module's `validateSearch` runs in the
 * client entry chunk: importing from a component there would drag the component
 * (and everything it imports) into every visitor's first load. Deliberately
 * dependency-free for the same reason (no zod, no constants module).
 */

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function validateQotdSearch(search: Record<string, unknown>): { day?: string } {
  const day = search.day;
  if (typeof day !== 'string' || !DAY_KEY.test(day)) return {};
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day ? { day } : {};
}
