import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { ScoreMomentView } from './result-moment-slot';

/**
 * The top of a game-over screen: the session's best moment, and what the score
 * means against the player's own record.
 *
 * Peak-end rule (Daniel Kahneman, 1993): people remember an experience by its
 * most intense moment and by how it ended, not by its average. A game-over
 * screen IS the end, so it leads with the peak ("Best combo: 41") instead of a
 * table where every number weighs the same.
 *
 * Self-determination theory (Deci & Ryan, 1985) and the overjustification
 * effect (Lepper, Greene & Nisbett, 1973): feedback that reports competence
 * keeps play intrinsically motivated, where a reward for merely playing can
 * crowd that out. So the second line is information about the player's skill
 * ("12,400 more than your last best"), never a payout.
 *
 * Games keep their own look (Steel L8): this inherits colour and font from the
 * screen it sits on and only sets size and spacing.
 */
export interface SessionPeak {
  /** What the number is, already translated ("Best combo"). */
  label: string;
  /** The number, already formatted ("41x", "3:12"). */
  value: string;
}

export function SessionHighlight({
  peak,
  moment,
  className,
}: {
  peak: SessionPeak | null;
  /** The score endpoint's personal-best moment, when this run set one. */
  moment: ScoreMomentView | null;
  className?: string;
}) {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'c-game',
    );
  const fmt =
    (
      n: number,
    ) =>
      n.toLocaleString(
        i18n.language,
      );

  let record:
    | string
    | null =
    null;
  if (
    moment?.kind ===
    'first-score'
  ) {
    record =
      t(
        'session-first-score',
        {
          defaultValue:
            'Your first score on the board.',
        },
      );
  } else if (
    moment?.kind ===
      'pb' &&
    moment.previous !=
      null
  ) {
    record =
      t(
        'session-new-best',
        {
          defaultValue:
            'A new personal best, {{delta}} past your last one.',
          delta:
            fmt(
              Math.abs(
                moment.score -
                  moment.previous,
              ),
            ),
        },
      );
  } else if (
    moment?.kind ===
    'pb'
  ) {
    record =
      t(
        'session-new-best-plain',
        {
          defaultValue:
            'A new personal best.',
        },
      );
  }

  if (
    !peak &&
    !record
  )
    return null;

  return (
    <div
      data-slot="session-highlight"
      className={cn(
        'space-y-1 text-center',
        className,
      )}
    >
      {peak ? (
        <p>
          <span className="block text-xs opacity-70">
            {t(
              'session-best-moment',
              {
                defaultValue:
                  'Best moment',
              },
            )}
          </span>
          <span className="block text-lg font-semibold tabular-nums">
            {
              peak.label
            }
            :{' '}
            {
              peak.value
            }
          </span>
        </p>
      ) : null}
      {record ? (
        <p className="text-sm opacity-80">
          {
            record
          }
        </p>
      ) : null}
    </div>
  );
}
