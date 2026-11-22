/**
 * The library's two access filters, as pure functions over the capabilities registry
 * (`lib/game-capabilities.ts`). No React, no I/O: safe on server and client, and the only place the
 * rules for "can be played with" and "accessibility" are written down.
 *
 * Every selected option must hold (they combine with AND), and a title with no registry entry (an
 * app, an off-site link) matches nothing while a filter is on: the registry only makes claims about
 * games, so silence is not a match.
 */

import type { GameCapabilities, InputMethod } from '@/lib/game-capabilities';

/** "Can be played with" options, in display order. */
export const PLAY_OPTIONS = ['keyboard', 'touch', 'gamepad'] as const;
export type PlayOption = (typeof PLAY_OPTIONS)[number];

/** "Accessibility" options, in display order. */
export const ACCESS_OPTIONS = [
  'no-flashing',
  'no-timed-input',
  'assists',
  'remappable',
  'colorblind',
  'subtitles',
] as const;
export type AccessOption = (typeof ACCESS_OPTIONS)[number];

export interface AccessFilter {
  play: readonly PlayOption[];
  access: readonly AccessOption[];
}

export const NO_ACCESS_FILTER: AccessFilter = {
  play: [],
  access: [],
};

export function isAccessFilterActive(f: AccessFilter): boolean {
  return f.play.length > 0 || f.access.length > 0;
}

/**
 * Playable with `method` and nothing else needed: the game supports it and every input it requires
 * is that one. A game that requires a mouse is not "touch" even if it also lists touch, the same
 * rule `playabilityFor` applies on a phone.
 */
function playableWith(caps: GameCapabilities, method: InputMethod): boolean {
  return caps.input.supported.includes(method) && caps.input.required.every((r) => r === method);
}

function matchesPlay(caps: GameCapabilities, option: PlayOption): boolean {
  return playableWith(caps, option);
}

function matchesAccessOption(caps: GameCapabilities, option: AccessOption): boolean {
  const claims = caps.accessibility;
  switch (option) {
    case 'no-flashing':
      // Does not flash at all, or can turn the flashing off.
      return !(caps.descriptors ?? []).includes('flashing') || claims.includes('reduced-flashing');
    case 'no-timed-input':
      return claims.includes('no-timed-input');
    case 'assists':
      return claims.includes('assist-mode');
    case 'remappable':
      return claims.includes('remappable-input');
    case 'colorblind':
      return claims.includes('colorblind-safe');
    case 'subtitles':
      return claims.includes('subtitles');
  }
}

/** Whether a game's capabilities satisfy every selected option. An empty filter matches everything. */
export function matchesAccess(caps: GameCapabilities | undefined, filter: AccessFilter): boolean {
  if (!isAccessFilterActive(filter)) return true;
  if (!caps) return false;
  return filter.play.every((o) => matchesPlay(caps, o)) && filter.access.every((o) => matchesAccessOption(caps, o));
}

/**
 * Read one URL search value (`?play=keyboard,touch`): a comma-separated list, unknown entries dropped,
 * duplicates removed, returned in display order so the same selection is always the same URL.
 */
export function parseAccessParam<T extends string>(raw: unknown, allowed: readonly T[]): T[] {
  if (typeof raw !== 'string') return [];
  const wanted = new Set(raw.split(','));
  return allowed.filter((o) => wanted.has(o));
}

/** The URL value for a selection, or `undefined` when nothing is selected (the param is then dropped). */
export function serializeAccessParam(list: readonly string[]): string | undefined {
  return list.length > 0 ? list.join(',') : undefined;
}

/** Add `option` to `list` when absent, remove it when present, keeping display order. */
export function toggleOption<T extends string>(list: readonly T[], option: T, allowed: readonly T[]): T[] {
  const next = new Set(list);
  if (next.has(option)) next.delete(option);
  else next.add(option);
  return allowed.filter((o) => next.has(o));
}
