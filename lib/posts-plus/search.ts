/**
 * Tiny search-param validators for posts-plus routes. They live in lib/ rather
 * than in a component file because a route module's `validateSearch` runs in the
 * client entry chunk: importing from a component there would drag the component
 * (and everything it imports) into every visitor's first load.
 */

import { isValidDayKey } from './constants';

export function validateQotdSearch(search: Record<string, unknown>): { day?: string } {
  return typeof search.day === 'string' && isValidDayKey(search.day) ? { day: search.day } : {};
}
