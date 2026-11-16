/**
 * Share a result (RMH Music Phase 6, plan 1.4) — pure, client-safe. `share.server.ts` reads and
 * writes the rows; what a share holds and says lives here.
 *
 * - **What:** the date's scored Daily run, or a song's best for one mode. The server takes the
 *   snapshot from the stored row (`dailyPayload`, `songPayload`), never from client text, and
 *   stores it versioned (`v: 1`).
 * - **The link:** `/rmhmusic/r/<token>`, 128 random bits as 22 base64url characters
 *   (`isShareToken` is checked before any query). It works for 90 days unless stopped sooner, or
 *   hidden by a moderator; at most 50 live links a learner.
 * - **The card** (`cardLines`) is English, as every card is; the page and the share dialog say the
 *   same lines in the viewer's language (`components/rmhmusic/learn/social/share-text.ts`).
 */
import type { Instrument } from '../schemas';
import { starsFor } from '../scoring/stars';
import { songById } from '../songs/catalog';
import {
  isSongMode,
  type SongMode,
} from '../songs/scoring';

const DAY_MS = 86_400_000;

/** A link works for 90 days (owner decision Q3). */
export const SHARE_TTL_MS =
  90 *
  DAY_MS;

/** At most this many live links per learner; the next is refused with a sentence. */
export const SHARE_LIVE_CAP = 50;

/** Expired links are deleted by the maintenance job this long after they expire. */
export const SHARE_SWEEP_AFTER_MS =
  30 *
  DAY_MS;

export const SHARE_TOKEN_RE =
  /^[A-Za-z0-9_-]{22}$/;

export function isShareToken(
  v: unknown,
): v is string {
  return (
    typeof v ===
      'string' &&
    SHARE_TOKEN_RE.test(
      v,
    )
  );
}

/** The public page of a share. */
export function sharePath(
  token: string,
): string {
  return `/rmhmusic/r/${token}`;
}

export type ShareKind =
  | 'daily'
  | 'song';

export interface DailyPayload {
  v: 1;
  kind: 'daily';
  date: string;
  score: number;
  stars: number;
  /** Right answers among the prompts played; null when the stored run carries no results. */
  right:
    | number
    | null;
  played: number;
  /** Prompts not asked (chords on the microphone or for a singer). */
  skipped: number;
  avgMs:
    | number
    | null;
}

export interface SongPayload {
  v: 1;
  kind: 'song';
  songId: string;
  mode: SongMode;
  /** The learner's instrument when they shared: which version of the song they played. */
  version: Instrument;
  score: number;
  stars: number;
}

export type SharePayload =
  | DailyPayload
  | SongPayload;

export function dailySubject(
  date: string,
): string {
  return date;
}

export function songSubject(
  songId: string,
  mode:
    | SongMode
    | string,
): string {
  return `${songId}:${mode}`;
}

const int =
  (
    v: unknown,
  ): v is number =>
    typeof v ===
      'number' &&
    Number.isInteger(
      v,
    );

/** Right answers of a stored Daily run's results (the server recomputed them when it was saved). */
function rightOf(
  results: unknown,
):
  | number
  | null {
  if (
    !Array.isArray(
      results,
    )
  )
    return null;
  let right = 0;
  for (const r of results) {
    if (
      r &&
      typeof r ===
        'object' &&
      (
        r as {
          correct?: unknown;
        }
      )
        .correct ===
        true &&
      (
        r as {
          skipped?: unknown;
        }
      )
        .skipped !==
        true
    )
      right++;
  }
  return right;
}

/** The snapshot of a scored Daily run; null for a run that was started and never scored. */
export function dailyPayload(row: {
  date: string;
  score:
    | number
    | null;
  avgMs:
    | number
    | null;
  played:
    | number
    | null;
  skipped:
    | number
    | null;
  results: unknown;
}): DailyPayload | null {
  if (
    row.score ===
    null
  )
    return null;
  return {
    v: 1,
    kind: 'daily',
    date: row.date,
    score:
      row.score,
    stars:
      starsFor(
        row.score,
      ),
    right:
      rightOf(
        row.results,
      ),
    played:
      row.played ??
      0,
    skipped:
      row.skipped ??
      0,
    avgMs:
      row.avgMs,
  };
}

