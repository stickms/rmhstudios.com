import { createFileRoute } from '@tanstack/react-router';
import ArchivePage from '@/components/rmh-research/ArchivePage';
import { parseArchiveSearch, type ArchiveSearch } from '@/lib/rmh-research/params';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-research/archive';
const TITLE = 'Archive — RMH Research';
const DESC =
  'Search every paper RMH Research has published: by title, author, keyword, field and year, ranked by relevance, citations or resonance.';

export type { ArchiveSearch };

// The archive's URL state lives in `lib/rmh-research/search.ts` (`parseArchiveSearch`,
// tested there): everything the page shows is in the address, so a search is a link,
// and the search form works as a plain GET form before the page hydrates.
export const Route = createFileRoute('/rmh-research/archive')({
  validateSearch: (search: Record<string, unknown>): ArchiveSearch => parseArchiveSearch(search),
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH }),
    links: [buildCanonical(PATH)],
  }),
  component: ArchivePage,
});
