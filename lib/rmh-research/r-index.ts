/**
 * The r-index — RMH Research's measure of a body of work.
 *
 * It answers the question an h-index answers ("how much of this author's work
 * mattered, in one whole number") and is cut the same way, but it counts
 * RESONANCE rather than raw citations. A citation resonates when it is:
 *
 *   1. INDEPENDENT — the citing paper shares no author with the cited paper.
 *      Citing yourself, or being cited by your own co-author, says nothing
 *      about whether anyone else used the result.
 *   2. LIVE — the citing paper has itself been independently cited at least
 *      once. A citation from work that nobody built on is a dead end: the idea
 *      stopped there. Papers from the last `GRACE_YEARS` years of the archive
 *      have not had time to be built on, so their citations count as live.
 *   3. CARRIED — a resonant citation from another field counts twice. A result
 *      that leaves its own field has been checked by people with no stake in
 *      it, and reaching across fields is what this institute is for.
 *
 * A paper's resonance is the sum of its resonant citations (1 each, 2 when
 * carried). An author has r-index r when r of their papers each have a
 * resonance of at least r — the h-index cut, applied to resonance.
 *
 * What that buys over h: self-citation and citation rings add nothing (rule 1),
 * a pile of citations from unread papers adds nothing (rule 2), and breadth is
 * worth more than volume inside one field (rule 3). r can be lower or higher
 * than h for the same author, which is the point of publishing both.
 *
 * Pure functions over a list of papers; no dates, no I/O. The catalogue's own
 * numbers are computed once in `catalog.ts`.
 */
import type { Paper } from './types';

/** Papers this recent (in archive years) cannot have been built on yet. */
export const GRACE_YEARS = 2;
/** What a resonant citation from another field is worth. */
export const CARRIED_WEIGHT = 2;

export interface Resonance {
  /** Every citation from inside the archive (what an h-index counts). */
  raw: number;
  /** Citations from papers that share no author with this one. */
  independent: number;
  /** Independent citations whose citing paper is itself live. */
  live: number;
  /** Live citations that come from another field. */
  carried: number;
  /** `live + carried * (CARRIED_WEIGHT - 1)`: the number the r-index cuts on. */
  score: number;
}

export interface CitationAnalysis {
  /** The latest publication year in the list. */
  horizon: number;
  /** For each paper id, the papers that cite it. */
  citedBy: ReadonlyMap<string, readonly Paper[]>;
  /** For each paper id, its resonance breakdown. */
  resonance: ReadonlyMap<string, Resonance>;
}

const EMPTY: Resonance = { raw: 0, independent: 0, live: 0, carried: 0, score: 0 };

/** Whether two papers share no author. A paper with no named authors shares none. */
export function isIndependent(citing: Paper, cited: Paper): boolean {
  if (citing.id === cited.id) return false;
  for (const a of citing.authors) if (cited.authors.includes(a)) return false;
  return true;
}

/**
 * The h-index cut: the largest k such that k of the values are at least k.
 * `indexCut([9, 7, 3, 3, 1])` is 3.
 */
export function indexCut(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => b - a);
  let k = 0;
  while (k < sorted.length && (sorted[k] ?? 0) >= k + 1) k++;
  return k;
}

/** Build the citation graph and every paper's resonance. Unknown reference ids are ignored. */
export function analyseCitations(papers: readonly Paper[]): CitationAnalysis {
  const byId = new Map(papers.map((p) => [p.id, p]));
  const citedBy = new Map<string, Paper[]>(papers.map((p) => [p.id, []]));
  let horizon = 0;
  for (const p of papers) {
    if (p.year > horizon) horizon = p.year;
    for (const ref of new Set(p.refs)) {
      if (ref !== p.id && byId.has(ref)) citedBy.get(ref)?.push(p);
    }
  }

  // Pass 1: which papers have been independently cited at all.
  const built = new Set<string>();
  for (const p of papers) {
    if ((citedBy.get(p.id) ?? []).some((q) => isIndependent(q, p))) built.add(p.id);
  }
  const isLive = (q: Paper) => built.has(q.id) || q.year > horizon - GRACE_YEARS;

  // Pass 2: the breakdown.
  const resonance = new Map<string, Resonance>();
  for (const p of papers) {
    const citing = citedBy.get(p.id) ?? [];
    let independent = 0;
    let live = 0;
    let carried = 0;
    for (const q of citing) {
      if (!isIndependent(q, p)) continue;
      independent++;
      if (!isLive(q)) continue;
      live++;
      if (q.field !== p.field) carried++;
    }
    resonance.set(p.id, {
      raw: citing.length,
      independent,
      live,
      carried,
      score: live + carried * (CARRIED_WEIGHT - 1),
    });
  }
  return { horizon, citedBy, resonance };
}

/**
 * What one citation is worth under the rules above, from the cited paper's side:
 * `self` (shares an author: rule 1 removes it), `dead` (independent, but the
 * citing paper was never built on and is older than the grace window: rule 2
 * removes it), `live` (counts once) or `carried` (live and from another field:
 * counts `CARRIED_WEIGHT`). Mirrors `analyseCitations`, one citing paper at a
 * time, for pages that draw the sifting.
 */
export type CitationKind = 'self' | 'dead' | 'live' | 'carried';

export function classifyCitation(citing: Paper, cited: Paper, analysis: CitationAnalysis): CitationKind {
  if (!isIndependent(citing, cited)) return 'self';
  const built = (analysis.citedBy.get(citing.id) ?? []).some((q) => isIndependent(q, citing));
  if (!built && citing.year <= analysis.horizon - GRACE_YEARS) return 'dead';
  return citing.field !== cited.field ? 'carried' : 'live';
}

export interface BodyOfWork {
  /** Number of papers. */
  papers: number;
  /** Total raw citations. */
  citations: number;
  /** Total resonance. */
  resonance: number;
  /** The h-index: h papers with at least h raw citations each. */
  h: number;
  /** The r-index: r papers with a resonance of at least r each. */
  r: number;
}

/** The metrics of any set of papers (an author's, a lab's, a field's). */
export function measure(papers: readonly Paper[], analysis: CitationAnalysis): BodyOfWork {
  const rows = papers.map((p) => analysis.resonance.get(p.id) ?? EMPTY);
  return {
    papers: papers.length,
    citations: rows.reduce((n, x) => n + x.raw, 0),
    resonance: rows.reduce((n, x) => n + x.score, 0),
    h: indexCut(rows.map((x) => x.raw)),
    r: indexCut(rows.map((x) => x.score)),
  };
}
