/**
 * What a shared result says (RMH Music Phase 6, plan 1.4), as pure functions of the translator and
 * the stored snapshot, so each case is checked without a DOM. The share dialog shows these lines
 * before anything is public, the public page shows them, and in English they are exactly the
 * card's (`cardLines`, which the server draws in English for every viewer). Dates in the viewer's
 * locale, in UTC for a Daily date; song titles and composers are data.
 *
 * Every call names its namespace (`ns`): this file has no `useTranslation` of its own.
 */
import type { TFunction } from 'i18next';
import type {
  CardLines,
  SharePayload,
} from '@/lib/rmhmusic/learn/social/share';
import { songById } from '@/lib/rmhmusic/learn/songs/catalog';

type T =
  TFunction<'c-rmhmusic'>;

function shortDate(
  language: string,
  value: Date,
): string {
  return new Intl.DateTimeFormat(
    language,
    {
      day: 'numeric',
      month:
        'short',
      year: 'numeric',
      timeZone:
        'UTC',
    },
  ).format(
    value,
  );
}

function seconds(
  language: string,
  ms: number,
): string {
  return new Intl.NumberFormat(
    language,
    {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    },
  ).format(
    ms /
      1000,
  );
}

function modeName(
  t: T,
  mode:
    | 'wait'
    | 'play',
): string {
  return mode ===
    'play'
    ? t(
        'song-mode-play',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'Play along',
        },
      )
    : t(
        'song-mode-wait',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'Wait for me',
        },
      );
}

function versionName(
  t: T,
  version:
    | 'piano'
    | 'guitar'
    | 'voice',
): string {
  return version ===
    'guitar'
    ? t(
        'share-version-guitar',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'guitar',
        },
      )
    : version ===
        'voice'
      ? t(
          'share-version-voice',
          {
            ns: 'c-rmhmusic',
            defaultValue:
              'voice',
          },
        )
      : t(
          'share-version-piano',
          {
            ns: 'c-rmhmusic',
            defaultValue:
              'piano',
          },
        );
}

function dailyLead(
  t: T,
  language: string,
  date: string,
): string {
  return t(
    'share-daily-lead',
    {
      ns: 'c-rmhmusic',
      date: shortDate(
        language,
        new Date(
          `${date}T00:00:00Z`,
        ),
      ),
      defaultValue:
        'Daily sight reading · {{date}}',
    },
  );
}

function songLead(
  t: T,
  songId: string,
): string {
  const song =
    songById(
      songId,
    );
  return song
    ? t(
        'share-song-lead',
        {
          ns: 'c-rmhmusic',
          title:
            song.title,
          composer:
            song.composer,
          defaultValue:
            '{{title}} — {{composer}}',
        },
      )
    : t(
        'share-song-unknown',
        {
          ns: 'c-rmhmusic',
          defaultValue:
            'A song',
        },
      );
}

/** The result's lines: what the dialog previews, the page shows and (in English) the card draws. */
export function shareText(
  t: T,
  language: string,
  p: SharePayload,
): CardLines {
  const title =
    t(
      'share-points',
      {
        ns: 'c-rmhmusic',
        score:
          p.score,
        defaultValue:
          '{{score}} points',
      },
    );
  const stars =
    t(
      'share-stars',
      {
        ns: 'c-rmhmusic',
        stars:
          p.stars,
        defaultValue:
          '{{stars}} of 3 stars',
      },
    );
  if (
    p.kind ===
    'daily'
  ) {
    const parts: string[] =
      [];
    if (
      p.right !==
      null
    )
      parts.push(
        t(
          'share-right',
          {
            ns: 'c-rmhmusic',
            right:
              p.right,
            played:
              p.played,
            defaultValue:
              '{{right}} of {{played}} right',
          },
        ),
      );
    if (
      p.avgMs !==
      null
    )
      parts.push(
        t(
          'share-seconds',
          {
            ns: 'c-rmhmusic',
            seconds:
              seconds(
                language,
                p.avgMs,
              ),
            defaultValue:
              '{{seconds}} s a note',
          },
        ),
      );
    if (
      p.skipped >
      0
    )
      parts.push(
        t(
          'share-without-chords',
          {
            ns: 'c-rmhmusic',
            defaultValue:
              'without chords',
          },
        ),
      );
    return {
      lead: dailyLead(
        t,
        language,
        p.date,
      ),
      title,
      subtitle:
        parts.join(
          ' · ',
        ),
      stars,
    };
  }
  return {
    lead: songLead(
      t,
      p.songId,
    ),
    title,
    subtitle: `${modeName(t, p.mode)} · ${versionName(t, p.version)}`,
    stars,
  };
}

/** A link in the Shared links list: what it shares. */
export function shareLinkLabel(
  t: T,
  language: string,
  p: SharePayload,
): string {
  return p.kind ===
    'daily'
    ? dailyLead(
        t,
        language,
        p.date,
      )
    : t(
        'share-link-song',
        {
          ns: 'c-rmhmusic',
          song: songLead(
            t,
            p.songId,
          ),
          mode: modeName(
            t,
            p.mode,
          ),
          defaultValue:
            '{{song}}, {{mode}}',
        },
      );
}

/** "Works until 14 Feb 2027". */
export function shareExpiryLine(
  t: T,
  language: string,
  expiresAt: string,
): string {
  return t(
    'share-works-until',
    {
      ns: 'c-rmhmusic',
      date: shortDate(
        language,
        new Date(
          expiresAt,
        ),
      ),
      defaultValue:
        'Works until {{date}}',
    },
  );
}
