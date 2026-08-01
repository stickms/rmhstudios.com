/**
 * Universal search — the orchestrator behind `/api/search`.
 *
 * Runs every corpus the site has (people, posts, builds, blog, news, library,
 * plus the static game/app/page catalog) against one query, scores them all on
 * the shared 0..1 scale from `lib/search/score.ts`, and returns both a ranked
 * cross-corpus "Top" list and per-kind groups.
 *
 * Shape of a request:
 *
 *   parse operators → fuzzy terms → fan out across corpora (parallel)
 *     → rank → if the best hit is weak *and* assist is allowed:
 *         expand the query with the model and run one more narrow pass
 *     → merge, dedupe, respond
 *
 * The expansion pass is the only part that can be slow, and it is skipped
 * entirely whenever the lexical pass already found something decent.
 */

import { prisma } from '@/lib/prisma.server';
import { getHiddenAuthorIds } from '@/lib/moderation.server';
import { parseQuery } from './parse';
import { fuzzyTerms, type FuzzyTerms } from './db.server';
import { searchPeopleScored, personToHit, type ScoredPerson } from './people.server';
import { searchPostsScored, postToHit, resolveCommunityId, type ScoredPost } from './posts.server';
import { searchDocs, type DocCorpusName } from './docs.server';
import { searchCatalog } from './catalog';
import { expandQuery, isExpansionAvailable } from './expand.server';
import { CONFIDENCE, confidenceOf, scoreRecord } from './score';
import { normalizeQuery } from './normalize';
import {
  SEARCH_TAB_KINDS,
  type LegacyDoc,
  type SearchHit,
  type SearchKind,
  type SearchResponse,
  type SearchTab,
} from './types';

/** Results per kind on the "Top" tab vs. a focused tab. */
const TOP_PER_KIND = 6;
const FOCUSED_PER_KIND = 25;
/** Ceiling on the merged "Top" list. */
const TOP_TOTAL = 24;
/**
 * Expanded terms are an indirect match — the user typed something else — so
 * their hits are discounted and can never outrank a direct hit of equal score.
 */
const EXPANSION_PENALTY = 0.82;
/** Sentinel author/community id for an operator that resolved to nothing. */
const NO_MATCH = '__none__';

export interface UniversalSearchInput {
  query: string;
  tab?: SearchTab;
  viewerId: string;
  /** Signed-out visitors don't see auth-gated destinations. */
  signedIn?: boolean;
  /**
   * Permit the model-assisted retry when the lexical pass is weak. Callers on a
   * latency budget (typeahead, quick panel) should leave this off.
   */
  assist?: boolean;
}

interface PassResult {
  people: ScoredPerson[];
  posts: ScoredPost[];
  docs: Partial<Record<SearchKind, SearchHit[]>>;
  catalog: Partial<Record<SearchKind, SearchHit[]>>;
  degraded: SearchKind[];
}

const DOC_KIND: Record<DocCorpusName, SearchKind> = {
  blog: 'blog',
  news: 'news',
  build: 'build',
  library: 'library',
};

/** Await a corpus, recording rather than propagating its failure. */
async function guard<T>(
  kind: SearchKind,
  degraded: SearchKind[],
  fallback: T,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`search corpus "${kind}" failed:`, error);
    degraded.push(kind);
    return fallback;
  }
}

/** One full fan-out across every requested corpus. */
async function runPass(
  terms: FuzzyTerms,
  kinds: Set<SearchKind>,
  perKind: number,
  ctx: {
    hiddenAuthorIds: string[];
    authorId?: string | null;
    communityId?: string | null;
    before?: string;
    after?: string;
    hasMedia?: boolean;
    signedIn: boolean;
  },
): Promise<PassResult> {
  const degraded: SearchKind[] = [];
  const hasPostFilters = Boolean(
    ctx.authorId || ctx.communityId || ctx.before || ctx.after || ctx.hasMedia,
  );
  // Without free text there is nothing to match; only posts can still be
  // meaningfully answered, via their operators (`from:@ada has:media`).
  if (!terms.q && !hasPostFilters) {
    return { people: [], posts: [], docs: {}, catalog: {}, degraded };
  }

  const peoplePromise =
    kinds.has('person') && terms.q
      ? guard<ScoredPerson[]>('person', degraded, [], () =>
          searchPeopleScored(terms, { limit: perKind }),
        )
      : Promise.resolve<ScoredPerson[]>([]);

  const postsPromise = kinds.has('post')
    ? guard<ScoredPost[]>('post', degraded, [], () =>
        searchPostsScored(terms, {
          limit: perKind,
          hiddenAuthorIds: ctx.hiddenAuthorIds,
          authorId: ctx.authorId,
          communityId: ctx.communityId,
          before: ctx.before,
          after: ctx.after,
          hasMedia: ctx.hasMedia,
        }),
      )
    : Promise.resolve<ScoredPost[]>([]);

  const docEntries = (Object.keys(DOC_KIND) as DocCorpusName[])
    .filter((name) => kinds.has(DOC_KIND[name]) && terms.q)
    .map(
      async (name) =>
        [
          DOC_KIND[name],
          await guard<SearchHit[]>(DOC_KIND[name], degraded, [], () =>
            searchDocs(name, terms, { limit: perKind }),
          ),
        ] as const,
    );

  const [people, posts, docPairs] = await Promise.all([
    peoplePromise,
    postsPromise,
    Promise.all(docEntries),
  ]);

  const docs: Partial<Record<SearchKind, SearchHit[]>> = {};
  for (const [kind, hits] of docPairs) if (hits.length) docs[kind] = hits;

  // The static catalog is a synchronous in-memory scan — no await, no latency.
  const catalog: Partial<Record<SearchKind, SearchHit[]>> = {};
  if (terms.q) {
    const scanned = searchCatalog(terms.q, { signedIn: ctx.signedIn, limit: perKind });
    for (const kind of ['game', 'app', 'page'] as const) {
      if (kinds.has(kind) && scanned[kind].length) catalog[kind] = scanned[kind];
    }
  }

  return { people, posts, docs, catalog, degraded };
}

