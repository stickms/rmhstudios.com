/**
 * Final places with pending deaths (REF-11, A1 §4.6):
 *
 *     key(id) = 0 if present and alive else 1
 *     for each pending death P:
 *         if id is P's player or id FAILED P's blind: involved += 1
 *         elif id has no result for P's blind and (id was out before P or id left): dropped += 1
 *     if involved > 0: key = max(key, 1 + involved)
 *     key += 2 * dropped
 *     place(id) = 1 + count(other ids with strictly smaller key)    # ties share; the next place skips
 */

import type { Id, PendingDeath } from '../types';

export interface PlaceInfo {
  /** Present (has not left) and alive (lives > 0). */
  aliveAndPresent: (id: Id) => boolean;
  left: (id: Id) => boolean;
  result: (id: Id, blindKey: string) => 'B' | 'F' | undefined;
}

export function placeKeys(
  ids: readonly Id[],
  pending: readonly PendingDeath[],
  info: PlaceInfo,
): Record<Id, number> {
  const keys: Record<Id, number> = {};
  for (const id of ids) {
    let key = info.aliveAndPresent(id) ? 0 : 1;
    let involved = 0;
    let dropped = 0;
    for (const p of pending) {
      const r = info.result(id, p.blindKey);
      if (id === p.playerId || r === 'F') involved++;
      else if (r === undefined && (p.outBefore.includes(id) || info.left(id))) dropped++;
    }
    if (involved > 0) key = Math.max(key, 1 + involved);
    key += 2 * dropped;
    keys[id] = key;
  }
  return keys;
}

export function computePlaces(
  ids: readonly Id[],
  pending: readonly PendingDeath[],
  info: PlaceInfo,
): Record<Id, number> {
  const keys = placeKeys(ids, pending, info);
  const places: Record<Id, number> = {};
  for (const id of ids) {
    const k = keys[id] as number;
    places[id] = 1 + ids.filter((o) => o !== id && (keys[o] as number) < k).length;
  }
  return places;
}
