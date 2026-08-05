/**
 * The resume rail (B2) — server-only.
 *
 * "Jump back in" already exists (`hooks/useRecents` → `components/feed/JumpBackIn`)
 * but it is a per-DEVICE localStorage list of hrefs: it knows you opened
 * Isleworks, not that you are on day 34 with a save waiting, and it knows
 * nothing at all on the phone you did it from. This module answers the harder
 * question — *what is unfinished on this account* — by projecting the five
 * places the site already stores half-finished state:
 *
 *   | source                     | table            | shipped? |
 *   | -------------------------- | ---------------- | -------- |
 *   | cloud game saves           | `GameSave`       | yes      |
 *   | long-form read positions   | `ReadPosition`   | yes (B7) |
 *   | media watch/listen history | `HistoryEntry`   | see note |
 *   | unpublished drafts         | `ScheduledPost`  | yes      |
 *   | flashcards due for review  | `FlashcardReview`| yes      |
 *
 * Two rules make a card worth showing, and both are easy to get wrong:
 *
 * 1. **The href deep-links into the state, not at a landing page.** A card that
 *    drops you on `/study` after promising "12 cards due" has made you do the
 *    navigation twice. Every href below lands on the deck, the book, the draft
 *    or the game itself.
 * 2. **The subtitle is state, never a date.** "2 days ago" is what a history
 *    list says; a resume card says "Day 34" or "12 cards due" or "8m left",
 *    because the question it answers is "where was I", not "when was I".
 *
 * Because of (2) the subtitle cannot be a server-rendered English string — the
 * site ships 16 locales. Each card therefore carries a small structured
 * {@link ResumeState} array that `components/feed/ResumeRail.tsx` runs through
 * `t()`, plus a pre-rendered English `subtitle` for non-React consumers (the
 * API response, logs). The rail renders `state`; nothing user-facing renders
 * `subtitle`.
 *
 * The resume MATH is not restated here: `shouldResume`, `progressRatio` and
 * `RESUME_MAX_RATIO` come from `lib/history/constants.ts` (§5), which is also
 * what the media players use. A second copy of "95% counts as finished" is how
 * the rail and the player end up disagreeing about whether you watched it.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { games } from '@/lib/games';
import { shouldResume, progressRatio, RESUME_MAX_RATIO } from '@/lib/history/constants';

/* -------------------------------------------------------------------------- */
/* Contract                                                                   */
/* -------------------------------------------------------------------------- */

export type ResumeKind = 'game' | 'read' | 'watch' | 'draft' | 'deck';

/**
 * One fact about where the user stopped, in a form the rail can translate.
 *
 * `value` is always a number so a locale can format it (Arabic-Indic digits,
 * grouping) rather than receiving a string that was already formatted in
 * `en-US`. `scheduled` carries epoch milliseconds for the same reason.
 */
export type ResumeState =
  | { at: 'level'; value: number }
  | { at: 'day'; value: number }
  | { at: 'wave'; value: number }
  | { at: 'score'; value: number }
  | { at: 'percent'; value: number }
  /** Seconds remaining. */
  | { at: 'timeLeft'; value: number }
  | { at: 'due'; value: number }
  | { at: 'words'; value: number }
  /** Epoch milliseconds. */
  | { at: 'scheduled'; value: number };

export interface ResumeCard {
  kind: ResumeKind;
  title: string;
  /** Deep link INTO the state — never a section landing page. */
  href: string;
  /** 0–1 when known. Absent means "no meaningful ratio", not "zero". */
  progress?: number;
  /** English rendering of `state`; the rail renders `state` instead. */
  subtitle: string;
  state: ResumeState[];
  /** ISO — the rail's sort key. */
  updatedAt: string;
}

/** What a caller gets without asking. Roughly one screen of a phone rail. */
export const RESUME_LIMIT_DEFAULT = 8;
/** Ceiling on a caller-supplied limit, so `?limit=100000` is not a table scan. */
export const RESUME_LIMIT_MAX = 24;

/**
 * A document under this fraction has not really been started — usually the
 * beacon that fired while the reader was still measuring its own height. It is
 * not `RESUME_MIN_SECONDS`, which is a floor on a media POSITION in seconds; a
 * `ReadPosition` has no duration to convert one into.
 */