/** The snapshot of a song best; null for a song the songbook no longer has or an unknown mode. */
export function songPayload(
  row: {
    songId: string;
    mode: string;
    bestScore: number;
  },
  version: Instrument,
): SongPayload | null {
  if (
    !songById(
      row.songId,
    ) ||
    !isSongMode(
      row.mode,
    )
  )
    return null;
  return {
    v: 1,
    kind: 'song',
    songId:
      row.songId,
    mode: row.mode,
    version,
    score:
      row.bestScore,
    stars:
      starsFor(
        row.bestScore,
      ),
  };
}

/** A stored payload, checked: anything but a version-1 payload of a known shape is null. */
export function readPayload(
  json: unknown,
): SharePayload | null {
  if (
    !json ||
    typeof json !==
      'object'
  )
    return null;
  const p =
    json as Record<
      string,
      unknown
    >;
  if (
    p.v !==
      1 ||
    !int(
      p.score,
    ) ||
    !int(
      p.stars,
    )
  )
    return null;
  if (
    p.kind ===
    'daily'
  ) {
    if (
      typeof p.date !==
        'string' ||
      !int(
        p.played,
      ) ||
      !int(
        p.skipped,
      )
    )
      return null;
    if (
      p.right !==
        null &&
      !int(
        p.right,
      )
    )
      return null;
    if (
      p.avgMs !==
        null &&
      !int(
        p.avgMs,
      )
    )
      return null;
    return {
      v: 1,
      kind: 'daily',
      date: p.date,
      score:
        p.score,
      stars:
        p.stars,
      right:
        p.right as
          | number
          | null,
      played:
        p.played,
      skipped:
        p.skipped,
      avgMs:
        p.avgMs as
          | number
          | null,
    };
  }
  if (
    p.kind ===
    'song'
  ) {
    if (
      typeof p.songId !==
        'string' ||
      !isSongMode(
        p.mode,
      )
    )
      return null;
    if (
      p.version !==
        'piano' &&
      p.version !==
        'guitar' &&
      p.version !==
        'voice'
    )
      return null;
    return {
      v: 1,
      kind: 'song',
      songId:
        p.songId,
      mode: p.mode,
      version:
        p.version,
      score:
        p.score,
      stars:
        p.stars,
    };
  }
  return null;
}

export function samePayload(
  a: SharePayload | null,
  b: SharePayload | null,
): boolean {
  return (
    a !==
      null &&
    b !==
      null &&
    JSON.stringify(
      a,
    ) ===
      JSON.stringify(
        b,
      )
  );
}

/** A share no one can see any more: stopped by its learner, hidden by a moderator, or expired. */
export function shareGone(
  row: {
    expiresAt: Date;
    stoppedAt: Date | null;
    hiddenAt: Date | null;
  },
  now: number,
): boolean {
  return (
    row.stoppedAt !==
      null ||
    row.hiddenAt !==
      null ||
    row.expiresAt.getTime() <=
      now
  );
}

export interface CardLines {
  lead: string;
  title: string;
  subtitle: string;
  stars: string;
}

const CARD_DATE =
  new Intl.DateTimeFormat(
    'en-GB',
    {
      day: 'numeric',
      month:
        'short',
      year: 'numeric',
      timeZone:
        'UTC',
    },
  );

const MODE_NAME: Record<
  SongMode,
  string
> =
  {
    wait: 'Wait for me',
    play: 'Play along',
  };

/** The card's lines, in English (the card is drawn once for every viewer). */
export function cardLines(
  p: SharePayload,
): CardLines {
  const stars = `${p.stars} of 3 stars`;
  const title = `${p.score} points`;
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
        `${p.right} of ${p.played} right`,
      );
    if (
      p.avgMs !==
      null
    )
      parts.push(
        `${(p.avgMs / 1000).toFixed(1)} s a note`,
      );
    if (
      p.skipped >
      0
    )
      parts.push(
        'without chords',
      );
    return {
      lead: `Daily sight reading · ${CARD_DATE.format(new Date(`${p.date}T00:00:00Z`))}`,
      title,
      subtitle:
        parts.join(
          ' · ',
        ),
      stars,
    };
  }
  const song =
    songById(
      p.songId,
    );
  return {
    lead: song
      ? `${song.title} — ${song.composer}`
      : 'A song',
    title,
    subtitle: `${MODE_NAME[p.mode]} · ${p.version}`,
    stars,
  };
}
