import { createFileRoute, notFound } from '@tanstack/react-router';
import PaperPage from '@/components/rmh-research/PaperPage';
import { authorsOf, getPaper } from '@/lib/rmh-research/catalog';
import { authorLine } from '@/lib/rmh-research/cite';
import { getField } from '@/lib/rmh-research/fields';
import { articleSchema, jsonLdScript } from '@/lib/schema';
import { researchCardPath } from '@/lib/rmh-research/og';
import { buildMeta, buildCanonical } from '@/lib/seo';

export const Route = createFileRoute('/rmh-research/paper/$paperId')({
  loader: ({ params }) => {
    if (!getPaper(params.paperId)) throw notFound();
  },
  head: ({ params }) => {
    const paper = getPaper(params.paperId);
    if (!paper) return { meta: [{ title: 'Archive — RMH Research' }] };
    const path = `/rmh-research/paper/${paper.id}`;
    const description = `${authorLine(paper, authorsOf(paper))} (${paper.year}). ${paper.abstract}`.slice(0, 300);
    return {
      meta: buildMeta({
        title: `${paper.title} — RMH Research`,
        description,
        path,
        image: researchCardPath('paper', paper.id),
      }),
      links: [buildCanonical(path)],
      // lib/schema has no ScholarlyArticle builder; its Article builder fits a paper.
      scripts: [
        jsonLdScript(
          articleSchema({ title: paper.title, description, datePublished: String(paper.year), path, section: getField(paper.field).name }),
        ),
      ],
    };
  },
  component: PaperPage,
});