const RESUME_MIN_FRACTION = 0.02;

/**
 * How many due-review rows one user's decks may be tallied from.
 *
 * A lapsed account can have thousands of due cards. The subtitle only needs a
 * count, and a count over 500 reads the same as "a lot", so the scan is bounded
 * rather than proportional to how long someone stopped studying.
 */
const DUE_SCAN_MAX = 500;

/* -------------------------------------------------------------------------- */
/* Ranking (pure — the tested half)                                           */
/* -------------------------------------------------------------------------- */

/**
 * Sort by recency, drop the unusable, de-duplicate, and cut to `limit`.
 *
 * De-duplication is by `(kind, href)` because two sources legitimately describe
 * the same thing — a book with both a `ReadPosition` and a `HistoryEntry`, a
 * game with a save and a watch row — and the rail showing the same cover twice
 * looks broken in a way that no individual source can detect on its own. Sorting
 * happens first so the copy that survives is the most recently touched one.
 *
 * A card with no title or no href is dropped rather than rendered with a
 * placeholder: a rail entry that cannot say what it is or go anywhere is worse
 * than one fewer entry.
 */
export function rankResumeCards(
  cards: ResumeCard[],
  limit: number = RESUME_LIMIT_DEFAULT,
): ResumeCard[] {
  const cap = Math.max(0, Math.min(Math.floor(limit) || 0, RESUME_LIMIT_MAX));
  if (cap === 0) return [];

  const sorted = [...cards].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const seen = new Set<string>();
  const out: ResumeCard[] = [];

  for (const card of sorted) {
    if (!card.title.trim() || !card.href) continue;
    const key = `${card.kind}:${card.href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(card);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Whether the rail should exist at all.
 *
 * Stated as a function so the rule has a name and a test. An empty resume rail
 * on a fresh account is worse than no rail: it is a labelled, permanently empty
 * box that tells a new user the product is broken before they have used it.
 * The component's contract is to return `null`, not an empty state.
 */
export function shouldShowResumeRail(cards: readonly ResumeCard[]): boolean {
  return cards.length > 0;
}

/** English rendering of a card's state — the `subtitle` fallback. */
export function describeResumeState(state: readonly ResumeState[]): string {
  return state
    .map((s) => {
      switch (s.at) {
        case 'level':
          return `Level ${s.value}`;
        case 'day':
          return `Day ${s.value}`;
        case 'wave':
          return `Wave ${s.value}`;
        case 'score':
          return `${s.value} points`;
        case 'percent':
          return `${s.value}% read`;
        case 'timeLeft':
          return `${Math.max(1, Math.round(s.value / 60))}m left`;
        case 'due':
          return `${s.value} due`;
        case 'words':
          return `${s.value} words`;
        case 'scheduled':
          return `Scheduled ${new Date(s.value).toISOString().slice(0, 10)}`;
      }
    })
    .join(' · ');
}

function card(
  kind: ResumeKind,
  input: { title: string; href: string; state: ResumeState[]; progress?: number; updatedAt: Date },
): ResumeCard {
  return {
    kind,
    title: input.title,
    href: input.href,
    ...(input.progress == null ? {} : { progress: input.progress }),
    state: input.state,
    subtitle: describeResumeState(input.state),
    updatedAt: input.updatedAt.toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Source: cloud game saves                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Keys a save might record its position under, most specific first.
 *
 * `saveData` is an opaque per-game blob (`lib/game-saves/cloud-save.ts`), so
 * this is a best-effort read of the conventions the shipped games already use
 * rather than a contract they have to honour. A game whose save matches nothing
 * still gets a card — with a bare title, which is the honest rendering of "you
 * have a save here and it will not say more".
 */
const SAVE_POSITION_KEYS: ReadonlyArray<{ keys: readonly string[]; at: ResumeState['at'] }> = [
  { keys: ['level', 'stage', 'chapter'], at: 'level' },
  { keys: ['day', 'date', 'turn'], at: 'day' },
  { keys: ['wave', 'round', 'floor'], at: 'wave' },
  { keys: ['score', 'coins', 'money'], at: 'score' },
];

function readNumber(source: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  }
  return null;
}

/**
 * Pull a position and (if offered) a completion ratio out of an opaque save.
 *
 * Looks one level into a `state` / `data` / `payload` wrapper because roughly
 * half the shipped saves nest their contents under one, and a resume card that
 * says nothing for those games is the difference between the rail being useful
 * and being a list of titles.
 */
function describeSave(saveData: Prisma.JsonValue): { state: ResumeState[]; progress?: number } {
  if (!saveData || typeof saveData !== 'object' || Array.isArray(saveData)) return { state: [] };

  const top = saveData as Record<string, unknown>;
  const nestedKey = ['state', 'data', 'payload'].find(
    (k) => top[k] && typeof top[k] === 'object' && !Array.isArray(top[k]),
  );
  const scope: Record<string, unknown> = nestedKey
    ? { ...(top[nestedKey] as Record<string, unknown>), ...top }
    : top;

  const state: ResumeState[] = [];
  for (const group of SAVE_POSITION_KEYS) {
    const value = readNumber(scope, group.keys);
    if (value != null && value > 0) {
      state.push({ at: group.at, value } as ResumeState);
      break; // one position per card — "Level 7 · 4200 points" is a stat sheet.
    }
  }

  const ratio = readNumber(scope, ['progress', 'completion', 'percent']);
  const progress =
    ratio == null ? undefined : Math.min(1, Math.max(0, ratio > 1 ? ratio / 100 : ratio));

  return { state, progress };
}

async function gameSaveCards(userId: string, take: number): Promise<ResumeCard[]> {
  const rows = await prisma.gameSave.findMany({
    where: { userId },
    select: { gameId: true, saveData: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take,
  });

  return rows.flatMap((row) => {
    const game = games.find((g) => g.id === row.gameId);
    // An id with no catalog entry is a retired game; linking at it 404s.
    if (!game) return [];
    const { state, progress } = describeSave(row.saveData);
    return [
      card('game', {
        title: game.title,
        // `?resume=1` is the deep link a game route can act on to boot straight
        // into the save instead of the title screen. Games that ignore it are
        // unaffected — an unknown search param is inert.
        href: `${game.href}?resume=1`,
        state,
        progress,
        updatedAt: row.updatedAt,
      }),
    ];
  });
}

/* -------------------------------------------------------------------------- */
/* Source: long-form read positions (B7)                                      */
/* -------------------------------------------------------------------------- */

/**
 * Where a `ReadPosition.kind` lives. `entityId` is the slug in every case,
 * which is what the reader routes take.
 *
 * `docs` is absent on purpose: the documentation is a separately-published
 * Sphinx site, not a route in this app, so a card for it could not deep-link.
 */
const READ_ROUTES: Record<string, (slug: string) => string> = {
  library: (slug) => `/library/${encodeURIComponent(slug)}`,
  news: (slug) => `/news/${encodeURIComponent(slug)}`,
  blog: (slug) => `/blog/${encodeURIComponent(slug)}`,
};

async function readPositionCards(userId: string, take: number): Promise<ResumeCard[]> {
  const rows = await prisma.readPosition.findMany({
    where: {
      userId,
      kind: { in: Object.keys(READ_ROUTES) },
      // `RESUME_MAX_RATIO` is the same "essentially finished" line `shouldResume`
      // applies to media; `shouldResume` itself cannot be used here because its
      // floor is a position in SECONDS and a read position has no duration.
      fraction: { gt: RESUME_MIN_FRACTION, lt: RESUME_MAX_RATIO },
    },
    select: { kind: true, entityId: true, fraction: true, anchorId: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take,
  });
  if (rows.length === 0) return [];

  const bySlug = await readTitles(rows.map((r) => ({ kind: r.kind, slug: r.entityId })));

  return rows.flatMap((row) => {
    const title = bySlug.get(`${row.kind}:${row.entityId}`);
    // Deleted or hidden since the position was written — no title, no card.
    if (!title) return [];
    const href = READ_ROUTES[row.kind](row.entityId);
    return [
      card('read', {
        title,
        // The anchor is what makes this land where the reader stopped even after
        // a reflow at a different width (`ReadPosition.anchorId`).
        href: row.anchorId ? `${href}#${encodeURIComponent(row.anchorId)}` : href,
        state: [{ at: 'percent', value: Math.round(row.fraction * 100) }],
        progress: row.fraction,
        updatedAt: row.updatedAt,
      }),
    ];
  });
}

