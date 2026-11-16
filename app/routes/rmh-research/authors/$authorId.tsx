import { createFileRoute, notFound } from '@tanstack/react-router';
import AuthorPage from '@/components/rmh-research/AuthorPage';
import { authorMetrics, getAuthor } from '@/lib/rmh-research/catalog';
import { getField } from '@/lib/rmh-research/fields';
import { buildMeta, buildCanonical } from '@/lib/seo';

export const Route = createFileRoute('/rmh-research/authors/$authorId')({
  loader: ({ params }) => {
    if (!getAuthor(params.authorId)) throw notFound();
  },
  head: ({ params }) => {
    const author = getAuthor(params.authorId);
    if (!author) return { meta: [{ title: 'Authors — RMH Research' }] };
    const m = authorMetrics(author.id);
    const path = `/rmh-research/authors/${author.id}`;
    return {
      meta: buildMeta({
        title: `${author.name} — RMH Research`,
        description: `${author.name}, ${author.role}, ${author.lab} (${getField(author.field).name}). r-index ${m?.r ?? 0}, h-index ${m?.h ?? 0}, ${m?.papers ?? 0} papers in the RMH Research archive.`,
        path,
      }),
      links: [buildCanonical(path)],
    };
  },
  component: AuthorPage,
});
