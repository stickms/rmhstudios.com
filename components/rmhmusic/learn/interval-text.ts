/**
 * Every sentence interval reading says, as pure functions of the translator and the question, so
 * each case can be checked without a DOM. One key per case; nothing is assembled from fragments
 * (the names of the intervals are whole words of their own, because "perfect fifth" is not
 * "perfect" + "fifth" in every language), and a count is said by two keys, one for a single step.
 *
 * While a question is asked its image is named only by the staff it is on, never by its notes or its
 * interval: a screen reader must not hear the answer. The notes are named once answered.
 *
 * Every call names its namespace (`ns`): this file has no `useTranslation` of its own, and the
 * extractor files a key with no namespace under `common`.
 */
import type { TFunction } from 'i18next';
import { sheetNoteName } from './StaffCard';
import {
  describeIntervalMiss,
  type IntervalQuestion,
  type StaffIntervalLesson,
  type StaffIntervalName,
} from '@/lib/rmhmusic/learn/theory/staff-intervals';

type T = TFunction<'c-rmhmusic'>;

/** An interval's name as the answer buttons and the sentences say it. */
export function intervalLabel(t: T, name: StaffIntervalName): string {
  switch (name) {
    case 'second':
      return t('interval-name-second', { ns: 'c-rmhmusic', defaultValue: 'Second' });
    case 'third':
      return t('interval-name-third', { ns: 'c-rmhmusic', defaultValue: 'Third' });
    case 'fourth':
      return t('interval-name-fourth', { ns: 'c-rmhmusic', defaultValue: 'Fourth' });
    case 'fifth':
      return t('interval-name-fifth', { ns: 'c-rmhmusic', defaultValue: 'Fifth' });
    case 'sixth':
      return t('interval-name-sixth', { ns: 'c-rmhmusic', defaultValue: 'Sixth' });
    case 'seventh':
      return t('interval-name-seventh', { ns: 'c-rmhmusic', defaultValue: 'Seventh' });
    case 'octave':
      return t('interval-name-octave', { ns: 'c-rmhmusic', defaultValue: 'Octave' });
    case 'minor-second':
      return t('interval-name-minor-second', { ns: 'c-rmhmusic', defaultValue: 'Minor second' });
    case 'major-second':
      return t('interval-name-major-second', { ns: 'c-rmhmusic', defaultValue: 'Major second' });
    case 'minor-third':
      return t('interval-name-minor-third', { ns: 'c-rmhmusic', defaultValue: 'Minor third' });
    case 'major-third':
      return t('interval-name-major-third', { ns: 'c-rmhmusic', defaultValue: 'Major third' });
    case 'perfect-fourth':
      return t('interval-name-perfect-fourth', { ns: 'c-rmhmusic', defaultValue: 'Perfect fourth' });
    case 'tritone':
      return t('interval-name-tritone', { ns: 'c-rmhmusic', defaultValue: 'Tritone' });
    case 'perfect-fifth':
      return t('interval-name-perfect-fifth', { ns: 'c-rmhmusic', defaultValue: 'Perfect fifth' });
    case 'minor-sixth':
      return t('interval-name-minor-sixth', { ns: 'c-rmhmusic', defaultValue: 'Minor sixth' });
    case 'major-sixth':
      return t('interval-name-major-sixth', { ns: 'c-rmhmusic', defaultValue: 'Major sixth' });
    case 'minor-seventh':
      return t('interval-name-minor-seventh', { ns: 'c-rmhmusic', defaultValue: 'Minor seventh' });
    case 'major-seventh':
      return t('interval-name-major-seventh', { ns: 'c-rmhmusic', defaultValue: 'Major seventh' });
    case 'perfect-octave':
      return t('interval-name-perfect-octave', { ns: 'c-rmhmusic', defaultValue: 'Perfect octave' });
  }
}