/** Resolve display titles for a mixed batch of read positions, one query per kind. */
async function readTitles(
  refs: ReadonlyArray<{ kind: string; slug: string }>,
): Promise<Map<string, string>> {
  const slugsFor = (kind: string) => refs.filter((r) => r.kind === kind).map((r) => r.slug);
  const library = slugsFor('library');
  const news = slugsFor('news');
  const blog = slugsFor('blog');

  const [libraryRows, newsRows, blogRows] = await Promise.all([
    library.length
      ? prisma.libraryDocument.findMany({
          where: { slug: { in: library }, hidden: false },
          select: { slug: true, title: true },
        })
      : Promise.resolve([]),
    news.length
      ? prisma.newsArticle.findMany({
          where: { slug: { in: news }, status: 'PUBLISHED' },
          select: { slug: true, title: true },
        })
      : Promise.resolve([]),
    blog.length
      ? prisma.blogPost.findMany({
          where: { slug: { in: blog } },
          select: { slug: true, title: true },
        })
      : Promise.resolve([]),
  ]);

  const out = new Map<string, string>();
  for (const r of libraryRows) out.set(`library:${r.slug}`, r.title);
  for (const r of newsRows) out.set(`news:${r.slug}`, r.title);
  for (const r of blogRows) out.set(`blog:${r.slug}`, r.title);
  return out;
}

