/**
 * Harmonic's own player preferences, beside the shared `GameSettings` (mouse, FOV, volume…):
 * the subtitle size. localStorage `harmonic:prefs`, guarded like the save. Environment-agnostic.
 */
import { browserStorage, type SaveStorage } from './save';

export const SUBTITLE_SIZES = ['small', 'medium', 'large'] as const;
export type SubtitleSize = (typeof SUBTITLE_SIZES)[number];

export interface HarmonicPrefs {
  subtitleSize: SubtitleSize;
}

export const HARMONIC_PREFS_KEY = 'harmonic:prefs';
export const DEFAULT_PREFS: HarmonicPrefs = { subtitleSize: 'medium' };

export function parsePrefs(raw: unknown): HarmonicPrefs {
  const size =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>).subtitleSize : undefined;
  return {
    subtitleSize: (SUBTITLE_SIZES as readonly unknown[]).includes(size)
      ? (size as SubtitleSize)
      : DEFAULT_PREFS.subtitleSize,
  };
}

export function loadPrefs(storage: SaveStorage | null = browserStorage()): HarmonicPrefs {
  try {
    const text = storage?.getItem(HARMONIC_PREFS_KEY);
    return text ? parsePrefs(JSON.parse(text)) : { ...DEFAULT_PREFS };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(
  prefs: HarmonicPrefs,
  storage: SaveStorage | null = browserStorage(),
): void {
  try {
    storage?.setItem(HARMONIC_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* kept in memory only */
  }
}
