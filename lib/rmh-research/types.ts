/**
 * RMH Research — the data model of the archive.
 *
 * Client-safe plain data. The catalogue is curated and checked in
 * (`data/`), not a database: a paper is a row in a TypeScript file, and every
 * derived number (citations, the h-index, the r-index) is computed from the
 * reference lists by `r-index.ts` and `catalog.ts`.
 *
 * The archive is written in the in-universe register of the other RMH arms
 * (RMH Capital, RMH PMC): the papers, authors, labs and venues are fiction, and
 * no real person is named in it (docs/people.md).
 */

export const FIELD_IDS = [
  'mathematics',
  'physics',
  'chemistry',
  'biology',
  'medicine',
  'neuroscience',
  'psychology',
  'earth',
  'astronomy',
  'computer-science',
  'engineering',
  'social-sciences',
] as const;

export type FieldId = (typeof FIELD_IDS)[number];

/** The four divisions the twelve fields are grouped under on the site. */
export type DivisionId = 'formal' | 'physical' | 'life' | 'human';

export interface Field {
  id: FieldId;
  /** Short mono code shown beside the name, e.g. `MATH`. */
  code: string;
  /** English name. The UI runs its own label through `t()`. */
  name: string;
  division: DivisionId;
}

export interface Author {
  /** Stable kebab-case id, and the last segment of the author's URL. */
  id: string;
  /** Display name, written given name first. Fictional. */
  name: string;
  /** Home field. An author may publish outside it. */
  field: FieldId;
  /** Position, e.g. `Principal Investigator`. */
  role: string;
  /** The lab or group inside RMH Research. */
  lab: string;
  /** Year the author joined RMH Research. */
  since: number;
}

export type PaperKind = 'paper' | 'report';

export interface Paper {
  /** Stable kebab-case id, and the last segment of the paper's URL. */
  id: string;
  title: string;
  /** Author ids, in byline order. Empty for an institutional report (see `byline`). */
  authors: readonly string[];
  /** Who signs a paper that has no named authors, e.g. an office. */
  byline?: string;
  year: number;
  field: FieldId;
  /** Journal, proceedings or series the paper appeared in. Fictional. */
  venue: string;
  abstract: string;
  keywords: readonly string[];
  /** Ids of the archive papers this one cites. Each must be the same year or earlier. */
  refs: readonly string[];
  /** `report` marks a long-form report that is its own page on the site. */
  kind?: PaperKind;
  /** For a report: the site path of the full page. */
  href?: string;
}
