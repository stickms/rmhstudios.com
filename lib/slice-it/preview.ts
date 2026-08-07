/**
 * Slice It — where a song's 20-second preview starts (`C7`).
 *
 * The library plays nothing. `SongLibrary.tsx` renders metadata cards, and the
 * only way to hear a track is to start a run — which means choosing what to
 * play from a list of titles.
 *
 * Pure, so the analyser picks the default at charting time and the uploader can
 * override it later without either side re-deriving anything.
 */

import type { Section } from './beatmap/sections';

/** How long a preview plays. */
export const PREVIEW_SECONDS = 20;

/**
 * The default preview point: the start of the highest-energy section.
 *
 * `C5` already computes the section map and its per-section energy, so this
 * costs nothing at analysis time. Picking the loudest section is a better
 * heuristic than "40% in" for the same reason a chorus is what people put in a
 * trailer — but it is a HEURISTIC, which is why `previewStart` is a stored
 * column the uploader can change rather than something derived on read.
 *
 * Guards, in order of how often they bite:
 *
 *  - A section starting inside the last {@link PREVIEW_SECONDS} would preview
 *    silence, so the pick is pulled back to leave a full preview.
 *  - The very first section is skipped when there is an alternative: an intro
 *    is occasionally the loudest thing in a track (a cold open), and starting a
 *    preview at 0.0 makes the feature look broken even when it is right.
 *  - A track shorter than a preview previews from the start.
 */
export function defaultPreviewStart(sections: readonly Section[], duration: number): number {
  if (!(duration > PREVIEW_SECONDS)) return 0;

  const latest = duration - PREVIEW_SECONDS;
  const candidates = sections.filter((section) => section.start > 0);
  const pool = candidates.length > 0 ? candidates : sections;
  if (pool.length === 0) return Math.min(latest, duration * 0.35);

  let best = pool[0];
  for (const section of pool) {
    if (section.energy > best.energy) best = section;
  }
  return clamp(best.start, 0, latest);
}

/** Narrow a stored or user-supplied preview point against the real duration. */
export function resolvePreviewStart(
  stored: number | null | undefined,
  duration: number,
): number {
  if (typeof stored !== 'number' || !Number.isFinite(stored) || stored < 0) return 0;
  if (!(duration > PREVIEW_SECONDS)) return 0;
  return clamp(stored, 0, duration - PREVIEW_SECONDS);
}

/**
 * The media fragment for a preview.
 *
 * `#t=start,end` rather than a `currentTime` seek: the fragment is part of the
 * URL, so the browser can issue ONE range request for the bytes it needs
 * instead of fetching the head of the file and seeking into it. That is the
 * whole reason previewing a 6 MB track from a hover is affordable.
 */
export function previewFragment(streamUrl: string, start: number): string {
  const from = Math.max(0, Math.round(start * 100) / 100);
  return `${streamUrl}#t=${from},${from + PREVIEW_SECONDS}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
