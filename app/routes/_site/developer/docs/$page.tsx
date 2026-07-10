import { createFileRoute } from '@tanstack/react-router';
import { WikiContent, findWikiPage } from '@/components/developer/wiki';

export const Route = createFileRoute('/_site/developer/docs/$page')({
  head: ({ params }) => {
    const page = findWikiPage(params.page);
    return { meta: [{ title: `${page?.title ?? 'API Docs'} | RMH Studios` }] };
  },
  component: DocPage,
});

function DocPage() {
  const { page } = Route.useParams();
  return <WikiContent slug={page} />;
}
