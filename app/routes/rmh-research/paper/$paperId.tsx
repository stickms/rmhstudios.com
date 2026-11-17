import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import PaperPage from '@/components/rmh-research/PaperPage';
import { paperMeta } from '@/lib/rmh-research/meta.server';
import { researchCardPath } from '@/lib/rmh-research/og';
import { articleSchema, jsonLdScript } from '@/lib/schema';
import { buildMeta, buildCanonical } from '@/lib/seo';

// The title and description come from the server: importing the catalogue here
// would put the whole archive in the client entry (lib/rmh-research/meta.server.ts).
const fetchPaperMeta = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(({ data }) => {
    const meta = paperMeta(data);
    if (!meta) throw notFound();
    return meta;
  });

export const Route = createFileRoute('/rmh-research/paper/$paperId')({
  // `loader` before `head`, so `head` sees its type.
  loader: ({ params }) => fetchPaperMeta({ data: params.paperId }),
  head: ({ params, loaderData }) => {
    if (!loaderData) return { meta: [{ title: 'Archive — RMH Research' }] };
    const path = `/rmh-research/paper/${params.paperId}`;
    return {
      meta: buildMeta({
        title: `${loaderData.title} — RMH Research`,
        description: loaderData.description,
        path,
        image: researchCardPath('paper', params.paperId),
      }),
      links: [buildCanonical(path)],
      // lib/schema has no ScholarlyArticle builder; its Article builder fits a paper.
      scripts: [
        jsonLdScript(
          articleSchema({
            title: loaderData.title,
            description: loaderData.description,
            datePublished: String(loaderData.year ?? ''),
            path,
            section: loaderData.section,
          }),
        ),
      ],
    };
  },
  component: PaperPage,
});
