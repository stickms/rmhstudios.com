/**
 * The pitch match's sound line (MatchNoteLesson): which one its sentence line says, if any, and
 * the key that line takes. Pure, so the choice and the key are tested without rendering.
 */
import type { SoundStatus } from '@/lib/rmhmusic/learn/audio/voice';

export type SoundLine = 'blocked' | 'none' | 'loading' | 'fallback';

/**
 * The sound line for the question at hand: a Hear it that could not sound here (blocked, no Web
 * Audio, or still loading while the session decides) wins; otherwise, once the session settled on
 * the simple tone, the fallback notice while asking. Null when there is nothing to say.
 */
export function matchSoundLine(o: {
  /** The last Hear it was on this question. */
  here: boolean;
  /** What that Hear it found. */
  heard: 'ok' | 'waking' | 'blocked' | 'none' | 'loading';
  live: SoundStatus;
  fellBack: boolean;
  asking: boolean;
}): SoundLine | null {
  if (o.here && o.heard === 'blocked') return 'blocked';
  if (o.here && o.heard === 'none') return 'none';
  if (o.here && o.heard === 'loading' && o.live === 'loading') return 'loading';
  if (o.fellBack && o.asking) return 'fallback';
  return null;
}

/**
 * The sentence line's key for a sound line: one per line, so when the line changes (Loading
 * sound... to the fallback notice, which wraps to a second line on a phone) it is a new line and
 * not the old one re-wrapped in place, which the browser counts as a layout shift.
 */
export function soundLineKey(line: SoundLine, position: string): string {
  return `sound-${line}-${position}`;
}