/** Collapse a pass into `kind → hits`. */
function passToGroups(pass: PassResult): Partial<Record<SearchKind, SearchHit[]>> {
  const groups: Partial<Record<SearchKind, SearchHit[]>> = { ...pass.docs, ...pass.catalog };
  if (pass.people.length) groups.person = pass.people.map(personToHit);
  if (pass.posts.length) groups.post = pass.posts.map(postToHit);
  return groups;
}

/**
 * Merge the expansion pass into the direct pass. A hit found both ways keeps its
 * direct (higher) score; hits only the expansion found are discounted.
 */
function mergeGroups(
  base: Partial<Record<SearchKind, SearchHit[]>>,
  extra: Partial<Record<SearchKind, SearchHit[]>>,
  perKind: number,
): Partial<Record<SearchKind, SearchHit[]>> {
  const out: Partial<Record<SearchKind, SearchHit[]>> = {};
  const kinds = new Set([...Object.keys(base), ...Object.keys(extra)] as SearchKind[]);
  for (const kind of kinds) {
    const byKey = new Map<string, SearchHit>();
    for (const hit of base[kind] ?? []) byKey.set(hit.key, hit);
    for (const hit of extra[kind] ?? []) {
      const discounted = hit.score * EXPANSION_PENALTY;
      const existing = byKey.get(hit.key);
      if (existing && existing.score >= discounted) continue;
      byKey.set(hit.key, {
        ...hit,
        score: discounted,
        confidence: confidenceOf(discounted),
        meta: { ...hit.meta, viaExpansion: true },
      });
    }
    const merged = [...byKey.values()].sort((a, b) => b.score - a.score).slice(0, perKind);
    if (merged.length) out[kind] = merged;
  }
  return out;
}

/**
 * Build the cross-corpus "Top" list: best-scoring hits overall, then one
 * guaranteed slot for any kind that had a confident hit but got crowded out.
 * Without that guarantee a query matching 24 posts would hide the game of the
 * same name entirely.
 */
function buildTop(groups: Partial<Record<SearchKind, SearchHit[]>>): SearchHit[] {
  const all = Object.values(groups)
    .flat()
    .sort((a, b) => b.score - a.score);
  const top = all.slice(0, TOP_TOTAL);
  const present = new Set(top.map((h) => h.kind));
  for (const [kind, hits] of Object.entries(groups) as [SearchKind, SearchHit[]][]) {
    if (present.has(kind)) continue;
    const best = hits[0];
    if (best && best.score >= CONFIDENCE.medium) top.push(best);
  }
  return top.sort((a, b) => b.score - a.score);
}

/**
 * A free "did you mean" derived from the static catalog: the closest game, app
 * or page title even when it scored below the match floor. Costs nothing and
 * covers the most common miss (a mistyped game name).
 */
function catalogSuggestion(normalized: string, signedIn: boolean): string | undefined {
  if (normalized.length < 3) return undefined;
  const scanned = searchCatalog(normalized, { signedIn, limit: 1, floor: 0.22 });
  const best = [scanned.game[0], scanned.app[0], scanned.page[0]]
    .filter((h): h is SearchHit => Boolean(h))
    .sort((a, b) => b.score - a.score)[0];
  return best && best.score < CONFIDENCE.high ? best.title : undefined;
}

function toLegacyDoc(hit: SearchHit): LegacyDoc {
  return {
    slug: hit.id,
    title: hit.title,
    description: hit.snippet ?? '',
    score: hit.score,
    confidence: hit.confidence,
  };
}

