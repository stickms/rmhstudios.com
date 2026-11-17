/**
 * The `head()` data of the paper and author pages, computed on the server.
 *
 * A route module's `loader` and `head` stay in the client entry, so a route
 * that imported the catalogue to write its own title put the whole archive on
 * every page's critical path. These run inside each route's server function
 * instead (`*.server.ts` is stubbed out of the client bundle), and the route
 * reads the result as `loaderData`.
 */
import { authorMetrics, authorsOf, getAuthor, getPaper } from './catalog';
import { authorLine } from './cite';
import { getField } from './fields';

export interface ResearchPageMeta {
  title: string;
  description: string;
  /** For a paper's JSON-LD. */
  year?: number;
  section: string;
}

export function paperMeta(id: string): ResearchPageMeta | null {
  const paper = getPaper(id);
  if (!paper) return null;
  return {
    title: paper.title,
    description: `${authorLine(paper, authorsOf(paper))} (${paper.year}). ${paper.abstract}`.slice(0, 300),
    year: paper.year,
    section: getField(paper.field).name,
  };
}

export function authorMeta(id: string): ResearchPageMeta | null {
  const author = getAuthor(id);
  if (!author) return null;
  const m = authorMetrics(author.id);
  const field = getField(author.field).name;
  return {
    title: author.name,
    description: `${author.name}, ${author.role}, ${author.lab} (${field}). r-index ${m?.r ?? 0}, h-index ${m?.h ?? 0}, ${m?.papers ?? 0} papers in the RMH Research archive.`,
    section: field,
  };
}
