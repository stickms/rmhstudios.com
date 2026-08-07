/**
 * Slice It — the library features. Server-only. (Features 6 and 7.)
 *
 * ## Feature 6: natural-language search
 *
 * Split deliberately in two. `interpretSearch()` turns a phrase into a query
 * object and is the only part that talks to a model; `runSearch()` executes
 * that object against Postgres and never does. Three things follow, and all
 * three are the reason for the split:
 *
 *  - **The model cannot return a song.** It builds a filter and nothing else,
 *    so it has no way to invent a track that is not in the library — the
 *    failure mode that makes AI search worse than no search.
 *  - **The results are the library's, not the model's.** Visibility, the
 *    private-upload rule and the sort tiebreakers are applied by the same code
 *    the ordinary library uses, so an AI search can never surface a row the
 *    normal one would hide.
 *  - **It degrades to a normal search.** With no key configured, the caller
 *    passes the raw phrase as `terms` and gets substring matching — which is
 *    exactly what the search box did before this feature.
 *
 * `runSearch` also supports the filters the plain library route does not have
 * (BPM and duration bands, unplayed-only). That is the actual value here: "fast
 * songs I have not played" is three predicates a text box cannot express, and
 * they are all indexed columns.
 *
 * ## Feature 7: setlist builder
 *
 * Ordering, not selection, is the hard part — and the one a player cannot do
 * for themselves without playing everything first.
 *
 * It reasons over `duration`, `bpm`, play counts and the caller's own best
 * accuracy per song, and **not** over chart density, which would be the better
 * signal. Density lives in `analysisData`, which is hundreds of kilobytes per
 * song; loading two dozen of them to plan a setlist would be a multi-megabyte
 * read on a feature nobody is waiting for. BPM and length are already indexed
 * and carry most of the ramp.
 */

import type { Prisma } from '@prisma/client';
import { SLICE_IT_SEARCH, SLICE_IT_SETLIST } from '@/lib/ai/prompts';
import { prisma } from '@/lib/prisma.server';
import { attempt } from './run.server';
import {
  searchQuerySchema,
  setlistSchema,
  type ResolvedSetlistItem,
  type SearchQuery,
  type Setlist,
} from './types';
import { mmss } from './facts';
import { songSelect, toSliceSong } from '../songs.server';
import { SONGS_PAGE_SIZE, type Difficulty } from '../constants';
import type { SliceSong } from '../types';

/* -------------------------------------------------------------------------- */
/* 6. Natural-language search                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Turn a phrase into a query object, or `null` when AI is unavailable.
 *
 * The caller decides what `null` means. The search route treats it as "fall
 * back to a plain substring search on the raw phrase", which is the behaviour
 * the box had before.
 */
export async function interpretSearch(
  phrase: string,
  opts: { userId?: string | null } = {},
): Promise<SearchQuery | null> {
  const trimmed = phrase.trim();
  if (!trimmed) return null;

  const query = await attempt(SLICE_IT_SEARCH, searchQuerySchema, trimmed, opts);
  if (!query) return null;

  // A model that returns min > max has described an empty library. Swapping is
  // wrong (it invents an intent); dropping the pair returns the unfiltered
  // results, which at least contains what they asked for.
  const bpmInverted =
    query.minBpm !== undefined && query.maxBpm !== undefined && query.minBpm > query.maxBpm;
  const durationInverted =
    query.minDurationSec !== undefined &&
    query.maxDurationSec !== undefined &&
    query.minDurationSec > query.maxDurationSec;

  return {
    ...query,
    terms: query.terms.filter((term) => term.length > 0),
    ...(bpmInverted ? { minBpm: undefined, maxBpm: undefined } : {}),
    ...(durationInverted ? { minDurationSec: undefined, maxDurationSec: undefined } : {}),
  };
}

/** What the ordinary library route orders by, kept in step with it. */
const ORDER_BY: Record<string, Prisma.SongOrderByWithRelationInput[]> = {
  recent: [{ createdAt: 'desc' }, { id: 'desc' }],
  popular: [{ plays: 'desc' }, { id: 'desc' }],
  liked: [{ likes: { _count: 'desc' } }, { id: 'desc' }],
  title: [{ title: 'asc' }, { id: 'asc' }],
  duration: [{ duration: 'asc' }, { id: 'asc' }],
};

/**
 * Execute a query object. No model involved.
 *
 * Visibility follows the library route exactly: your own uploads include your
 * private ones, everyone else's do not. That rule is duplicated rather than
 * shared because it is three lines and the alternative is a helper whose
 * signature would have to carry both routes' divergent filters — but it must
 * stay in step, and any change to one belongs in the other.
 */