/** The instruction above the answers. */
export function intervalHint(t: T, tier: StaffIntervalLesson['tier']): string {
  return tier === 'size'
    ? t('interval-read-hint-size', {
        ns: 'c-rmhmusic',
        defaultValue: 'Count the lines and spaces from the first note to the second, counting both.',
      })
    : t('interval-read-hint-quality', {
        ns: 'c-rmhmusic',
        defaultValue: 'Name the size, then say whether it is minor, major or perfect.',
      });
}

/**
 * The image's name. While asking it says only which staff the notes are on; once answered it names
 * the notes, in the order they are written.
 */
export function intervalCardLabel(t: T, q: IntervalQuestion, answered: boolean): string {
  const treble = q.clef === 'treble';
  if (!answered) {
    return treble
      ? t('interval-read-card-ask-treble', {
          ns: 'c-rmhmusic',
          defaultValue: 'Two notes, one after the other, on the treble staff',
        })
      : t('interval-read-card-ask-bass', {
          ns: 'c-rmhmusic',
          defaultValue: 'Two notes, one after the other, on the bass staff',
        });
  }
  const first = sheetNoteName(q.first);
  const second = sheetNoteName(q.second);
  return treble
    ? t('interval-read-card-named-treble', {
        ns: 'c-rmhmusic',
        first,
        second,
        defaultValue: '{{first}} then {{second}} on the treble staff',
      })
    : t('interval-read-card-named-bass', {
        ns: 'c-rmhmusic',
        first,
        second,
        defaultValue: '{{first}} then {{second}} on the bass staff',
      });
}

/**
 * What a wrong answer says: the interval it was and the one that was named, then how far off the
 * answer was (in staff steps for a size, in semitones for a quality), and which way.
 */
export function intervalMissSentences(t: T, q: IntervalQuestion, said: StaffIntervalName): string[] {
  const lead = t('interval-read-said', {
    ns: 'c-rmhmusic',
    said: intervalLabel(t, said),
    right: intervalLabel(t, q.answer),
    defaultValue: 'You said {{said}}; it is {{right}}.',
  });
  const miss = describeIntervalMiss(q.answer, said);
  if (!miss) return [lead];
  const single = miss.n === 1;
  const n = miss.n;
  let how: string;
  if (miss.unit === 'steps') {
    how = miss.wider
      ? single
        ? t('interval-read-wide-step-single', { ns: 'c-rmhmusic', defaultValue: 'Your answer is one step too wide.' })
        : t('interval-read-wide-steps', {
            ns: 'c-rmhmusic',
            n,
            count: Number(n),
            defaultValue_one: 'Your answer is {{n}} step too wide.',
            defaultValue: 'Your answer is {{n}} steps too wide.',
          })
      : single
        ? t('interval-read-narrow-step-single', {
            ns: 'c-rmhmusic',
            defaultValue: 'Your answer is one step too narrow.',
          })
        : t('interval-read-narrow-steps', {
            ns: 'c-rmhmusic',
            n,
            count: Number(n),
            defaultValue_one: 'Your answer is {{n}} step too narrow.',
            defaultValue: 'Your answer is {{n}} steps too narrow.',
          });
  } else {
    how = miss.wider
      ? single
        ? t('interval-read-wide-semitone-single', {
            ns: 'c-rmhmusic',
            defaultValue: 'Your answer is one semitone too wide.',
          })
        : t('interval-read-wide-semitones', {
            ns: 'c-rmhmusic',
            n,
            count: Number(n),
            defaultValue_one: 'Your answer is {{n}} semitone too wide.',
            defaultValue: 'Your answer is {{n}} semitones too wide.',
          })
      : single
        ? t('interval-read-narrow-semitone-single', {
            ns: 'c-rmhmusic',
            defaultValue: 'Your answer is one semitone too narrow.',
          })
        : t('interval-read-narrow-semitones', {
            ns: 'c-rmhmusic',
            n,
            count: Number(n),
            defaultValue_one: 'Your answer is {{n}} semitone too narrow.',
            defaultValue: 'Your answer is {{n}} semitones too narrow.',
          });
  }
  return [lead, how];
}