/* -------------------------------------------------------------------------- */
/* Source: media watch/listen history (§5)                                    */
/* -------------------------------------------------------------------------- */

/**
 * The media half of `HistoryEntry`, whose `position`/`duration` are seconds —
 * exactly the pair `shouldResume` and `progressRatio` model.
 *
 * ⚠ These produce no cards today, and that is a routing gap rather than a bug
 * here: RMHTube and RMHMusic are ROOM-based (`/rmhtube/$roomId`,
 * `/rmhmusic/$roomId`), so there is no per-video or per-song URL to deep-link
 * at — `lib/saves/saves.server.ts` records the same gap for saved items
 * ("types without a hydrator yet"). Rather than pointing a card at
 * `/rmhmusic/player` and letting it open on the wrong thing, the resolver
 * returns `null` and the row is skipped. When a watch route lands, this becomes
 * a one-line change and the filtering above is already right.
 */
const WATCH_TYPES = ['tube_video', 'song'] as const;

function watchHref(_entityType: string, _entityId: string): string | null {
  return null;
}

async function watchHistoryCards(userId: string, take: number): Promise<ResumeCard[]> {
  const rows = await prisma.historyEntry.findMany({
    where: { userId, entityType: { in: [...WATCH_TYPES] }, position: { not: null } },
    select: { entityType: true, entityId: true, position: true, duration: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    // Over-fetch: rows are dropped by the resume test and by href resolution, so
    // asking for exactly `take` would under-fill the rail.
    take: take * 3,
  });

  const usable = rows.filter((r) => shouldResume(r.position, r.duration));
  if (usable.length === 0) return [];

  const songIds = usable.filter((r) => r.entityType === 'song').map((r) => r.entityId);
  const songs = songIds.length
    ? await prisma.song.findMany({
        where: { id: { in: songIds } },
        select: { id: true, title: true },
      })
    : [];
  const titles = new Map(songs.map((s) => [s.id, s.title]));

  return usable.flatMap((row) => {
    const href = watchHref(row.entityType, row.entityId);
    if (!href) return [];
    const title = row.entityType === 'song' ? titles.get(row.entityId) : undefined;
    if (!title) return [];

    const ratio = progressRatio(row.position, row.duration);
    const remaining =
      row.duration && row.position ? Math.max(0, row.duration - row.position) : null;

    return [
      card('watch', {
        title,
        href,
        state: remaining == null ? [] : [{ at: 'timeLeft', value: remaining }],
        progress: ratio ?? undefined,
        updatedAt: row.updatedAt,
      }),
    ];
  });
}

/* -------------------------------------------------------------------------- */
/* Source: unpublished drafts                                                 */
/* -------------------------------------------------------------------------- */

const DRAFT_TITLE_MAX = 70;

async function draftCards(userId: string, take: number): Promise<ResumeCard[]> {
  const rows = await prisma.scheduledPost.findMany({
    where: { userId, publishedId: null },
    select: { id: true, content: true, scheduledAt: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take,
  });

  return rows.flatMap((row) => {
    const text = row.content.trim().replace(/\s+/g, ' ');
    // A media-only draft has no text to title itself with, and inventing one
    // ("Untitled") would be an untranslated string minted on the server. It is
    // dropped instead; `/drafts` still lists it.
    if (!text) return [];

    const words = text.split(' ').filter(Boolean).length;
    const state: ResumeState[] = [{ at: 'words', value: words }];
    if (row.scheduledAt) state.push({ at: 'scheduled', value: row.scheduledAt.getTime() });

    return [
      card('draft', {
        title: text.length > DRAFT_TITLE_MAX ? `${text.slice(0, DRAFT_TITLE_MAX)}…` : text,
        // `/drafts` is this draft's only address — there is no `/drafts/$id`
        // route — so the id rides as a search param the column can focus on.
        href: `/drafts?draft=${encodeURIComponent(row.id)}`,
        state,
        updatedAt: row.updatedAt,
      }),
    ];
  });
}

/* -------------------------------------------------------------------------- */
/* Source: flashcard decks with cards due                                     */
/* -------------------------------------------------------------------------- */

async function dueDeckCards(userId: string, take: number): Promise<ResumeCard[]> {
  const due = await prisma.flashcardReview.findMany({
    where: { userId, dueAt: { lte: new Date() } },
    select: { updatedAt: true, card: { select: { deckId: true } } },
    orderBy: { updatedAt: 'desc' },
    take: DUE_SCAN_MAX,
  });
  if (due.length === 0) return [];

  const tally = new Map<string, { count: number; updatedAt: Date }>();
  for (const row of due) {
    const deckId = row.card.deckId;
    const entry = tally.get(deckId);
    if (entry) {
      entry.count++;
      if (row.updatedAt > entry.updatedAt) entry.updatedAt = row.updatedAt;
    } else {
      tally.set(deckId, { count: 1, updatedAt: row.updatedAt });
    }
  }

  const decks = await prisma.flashcardDeck.findMany({
    where: { id: { in: [...tally.keys()] } },
    select: { id: true, title: true, cardCount: true },
  });

  return decks
    .flatMap((deck) => {
      const entry = tally.get(deck.id);
      if (!entry) return [];
      // Progress is how much of the deck is currently in good standing, so a
      // deck you have kept up with reads as nearly full and a lapsed one as
      // nearly empty — which is the shape of the work left, not of the work done.
      const progress =
        deck.cardCount > 0
          ? Math.min(1, Math.max(0, (deck.cardCount - entry.count) / deck.cardCount))
          : undefined;
      return [
        card('deck', {
          title: deck.title,
          href: `/study/${encodeURIComponent(deck.id)}`,
          state: [{ at: 'due', value: entry.count }],
          progress,
          updatedAt: entry.updatedAt,
        }),
      ];
    })
    .slice(0, take);
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

/** Run one source, and let it fail alone. */
async function source(label: string, run: () => Promise<ResumeCard[]>): Promise<ResumeCard[]> {
  try {
    return await run();
  } catch (error) {
    // A rail with four of its five sources is still a rail. One table being
    // slow or missing a migration must not blank the home feed's top card.
    console.error(`[resume] ${label} source failed:`, (error as Error)?.message);
    return [];
  }
}

/**
 * Everything this user has left unfinished, most recent first.
 *
 * Each source is asked for `limit` (not `limit × sources`) because the ranking
 * cuts to `limit` anyway — over-fetching every source would multiply the query
 * cost of a rail that shows eight cards.
 */
export async function resumeCards(
  userId: string,
  limit: number = RESUME_LIMIT_DEFAULT,
): Promise<ResumeCard[]> {
  const take = Math.max(1, Math.min(Math.floor(limit) || RESUME_LIMIT_DEFAULT, RESUME_LIMIT_MAX));

  const groups = await Promise.all([
    source('game-saves', () => gameSaveCards(userId, take)),
    source('read-positions', () => readPositionCards(userId, take)),
    source('watch-history', () => watchHistoryCards(userId, take)),
    source('drafts', () => draftCards(userId, take)),
    source('due-decks', () => dueDeckCards(userId, take)),
  ]);

  return rankResumeCards(groups.flat(), take);
}
