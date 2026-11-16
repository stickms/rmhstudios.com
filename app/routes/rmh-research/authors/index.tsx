import { createFileRoute } from '@tanstack/react-router';
import AuthorsPage from '@/components/rmh-research/AuthorsPage';
import { AUTHOR_SORTS, type AuthorSort } from '@/lib/rmh-research/catalog';
import { isFieldId } from '@/lib/rmh-research/fields';
import type { FieldId } from '@/lib/rmh-research/types';
import { buildMeta, buildCanonical } from '@/lib/seo';

/** The ranking's URL state: a field filter and a sort, both optional (r-index, all fields by default). */
export interface AuthorsSearch {
  field?: FieldId;
  sort?: AuthorSort;
}

const PATH = '/rmh-research/authors';
const TITLE = 'Authors — RMH Research';
const DESC =
  'Every author in the RMH Research archive, ranked by r-index, with their h-index, citations and fields.';

export const Route = createFileRoute('/rmh-research/authors/')({
  validateSearch: (search: Record<string, unknown>): AuthorsSearch => {
    const out: AuthorsSearch = {};
    if (isFieldId(search.field)) out.field = search.field;
    if (typeof search.sort === 'string' && (AUTHOR_SORTS as readonly string[]).includes(search.sort) && search.sort !== 'r') out.sort = search.sort as AuthorSort;
    return out;
  },
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH }),
    links: [buildCanonical(PATH)],
  }),
  component: AuthorsPage,
});
