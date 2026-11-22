/**
 * The words for an interval and a chord quality, one translation key each (never joined to other
 * words). Shared by the ear lessons, the chord lesson and the Insights and Today pages, so each
 * word has one key and one default.
 */
import type { TFunction } from 'i18next';
import type { ChordQuality } from '@/lib/rmhmusic/learn/theory/chords';
import type { IntervalName } from '@/lib/rmhmusic/learn/theory/intervals';

type T = TFunction<'c-rmhmusic'>;

/** An interval's word, one key each (never joined to other words). */
export function intervalName(t: T, name: IntervalName): string {
  switch (name) {
    case 'unison':
      return t('ear-interval-unison', {
        defaultValue: 'unison',
      });
    case 'second':
      return t('ear-interval-second', {
        defaultValue: 'second',
      });
    case 'third':
      return t('ear-interval-third', {
        defaultValue: 'third',
      });
    case 'fourth':
      return t('ear-interval-fourth', {
        defaultValue: 'fourth',
      });
    case 'fifth':
      return t('ear-interval-fifth', {
        defaultValue: 'fifth',
      });
    case 'sixth':
      return t('ear-interval-sixth', {
        defaultValue: 'sixth',
      });
    case 'seventh':
      return t('ear-interval-seventh', {
        defaultValue: 'seventh',
      });
    case 'octave':
      return t('ear-interval-octave', {
        defaultValue: 'octave',
      });
  }
}

/** A quality's word, one key each. */
export function qualityName(t: T, quality: ChordQuality): string {
  switch (quality) {
    case 'major':
      return t('chord-quality-major', {
        defaultValue: 'major',
      });
    case 'minor':
      return t('chord-quality-minor', {
        defaultValue: 'minor',
      });
    case 'diminished':
      return t('chord-quality-diminished', {
        defaultValue: 'diminished',
      });
    case 'augmented':
      return t('chord-quality-augmented', {
        defaultValue: 'augmented',
      });
  }
}
