/**
 * Words for the practice log's rows: what an entry was, its score and its length. `lib/` returns
 * data (kind, reference id, mode); the words and the number formats are here, in the active
 * language. Lesson and song titles are catalogue data, shown as written (as the path and the
 * songbook show them).
 */
import type { TFunction } from 'i18next';
import { formatMinutes } from '@/lib/rmhstudy/history';
import type { PracticeEntry } from '@/lib/rmhmusic/history.contract';
import { getLesson } from '@/lib/rmhmusic/learn/content/path';
import { songById } from '@/lib/rmhmusic/learn/songs/catalog';
import { isSprintLevelId } from '@/lib/rmhmusic/learn/sprint/levels';
import { levelName } from '../sprint/sprint-text';

type T =
  TFunction<'music-history'>;

/** A song's mode as its tab names it ("Wait for me", "Play along"). */
export function songModeName(
  t: T,
  mode:
    | string
    | null,
): string {
  return mode ===
    'play'
    ? t(
        'mode-play',
        {
          ns: 'music-history',
          defaultValue:
            'Play along',
        },
      )
    : t(
        'mode-wait',
        {
          ns: 'music-history',
          defaultValue:
            'Wait for me',
        },
      );
}

/**
 * What the entry was: the lesson's or song's title, the sprint's level or the daily challenge, or
 * "Card review". `tLevel` is the app's own `c-rmhmusic` translator, which names the sprint levels.
 */
export function entryName(
  t: T,
  tLevel: TFunction<'c-rmhmusic'>,
  entry: Pick<
    PracticeEntry,
    | 'kind'
    | 'refId'
    | 'mode'
  >,
): string {
  switch (
    entry.kind
  ) {
    case 'lesson':
      return (
        getLesson(
          entry.refId,
        )
          ?.title ??
        entry.refId
      );
    case 'song':
      return (
        songById(
          entry.refId,
        )
          ?.title ??
        entry.refId
      );
    case 'sprint':
      return entry.mode ===
        'daily'
        ? t(
            'sprint-daily',
            {
              ns: 'music-history',
              defaultValue:
                'Daily challenge',
            },
          )
        : t(
            'sprint-free',
            {
              ns: 'music-history',
              defaultValue:
                'Sight reading: {{level}}',
              level:
                isSprintLevelId(
                  entry.refId,
                )
                  ? levelName(
                      tLevel,
                      entry.refId,
                    )
                  : entry.refId,
            },
          );
    case 'cards':
      return t(
        'kind-cards-entry',
        {
          ns: 'music-history',
          defaultValue:
            'Card review',
        },
      );
  }
}

/** A length the way a row shows it: seconds under a minute, minutes and hours above. */
export function formatDuration(
  ms: number,
  locale: string,
): string {
  if (
    ms >=
    60_000
  )
    return formatMinutes(
      Math.round(
        ms /
          60_000,
      ),
      locale,
    );
  const seconds =
    Math.max(
      1,
      Math.round(
        ms /
          1000,
      ),
    );
  try {
    return new Intl.NumberFormat(
      locale,
      {
        style:
          'unit',
        unit: 'second',
        unitDisplay:
          'short',
      },
    ).format(
      seconds,
    );
  } catch {
    return `${seconds}s`;
  }
}