/** Run a full universal search. Never throws for a single failing corpus. */
export async function universalSearch(input: UniversalSearchInput): Promise<SearchResponse> {
  const tab: SearchTab = input.tab ?? 'top';
  const signedIn = input.signedIn !== false;
  const kinds = new Set<SearchKind>(SEARCH_TAB_KINDS[tab]);
  const perKind = tab === 'top' ? TOP_PER_KIND : FOCUSED_PER_KIND;

  // Operators refine posts; the leftover free text drives every corpus.
  const parsed = parseQuery(input.query);
  const text = parsed.text || (parsed.operatorCount > 0 ? '' : input.query);
  const terms = fuzzyTerms(text);

  const wantsPosts = kinds.has('post');
  const [hiddenAuthorIds, authorId, communityId] = await Promise.all([
    wantsPosts ? getHiddenAuthorIds(input.viewerId).catch(() => []) : Promise.resolve([]),
    parsed.from
      ? prisma.user
          .findFirst({ where: { handle: parsed.from }, select: { id: true } })
          .then((u) => u?.id ?? NO_MATCH)
          .catch(() => NO_MATCH)
      : Promise.resolve(null),
    parsed.inCommunity
      ? resolveCommunityId(parsed.inCommunity)
          .then((id) => id ?? NO_MATCH)
          .catch(() => NO_MATCH)
      : Promise.resolve(null),
  ]);

  const ctx = {
    hiddenAuthorIds,
    authorId,
    communityId,
    before: parsed.before,
    after: parsed.after,
    hasMedia: parsed.hasMedia,
    signedIn,
  };

  const direct = await runPass(terms, kinds, perKind, ctx);
  let groups = passToGroups(direct);
  const degraded = [...direct.degraded];

  const scoreOf = (g: typeof groups) =>
    Object.values(g)
      .flat()
      .reduce((max, h) => (h.score > max ? h.score : max), 0);
  let topScore = scoreOf(groups);

  // The assist pass: only when the query found nothing convincing.
  let expandedWith: string[] | undefined;
  let suggestion = catalogSuggestion(terms.q, signedIn);

  if (input.assist && terms.q && topScore < CONFIDENCE.medium && isExpansionAvailable()) {
    const expansion = await expandQuery(text);
    const retryTerms = [expansion.correction, ...expansion.terms].filter(Boolean).slice(0, 2);
    if (expansion.correction) suggestion = expansion.correction;

    if (retryTerms.length) {
      const passes = await Promise.all(
        retryTerms.map((term) => runPass(fuzzyTerms(term), kinds, perKind, ctx)),
      );
      for (const pass of passes) {
        groups = mergeGroups(groups, passToGroups(pass), perKind);
        degraded.push(...pass.degraded);
      }
      const after = scoreOf(groups);
      if (after > topScore) expandedWith = retryTerms;
      topScore = after;
    }
  }

  const top = buildTop(groups);
  const total = Object.values(groups).reduce((n, hits) => n + hits.length, 0);
  // A "did you mean" is noise once there are strong results to show.
  if (topScore >= CONFIDENCE.high) suggestion = undefined;

  const peopleHits = groups.person ?? [];
  const postHits = groups.post ?? [];

  return {
    // Legacy keys keep their original shapes — the command palette and the
    // top-bar quick panel read them directly, and client bundles outlive a deploy.
    people: peopleHits.map((h) => {
      const person = direct.people.find((p) => p.user.id === h.id);
      return person
        ? { ...person.user, score: h.score, confidence: h.confidence }
        : {
            id: h.id,
            name: h.title,
            image: h.image ?? null,
            handle: h.subtitle?.replace(/^@/, '') ?? null,
            score: h.score,
            confidence: h.confidence,
          };
    }),
    posts: postHits
      .map((h) => direct.posts.find((p) => p.post.id === h.id)?.post)
      .filter((p): p is NonNullable<typeof p> => Boolean(p)),
    builds: (groups.build ?? []).map(toLegacyDoc),
    blog: (groups.blog ?? []).map(toLegacyDoc),
    top,
    groups,
    meta: {
      normalized: terms.q,
      topScore,
      confidence: confidenceOf(topScore),
      total,
      ...(expandedWith ? { expandedWith } : {}),
      ...(suggestion ? { suggestion } : {}),
      ...(degraded.length ? { degraded: [...new Set(degraded)] } : {}),
    },
  };
}

/**
 * Cheap relevance check used by callers that already hold candidate text (the
 * saved-search alert sweep). Exported so "does this new row match that saved
 * query?" uses the identical scorer the live search does.
 */
export function matchesQuery(rawQuery: string, fields: string[]): boolean {
  const normalized = normalizeQuery(rawQuery);
  if (!normalized) return false;
  const { score } = scoreRecord(
    normalized,
    fields.map((value, i) => ({ value, weight: i === 0 ? 1 : 0.6 })),
  );
  return score >= CONFIDENCE.medium;
}
