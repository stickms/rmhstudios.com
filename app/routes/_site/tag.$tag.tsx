import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { ContextRail } from "@/components/feed/ContextRail";
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { TagColumn } from '@/components/feed/TagColumn';
import { auth } from '@/lib/auth';
import { listTagFeed, type TagFeedResult } from '@/lib/tags.server';

// Prefetch the first page of the tag feed server-side so it's present at first
// paint (SSR) and prefetched on hover intent instead of fetched client-side on
// mount. Pagination still fetches client-side.
const fetchTagFeed = createServerFn({ method: 'GET' })
  .validator((tag: string) => tag)
  .handler(async ({ data: tag }): Promise<{ data: TagFeedResult }> => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    return { data: await listTagFeed(tag, { viewerId: session?.user?.id ?? null }) };
  });

export const Route = createFileRoute('/_site/tag/$tag')({
  head: ({ params }) => ({ meta: [{ title: `#${params.tag} | RMH Studios` }] }),
  loader: ({ params }): Promise<{ data: TagFeedResult }> => fetchTagFeed({ data: params.tag }),
  component: TagPage,
});

function TagPage() {
  const { tag } = Route.useParams();
  // createServerFn's `.validator` + FeedItem's recursive `original` type defeat
  // loader-data inference (it collapses to `undefined`); the runtime shape is
  // exactly the loader's return, so assert it.
  const { data } = Route.useLoaderData() as unknown as { data: TagFeedResult };
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 pb-dock"
      >
      <TagColumn tag={tag} initialData={data} />
    </AnimatedMain>
      <ContextRail reserve />
    </>
  );
}