export async function runSearch(
  query: SearchQuery,
  userId: string | null,
  limit = SONGS_PAGE_SIZE,
): Promise<SliceSong[]> {
  const where: Prisma.SongWhereInput =
    query.mineOnly && userId ? { uploadedBy: userId } : { isPublic: true };

  const and: Prisma.SongWhereInput[] = [];

  for (const term of query.terms) {
    and.push({
      OR: [
        { title: { contains: term, mode: 'insensitive' } },
        { artist: { contains: term, mode: 'insensitive' } },
        { album: { contains: term, mode: 'insensitive' } },
      ],
    });
  }

  if (query.minBpm !== undefined || query.maxBpm !== undefined) {
    and.push({
      bpm: {
        ...(query.minBpm !== undefined ? { gte: query.minBpm } : {}),
        ...(query.maxBpm !== undefined ? { lte: query.maxBpm } : {}),
      },
    });
  }
  if (query.minDurationSec !== undefined || query.maxDurationSec !== undefined) {
    and.push({
      duration: {
        ...(query.minDurationSec !== undefined ? { gte: query.minDurationSec } : {}),
        ...(query.maxDurationSec !== undefined ? { lte: query.maxDurationSec } : {}),
      },
    });
  }
  // "Songs I have not played" is a `SongPlay` row that does not exist. `none`
  // compiles to a NOT EXISTS, which is indexed on (songId, userId).
  if (query.unplayedOnly && userId) {
    and.push({ songPlays: { none: { userId } } });
  }

  if (and.length > 0) where.AND = and;

  const rows = await prisma.song.findMany({
    where,
    orderBy: ORDER_BY[query.sort ?? 'recent'],
    take: Math.min(limit, SONGS_PAGE_SIZE),
    select: {
      ...songSelect,
      ...(userId
        ? {
            likes: { where: { userId }, select: { id: true } },
            songPlays: { where: { userId }, select: { count: true } },
          }
        : {}),
    },
  });

  return rows.map((row) => toSliceSong(row, userId));
}

/* -------------------------------------------------------------------------- */
/* 7. Setlist builder                                                         */
/* -------------------------------------------------------------------------- */

/** How many songs the model is shown. Enough to choose from, small enough to read. */
const SETLIST_CANDIDATES = 40;

/** One candidate, as the model sees it. */
interface Candidate {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  bpm: number;
  plays: number;
  /** The caller's best accuracy on this song, 0–1, or null if never played. */
  bestAccuracy: number | null;
}

/**
 * Build an ordered setlist for a goal and a time budget.
 *
 * Returns `null` when AI is unavailable or nothing usable came back. There is
 * no non-AI fallback here and deliberately so: an arbitrary ordering of songs
 * is not a setlist, and presenting one as though it were would be the feature
 * lying about what it did.
 */
export async function buildSetlist(
  input: { goal: string; minutes: number; userId: string },
  opts: { userId?: string | null } = {},
): Promise<{ setlist: Setlist; items: ResolvedSetlistItem[] } | null> {
  const budgetSec = Math.max(60, Math.min(120, input.minutes)) * 60;

  const rows = await prisma.song.findMany({
    where: { isPublic: true, duration: { lte: budgetSec } },
    orderBy: [{ plays: 'desc' }, { id: 'desc' }],
    take: SETLIST_CANDIDATES,
    select: {
      id: true,
      title: true,
      artist: true,
      duration: true,
      bpm: true,
      plays: true,
      scores: {
        where: { userId: input.userId },
        orderBy: { accuracy: 'desc' },
        take: 1,
        select: { accuracy: true },
      },
    },
  });

  if (rows.length === 0) return null;

  const candidates: Candidate[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    artist: row.artist,
    durationSec: row.duration,
    bpm: row.bpm ?? 0,
    plays: row.plays,
    bestAccuracy: row.scores[0]?.accuracy ?? null,
  }));

  const byId = new Map(candidates.map((c) => [c.id, c]));

  const text = [
    `goal: ${input.goal}`,
    `time budget: ${input.minutes} minutes (${budgetSec} seconds)`,
    '',
    'candidate songs:',
    ...candidates.map(
      (c) =>
        `  id=${c.id} "${c.title}" by ${c.artist} — ${mmss(c.durationSec)}, ` +
        `${c.bpm > 0 ? `${Math.round(c.bpm)} BPM` : 'BPM unknown'}, ${c.plays} plays, ` +
        `their best accuracy: ${
          c.bestAccuracy === null ? 'never played' : `${(c.bestAccuracy * 100).toFixed(1)}%`
        }`,
    ),
  ].join('\n');

  const setlist = await attempt(SLICE_IT_SETLIST, setlistSchema, text, opts);
  if (!setlist) return null;

  // Resolve against the candidates rather than trusting the ids. A model that
  // invents or repeats one produces a row that would render as a song nobody
  // can play; dropping it costs one line of a setlist.
  const seen = new Set<string>();
  const items: ResolvedSetlistItem[] = [];
  let total = 0;

  for (const item of setlist.items) {
    const candidate = byId.get(item.songId);
    if (!candidate || seen.has(item.songId)) continue;
    // The prompt states the budget; this enforces it. A setlist that overruns
    // the time the player asked for is not the thing they asked for.
    if (total + candidate.durationSec > budgetSec) continue;
    seen.add(item.songId);
    total += candidate.durationSec;
    items.push({
      songId: candidate.id,
      title: candidate.title,
      artist: candidate.artist,
      durationSec: candidate.durationSec,
      ...(item.difficulty ? { difficulty: item.difficulty as Difficulty } : {}),
      why: item.why,
    });
  }

  if (items.length === 0) return null;
  return { setlist: { ...setlist, items: setlist.items.filter((i) => seen.has(i.songId)) }, items };
}
