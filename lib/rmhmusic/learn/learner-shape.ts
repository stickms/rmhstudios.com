/**
 * What the loading placeholders need to be the loaded page's height before the store has loaded:
 * the learner's instrument (which path, which Sprint levels) and a singer's range (an alto's staff
 * card is the taller low card). The `/rmhmusic` layout route reads it with its auth check (one
 * select on `music_learn_profile`, `getLearnerShape`) and hands it down as route context. Pure,
 * client-safe.
 */
import { INSTRUMENTS, type Instrument, type VoiceRange } from './schemas';
import { isVoiceRange } from './voice/range';

export interface LearnerShape {
  instrument: Instrument;
  /** A singer's range, null until chosen (never assumed). */
  voiceRange: VoiceRange | null;
}

export const DEFAULT_LEARNER_SHAPE: LearnerShape = {
  instrument: 'piano',
  voiceRange: null,
};

/** Narrow the stored columns (plain strings) so a stale value never reaches the UI. */
export function toLearnerShape(
  row: {
    instrument: string;
    voiceRange: string | null;
  } | null,
): LearnerShape {
  if (!row)
    return {
      ...DEFAULT_LEARNER_SHAPE,
    };
  return {
    instrument: (INSTRUMENTS as readonly string[]).includes(row.instrument)
      ? (row.instrument as Instrument)
      : DEFAULT_LEARNER_SHAPE.instrument,
    voiceRange: isVoiceRange(row.voiceRange) ? row.voiceRange : null,
  };
}
