import { createFileRoute, notFound } from '@tanstack/react-router';
import PaperPage from '@/components/rmh-research/PaperPage';
import { authorsOf, getPaper } from '@/lib/rmh-research/catalog';
import { authorLine } from '@/lib/rmh-research/cite';
import { buildMeta, buildCanonical } from '@/lib/seo';

export const Route = createFileRoute('/rmh-research/paper/$paperId')({
  loader: ({ params }) => {
    if (!getPaper(params.paperId)) throw notFound();
  },
  head: ({ params }) => {
    const paper = getPaper(params.paperId);
    if (!paper) return { meta: [{ title: 'Archive — RMH Research' }] };
    const path = `/rmh-research/paper/${paper.id}`;
    return {
      meta: buildMeta({
        title: `${paper.title} — RMH Research`,
        description: `${authorLine(paper, authorsOf(paper))} (${paper.year}). ${paper.abstract}`.slice(0, 300),
        path,
      }),
      links: [buildCanonical(path)],
    };
  },
  component: PaperPage,
});
