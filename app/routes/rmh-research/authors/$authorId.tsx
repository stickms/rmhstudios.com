import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import AuthorPage from '@/components/rmh-research/AuthorPage';
import { authorMeta } from '@/lib/rmh-research/meta.server';
import { researchCardPath } from '@/lib/rmh-research/og';
import { buildMeta, buildCanonical } from '@/lib/seo';

// The title and description come from the server: importing the catalogue here
// would put the whole archive in the client entry (lib/rmh-research/meta.server.ts).
const fetchAuthorMeta = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(({ data }) => {
    const meta = authorMeta(data);
    if (!meta) throw notFound();
    return meta;
  });

export const Route = createFileRoute('/rmh-research/authors/$authorId')({
  // `loader` before `head`, so `head` sees its type.
  loader: ({ params }) => fetchAuthorMeta({ data: params.authorId }),
  head: ({ params, loaderData }) => {
    if (!loaderData) return { meta: [{ title: 'Authors — RMH Research' }] };
    const path = `/rmh-research/authors/${params.authorId}`;
    return {
      meta: buildMeta({
        title: `${loaderData.title} — RMH Research`,
        description: loaderData.description,
        path,
        image: researchCardPath('author', params.authorId),
      }),
      links: [buildCanonical(path)],
    };
  },
  component: AuthorPage,
});
