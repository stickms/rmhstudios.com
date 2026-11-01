/**
 * Universal search — query parser (§18 of
 * docs/plans/2026-07-20-parity-qol-customization-design.md).
 *
 * Splits a raw query into free text + a bounded set of operators
 * (`from:@user`, `in:community`, `has:media`, `type:`, `before:`/`after:`). Unknown
 * operators degrade to plain text (never error). Client-safe + unit-tested; the
 * grammar mirrored here is shown to users in the cheatsheet.
 */
import { SEARCH_KINDS, type SearchKind } from './types';

/** What `type:` accepts → the corpus kinds it selects (singular, plural, and `places`). */
const TYPE_ALIASES: Record<string, readonly SearchKind[]> = {
  person: ['person'],
  people: ['person'],
  user: ['person'],
  users: ['person'],
  post: ['post'],
  posts: ['post'],
  build: ['build'],
  builds: ['build'],
  blog: ['blog'],
  news: ['news'],
  library: ['library'],
  game: ['game'],
  games: ['game'],
  app: ['app'],
  apps: ['app'],
  page: ['page'],
  pages: ['page'],
  place: ['game', 'app', 'page'],
  places: ['game', 'app', 'page'],
};

export interface ParsedQuery {
  text: string;
  from?: string; // handle (no '@')
  inCommunity?: string;
  hasMedia?: boolean;
  /** Corpus kinds named by `type:` operators (union of all of them). */
  types?: SearchKind[];
  before?: string; // YYYY-MM-DD
  after?: string; // YYYY-MM-DD
  /** How many operators were recognized (capped). */
  operatorCount: number;
}

const MAX_OPERATORS = 4;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function tokenize(raw: string): string[] {
  // Split on whitespace but keep quoted phrases together.
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) out.push(m[1] ?? m[2]);
  return out;
}

export function parseQuery(raw: string): ParsedQuery {
  const result: ParsedQuery = { text: '', operatorCount: 0 };
  const textParts: string[] = [];

  for (const token of tokenize(raw.trim())) {
    const colon = token.indexOf(':');
    const key = colon > 0 ? token.slice(0, colon).toLowerCase() : '';
    const value = colon > 0 ? token.slice(colon + 1) : '';
    const canAddOp = result.operatorCount < MAX_OPERATORS;

    if (canAddOp && key === 'from' && value) {
      result.from = value.replace(/^@/, '').toLowerCase();
      result.operatorCount++;
    } else if (canAddOp && key === 'in' && value) {
      result.inCommunity = value.toLowerCase();
      result.operatorCount++;
    } else if (canAddOp && key === 'has' && value.toLowerCase() === 'media') {
      result.hasMedia = true;
      result.operatorCount++;
    } else if (canAddOp && key === 'type' && TYPE_ALIASES[value.toLowerCase()]) {
      const merged = new Set<SearchKind>(result.types ?? []);
      for (const k of TYPE_ALIASES[value.toLowerCase()]!) merged.add(k);
      result.types = SEARCH_KINDS.filter((k) => merged.has(k));
      result.operatorCount++;
    } else if (canAddOp && key === 'before' && DATE_RE.test(value)) {
      result.before = value;
      result.operatorCount++;
    } else if (canAddOp && key === 'after' && DATE_RE.test(value)) {
      result.after = value;
      result.operatorCount++;
    } else {
      // Unknown operator or plain word → free text.
      textParts.push(token);
    }
  }

  result.text = textParts.join(' ').trim();
  return result;
}

/**
 * The corpus kinds a search should cover. With no `type:` operator that is the
 * tab's kinds; with one, the operator wins over the tab (typing `type:post` while
 * on the People tab means posts), still limited to what `allowed` permits (so an
 * anonymous visitor cannot reach signed-in corpora by naming them).
 */
export function resolveSearchKinds(
  tabKinds: readonly SearchKind[],
  types: readonly SearchKind[] | undefined,
  allowed: (kind: SearchKind) => boolean,
): SearchKind[] {
  const base = types && types.length > 0 ? types : tabKinds;
  return base.filter(allowed);
}
