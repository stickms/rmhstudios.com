/**
 * Research Article Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getArticleBySlug } from '@/lib/research';
import { PaperViewer } from '@/components/research/PaperViewer';
import { notFound } from '@tanstack/react-router';

const fetchArticle = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const article = getArticleBySlug(slug);
    if (!article) throw notFound();
    return article;
  });

export const Route = createFileRoute('/research/$slug')({
  loader: ({ params }) => fetchArticle({ data: params.slug }),
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.title ?? 'Article'} | RMH Studios Research` },
      { name: 'description', content: loaderData?.abstract?.slice(0, 160) ?? '' },
    ],
  }),
  component: ResearchArticlePage,
});

function ResearchArticlePage() {
  const article = Route.useLoaderData();

  return <PaperViewer article={article} />;
}
