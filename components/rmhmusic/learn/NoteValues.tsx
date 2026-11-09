/**
 * NoteValues — the four note values of the rhythm lesson (whole, half, quarter, eighth), drawn as
 * if copied out with a pen, each with its name and, once a question has been answered, how many
 * beats it lasts. One fixed-height row (`.rmm-values`, 8rem), the same in the placeholder, so
 * showing the counts moves nothing.
 *
 * `asked` is the value the question ("How many beats does the underlined note last?") is about:
 * its name is underlined (a pencilled mark, not just a colour) and the others are set in the muted
 * ink; with none, all four are in full ink. For a screen reader the same item is `aria-current`
 * and carries the word "underlined" after its name, so "which note?" has the answer a sighted
 * learner gets from the page: the note is named, as it is on screen, and nothing else is said. The
 * counts, which would be the answer, stay `invisible` (out of the accessibility tree) until the
 * question has been answered. The glyphs are decoration (`aria-hidden`); the names and counts are
 * real text. The row is `ltr` whatever the language, since the order whole to eighth is the order
 * of the lesson.
 */

import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { BEATS_OF, NOTE_VALUES, type NoteValue } from '@/lib/rmhmusic/learn/machines/rhythm';
import { cn } from '@/lib/utils';

type T = TFunction<'c-rmhmusic'>;

/** "4 beats", "1 beat", "half a beat": one key each (never joined to other words). */
export function beatsLabel(t: T, beats: number): string {
  if (beats === 0.5) return t('rhythm-half-beat', { defaultValue: 'half a beat' });
  return t('rhythm-beats', {
    count: beats,
    defaultValue_one: '{{count}} beat',
    defaultValue: '{{count}} beats',
  });
}

/** A value's name, one key each. */
export function valueName(t: T, value: NoteValue): string {
  switch (value) {
    case 'whole':
      return t('rhythm-value-whole', { defaultValue: 'whole' });
    case 'half':
      return t('rhythm-value-half', { defaultValue: 'half' });
    case 'quarter':
      return t('rhythm-value-quarter', { defaultValue: 'quarter' });
    case 'eighth':
      return t('rhythm-value-eighth', { defaultValue: 'eighth' });
  }
}

/** One note, in a 32 x 64 box: the head, and for all but the whole note a stem, and a flag on the eighth. */
function Glyph({ value }: { value: NoteValue }) {
  const open = value === 'whole' || value === 'half';
  return (
    <svg
      viewBox="0 0 32 64"
      aria-hidden="true"
      focusable="false"
      className="h-[4.5rem] w-8 overflow-visible"
    >
      <ellipse
        cx="14"
        cy="52"
        rx={value === 'whole' ? 10 : 8}
        ry={value === 'whole' ? 6.5 : 5.6}
        transform={`rotate(-20 14 52)`}
        fill={open ? 'none' : 'currentColor'}
        stroke="currentColor"
        strokeWidth="2"
      />
      {value !== 'whole' && (
        <path
          d="M21.4 49.5 V6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
      {value === 'eighth' && (
        <path
          d="M21.4 6 C21.4 20 31 24 28 38"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export function NoteValues({
  asked = null,
  counts = false,
}: {
  asked?: NoteValue | null;
  /** Show how many beats each lasts. */
  counts?: boolean;
}) {
  const { t } = useTranslation('c-rmhmusic');
  return (
    <ul dir="ltr" className="rmm-values grid grid-cols-4 items-end gap-1">
      {NOTE_VALUES.map((value) => (
        <li
          key={value}
          aria-current={asked === value ? 'true' : undefined}
          className={cn(
            'flex flex-col items-center',
            asked === null || asked === value ? 'text-(--app-text)' : 'text-(--app-text-muted)',
          )}
        >
          <Glyph value={value} />
          <span
            className={cn(
              'mt-1 h-6 border-b-2 text-sm leading-5',
              asked === value ? 'border-(--app-accent)' : 'border-transparent',
            )}
          >
            {valueName(t, value)}
          </span>
          {asked === value && (
            <span className="sr-only">
              {t('rhythm-value-underlined', { defaultValue: 'underlined' })}
            </span>
          )}
          <span
            className={cn(
              'h-6 text-center text-xs leading-6 text-(--app-text-muted)',
              !counts && 'invisible',
            )}
          >
            {beatsLabel(t, BEATS_OF[value])}
          </span>
        </li>
      ))}
    </ul>
  );
}
