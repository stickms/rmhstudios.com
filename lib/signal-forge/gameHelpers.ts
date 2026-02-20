/**
 * gameHelpers.ts — Small utility functions for Signal Forge game logic
 *
 * Provides relic-checking helpers and hand-size calculation used
 * throughout multiple game logic modules.
 */

import type { Relic } from './Relic';

/** Check if the player owns a relic with a given key */
export function hasRelic(relics: Relic[], key: string): boolean {
  return relics.some(r => r.key === key);
}

/** Count how many copies of a relic the player owns */
export function countRelic(relics: Relic[], key: string): number {
  return relics.filter(r => r.key === key).length;
}

/** Calculate the player's hand size based on owned relics */
export function getHandSize(relics: Relic[]): number {
  let size = 5 + countRelic(relics, 'expanded_buffer');
  if (hasRelic(relics, 'overclocked_processor')) {
    size += 2;
  }
  return size;
}
