/**
 * Words for the things the learner is drilled on, for the Insights page (`srs/insights.ts`
 * `describeItem` says what an item IS; this says it in the learner's language). One key per phrase,
 * the interval and chord words from `ear-names.ts`, the note-on-a-staff phrases the flashcards already use.
 */
import type { TFunction } from 'i18next';
import type { Clef } from '@/lib/rmhmusic/learn/theory/clef';
import type { ItemLabel } from '@/lib/rmhmusic/learn/srs/insights';
import { intervalName, qualityName } from './ear-names';
import { intervalLabel } from './interval-text';

type T = TFunction<'c-rmhmusic'>;

function clefWord(t: T, clef: Clef): string {
  return clef === 'bass'
    ? t('item-clef-bass', { defaultValue: 'bass' })
    : t('item-clef-treble', { defaultValue: 'treble' });
}

export function itemName(t: T, label: ItemLabel): string {
  switch (label.kind) {
    case 'staff':
      if (label.key) {
        return t('item-staff-key', {
          note: label.name,
          key: label.key,
          defaultValue: '{{note}} in {{key}} major',
        });
      }
      return label.clef === 'bass'
        ? t('flash-card-named-bass', { note: label.name, defaultValue: '{{note}} on the bass staff' })
        : t('flash-card-named-treble', { note: label.name, defaultValue: '{{note}} on the treble staff' });
    case 'staff-interval':
      return t('item-staff-interval', {
        name: intervalLabel(t, label.name),
        direction:
          label.direction === 'down'
            ? t('item-direction-down', { defaultValue: 'going down' })
            : t('item-direction-up', { defaultValue: 'going up' }),
        defaultValue: '{{name}}, {{direction}}',
      });
    case 'ear-interval':
      return t('item-ear-interval', { name: intervalName(t, label.name), defaultValue: 'Interval: {{name}}' });
    case 'ear-chord':
      return t('item-ear-chord', { name: qualityName(t, label.name), defaultValue: 'Chord: {{name}}' });
    case 'sprint-note':
      return t('item-sprint-note', {
        note: label.name,
        clef: clefWord(t, label.clef),
        defaultValue: 'Reading {{note}}, {{clef}} clef',
      });
    case 'sprint-chord':
      return t('item-sprint-chord', {
        root: label.root,
        quality: qualityName(t, label.quality),
        clef: clefWord(t, label.clef),
        defaultValue: '{{root}} {{quality}} chord, {{clef}} clef',
      });
  }
}
