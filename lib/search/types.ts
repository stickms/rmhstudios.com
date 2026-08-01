/**
 * Universal search — the wire contract shared by the server, `/api/search`, and
 * every UI that renders results. Client-safe.
 */

import type { Confidence, MatchReason } from './score';

/** Every corpus the site can search. Order here is the tie-break order in "Top". */
export const SEARCH_KINDS = [
  'person',
  'post',
  'build',
  'blog',
  'news',
  'library',
  'game',
  'app',
  'page',
] as const;

export type SearchKind = (typeof SEARCH_KINDS)[number];

/** The tab ids the search page exposes, mapped to the kinds each one includes. */
export const SEARCH_TAB_KINDS = {
  top: SEARCH_KINDS,
  people: ['person'],
  posts: ['post'],
  builds: ['build'],
  blog: ['blog', 'news'],
  library: ['library'],
  places: ['game', 'app', 'page'],
} as const satisfies Record<string, readonly SearchKind[]>;

export type SearchTab = keyof typeof SEARCH_TAB_KINDS;

export const SEARCH_TABS = Object.keys(SEARCH_TAB_KINDS) as SearchTab[];

export function isSearchTab(value: unknown): value is SearchTab {
  return typeof value === 'string' && (SEARCH_TABS as string[]).includes(value);
}

/**
 * One result, in the shape the UI renders. Corpus-specific extras live in
 * `meta` so the renderer stays generic.
 */
export interface SearchHit {
  /** Unique within a response: `${kind}:${sourceId}`. */
  key: string;
  id: string;
  kind: SearchKind;
  title: string;
  /** Secondary line — a handle, an author, a category. */
  subtitle?: string;
  /** Body preview. */
  snippet?: string;
  href: string;
  image?: string | null;
  /** 0..1 relevance on the shared scale. */
  score: number;
  confidence: Confidence;
  /** Which signal produced the score — surfaced in dev, useful in bug reports. */
  reason: MatchReason;
  meta?: Record<string, unknown>;
}

export interface SearchMeta {
  /** The query after normalisation — what was actually matched against. */
  normalized: string;
  /** Best score in the whole response. */
  topScore: number;
  confidence: Confidence;
  /** Total hits across every corpus (before per-tab truncation). */
  total: number;
  /** Extra terms the model contributed, if the expansion pass ran. */
  expandedWith?: string[];
  /** A better query to try, shown as "did you mean". */
  suggestion?: string;
  /** Corpora that failed so the UI can say results are partial. */
  degraded?: SearchKind[];
}

/**
 * The `/api/search` payload.
 *
 * `people`/`posts`/`builds`/`blog` keep the shapes they had before universal
 * search landed — the command palette and the top-bar quick panel read them
 * directly, and a deploy is not atomic across cached client bundles.
 */
export interface SearchResponse {
  people: LegacyPerson[];
  posts: LegacyPost[];
  builds: LegacyDoc[];
  blog: LegacyDoc[];
  /** Ranked mix across every corpus — what the "Top" tab renders. */
  top: SearchHit[];
  /** All hits, grouped by kind, each already sorted by score. */
  groups: Partial<Record<SearchKind, SearchHit[]>>;
  meta: SearchMeta;
}

/** Structurally a `ResolvedUser` (lib/user-display) plus the search score. */
export interface LegacyPerson {
  id: string;
  name: string | null;
  image: string | null;
  username?: string | null;
  handle: string | null;
  isVerified?: boolean;
  isAdmin?: boolean;
  cosmetics?: unknown;
  score?: number;
  confidence?: Confidence;
}

export interface LegacyPost {
  id: string;
  content: string;
  createdAt: string;
  likeCount: number;
  user: LegacyPerson;
  score?: number;
  confidence?: Confidence;
}

export interface LegacyDoc {
  slug: string;
  title: string;
  description: string;
  score?: number;
  confidence?: Confidence;
}
