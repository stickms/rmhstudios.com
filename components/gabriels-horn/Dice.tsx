'use client';

/**
 * Gabriel's Horn — the three dice, and the orb they sit in.
 *
 * Pips rather than numerals. A die reads faster as a pattern than as a digit,
 * and this is a game where three of them are read and summed under a clock by
 * everybody except the person who rolled.
 *
 * `faces` being `null` is not a loading state, it is **the rule**: the player
 * whose turn it is never receives the numbers (see `lib/gabriels-horn/net/
 * events.ts`). So the hidden form is a visibly empty well rather than a face
 * that has not arrived — otherwise the first round of every game is spent
 * wondering whether something is broken.
 */

import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react';
import { DICE_COUNT } from '@/lib/gabriels-horn/constants';
import { cn } from '@/lib/utils';

/**
 * Which of the nine grid cells carry a pip, per face — the standard
 * arrangement. Index 0 is top-left, 8 is bottom-right.
 */
const PIP_LAYOUT: Record<number, readonly number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Die({ face }: { face: number | null }) {
  const { t } = useTranslation('c-gabriels-horn');

  if (face === null) {
    return (
      <span
        className="gh-die"
        data-hidden="true"
        aria-label={t('die-hidden', { defaultValue: 'A die you cannot see' })}
        role="img"
      >
        ?
      </span>
    );
  }

  const pips = PIP_LAYOUT[face] ?? PIP_LAYOUT[1];
  return (
    <span
      className="gh-die"
      role="img"
      aria-label={t('die-face', { defaultValue: 'A {{face}}', face })}
    >
      {Array.from({ length: 9 }, (_, cell) => (
        <span
          key={cell}
          className={pips.includes(cell) ? 'gh-pip-dot' : undefined}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

export function Dice({
  faces,
  total,
  glimpsed = false,
  className,
}: {
  faces: number[] | null;
  total: number | null;
  glimpsed?: boolean;
  className?: string;
}) {
  const { t } = useTranslation('c-gabriels-horn');
  const shown = faces ?? Array.from({ length: DICE_COUNT }, () => null);

  return (
    <div className={cn('gh-orb', className)}>
      <div
        className="flex items-center justify-center gap-2.5"
        role="group"
        aria-label={
          faces
            ? t('dice-aria-visible', {
                defaultValue: 'The dice: {{faces}}',
                faces: faces.join(', '),
              })
            : t('dice-aria-hidden', { defaultValue: 'The dice, hidden from you' })
        }
      >
        {shown.map((face, index) => (
          // Dice have no identity beyond their slot — index is the only key
          // there is, and the row is a fixed three long.
          <Die key={index} face={face} />
        ))}
      </div>

      {total !== null ? (
        <p className="text-center text-sm text-(--app-text-muted)">
          <span className="font-semibold text-(--app-text)">
            {t('dice-total', { defaultValue: 'Total {{total}}', total })}
          </span>
          {glimpsed ? (
            <span className="ms-2 inline-flex items-center gap-1 text-(--gh-azure)">
              <Eye className="size-3.5" aria-hidden="true" />
              {t('dice-glimpsed', { defaultValue: 'bought with Azure' })}
            </span>
          ) : null}
        </p>
      ) : (
        <p className="text-center text-sm text-(--app-text-dim)">
          {t('dice-hidden-note', { defaultValue: 'You cannot see these. Ask the table.' })}
        </p>
      )}
    </div>
  );
}
