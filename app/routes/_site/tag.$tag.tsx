import { createFileRoute } from '@tanstack/react-router';
import { PageFrame } from '@/components/feed/PageLayout';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { TagColumn } from '@/components/feed/TagColumn';
import { auth } from '@/lib/auth';
import { listTagFeed, type TagFeedResult } from '@/lib/tags.server';
import { SITE_URL } from '@/lib/seo';

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
  /**
   * Tags are user-minted, so the URL space is unbounded and `#Foo`, `#foo` and
   * `#FOO` are three URLs for one feed. The canonical is the lowercase form,
   * and the page is `follow` but not `index`: the posts themselves are what
   * should rank, and this page is how a crawler reaches them.
   */
  head: ({ params }) => {
    const tag = params.tag.replace(/^#/, '');
    return {
      meta: [
        { title: `#${tag} | RMH Studios` },
        {
          name: 'description',
          content: `Posts tagged #${tag} on RMH Studios.`,
        },
        { name: 'robots', content: 'noindex, follow' },
      ],
      links: [
        { rel: 'canonical', href: `${SITE_URL}/tag/${encodeURIComponent(tag.toLowerCase())}` },
        // Feed autodiscovery for the hashtag's public posts.
        {
          rel: 'alternate',
          type: 'application/rss+xml',
          title: `#${tag} — posts`,
          href: `/tag/${tag}/rss.xml`,
        },
      ],
    };
  },
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
      <PageFrame>
        <TagColumn tag={tag} initialData={data} />
      </PageFrame>
    </>
  );
}
