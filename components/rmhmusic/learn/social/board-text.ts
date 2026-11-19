/**
 * Every sentence the Daily board says (RMH Music Phase 6), as pure functions of the translator and
 * the data, so each case is checked without a DOM. Numbers through `Intl` in the viewer's locale;
 * places are plain numbers ("14"), never ordinals. No sentence names a threshold of the board's
 * checks.
 *
 * Every call names its namespace (`ns`): this file has no `useTranslation` of its own.
 */
import type { TFunction } from 'i18next';
import { nextBoardAt } from '@/lib/rmhmusic/learn/social/board';
import type {
  BoardScope,
  DailyBoardMe,
  DailyBoardRow,
} from '@/lib/rmhmusic/social/social.contract';

type T =
  TFunction<'c-rmhmusic'>;

/** A learner's name on the board, or "A learner" when they have none. */
export function learnerName(
  t: T,
  name:
    | string
    | null,
): string {
  return (
    name ||
    t(
      'board-a-learner',
      {
        ns: 'c-rmhmusic',
        defaultValue:
          'A learner',
      },
    )
  );
}

/** The mean answer in seconds, one decimal, in the viewer's locale. */
export function secondsANote(
  language: string,
  avgMs: number,
): string {
  return new Intl.NumberFormat(
    language,
    {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    },
  ).format(
    avgMs /
      1000,
  );
}

/** One row as a screen reader hears it: "Place 14, Alex, 92 points, 0.9 seconds a note". */
export function boardRowSentence(
  t: T,
  language: string,
  row: DailyBoardRow,
): string {
  const name =
    learnerName(
      t,
      row
        .user
        .name,
    );
  const vars =
    {
      rank: row.rank,
      name,
      score:
        row.score,
    };
  // One complete string per case (never "{{row}}, without chords"): word order is the language's.
  if (
    row.avgMs ===
    null
  )
    return row.withoutChords
      ? t(
          'board-row-chordless',
          {
            ns: 'c-rmhmusic',
            ...vars,
            defaultValue:
              'Place {{rank}}, {{name}}, {{score}} points, without chords',
          },
        )
      : t(
          'board-row',
          {
            ns: 'c-rmhmusic',
            ...vars,
            defaultValue:
              'Place {{rank}}, {{name}}, {{score}} points',
          },
        );
  const seconds =
    secondsANote(
      language,
      row.avgMs,
    );
  return row.withoutChords
    ? t(
        'board-row-time-chordless',
        {
          ns: 'c-rmhmusic',
          ...vars,
          seconds,
          defaultValue:
            'Place {{rank}}, {{name}}, {{score}} points, {{seconds}} seconds a note, without chords',
        },
      )
    : t(
        'board-row-time',
        {
          ns: 'c-rmhmusic',
          ...vars,
          seconds,
          defaultValue:
            'Place {{rank}}, {{name}}, {{score}} points, {{seconds}} seconds a note',
        },
      );
}

/** Which board the line is about: the day shown, and Everyone or Friends. */
export interface BoardWhere {
  day:
    | 'today'
    | 'yesterday';
  scope: BoardScope;
}

const TODAY_EVERYONE: BoardWhere =
  {
    day: 'today',
    scope:
      'everyone',
  };

/**
 * Where the viewer's own run of the day stands, on the board shown: on the Friends tab the place
 * is among friends (`board.server.ts` ranks it there).
 */
export function boardStatusSentence(
  t: T,
  me: DailyBoardMe,
  where: BoardWhere = TODAY_EVERYONE,
): string {
  switch (
    me.state
  ) {
    case 'not-played':
      return where.day ===
        'yesterday'
        ? t(
            'board-me-not-played-yesterday',
            {
              ns: 'c-rmhmusic',
              defaultValue:
                "You didn't play yesterday's challenge.",
            },
          )
        : t(
            'board-me-not-played',
            {
              ns: 'c-rmhmusic',
              defaultValue:
                "You haven't played today's challenge yet.",
            },
          );
    case 'started':
      return t(
        'board-me-started',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            "Your run started but didn't finish, so this day has no score.",
        },
      );
    case 'ranked':
      return where.scope ===
        'friends'
        ? t(
            'board-me-ranked-friends',
            {
              ns: 'c-rmhmusic',
              rank: me.rank,
              total:
                me.total,
              defaultValue:
                'Place {{rank}} of {{total}} among your friends',
            },
          )
        : t(
            'board-me-ranked',
            {
              ns: 'c-rmhmusic',
              rank: me.rank,
              total:
                me.total,
              defaultValue:
                'Place {{rank}} of {{total}}',
            },
          );
    case 'private':
      return t(
        'board-me-private',
        {
          ns: 'c-rmhmusic',
          score:
            me.score,
          rank: me.rank,
          total:
            me.total,
          defaultValue:
            'Your {{score}} would place {{rank}} of {{total}}. Only you can see this.',
        },
      );
    case 'unranked':
      if (
        me.reason ===
        null
      )
        return t(
          'board-me-before-board',
          {
            ns: 'c-rmhmusic',
            defaultValue:
              'This run was before the board started.',
          },
        );
      return me.reason ===
        'no-start'
        ? t(
            'board-me-no-start',
            {
              ns: 'c-rmhmusic',
              defaultValue:
                'This run is not on the board: the start of this run did not reach us.',
            },
          )
        : t(
            'board-me-checks',
            {
              ns: 'c-rmhmusic',
              defaultValue:
                "This run is not on the board: it did not pass the board's timing checks.",
            },
          );
    case 'hidden':
      return t(
        'board-me-hidden',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'A moderator took this run off the board.',
        },
      );
  }
}

/** "The board starts again at 01:00 your time." (the next UTC midnight, in the viewer's clock). */
export function nextBoardLine(
  t: T,
  language: string,
  now: number,
  timeZone?: string,
): string {
  const time =
    new Intl.DateTimeFormat(
      language,
      {
        hour: '2-digit',
        minute:
          '2-digit',
        ...(timeZone
          ? {
              timeZone,
            }
          : {}),
      },
    ).format(
      nextBoardAt(
        now,
      ),
    );
  return t(
    'board-next',
    {
      ns: 'c-rmhmusic',
      time,
      defaultValue:
        'The board starts again at {{time}} your time.',
    },
  );
}
