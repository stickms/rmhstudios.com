import { createFileRoute, notFound } from '@tanstack/react-router';
import { PageFrame } from '@/components/feed/PageLayout';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { ThreadView } from '@/components/feed/ThreadView';
import { auth } from '@/lib/auth';
import { getThread } from '@/lib/feed/thread.server';
import { SITE_URL } from '@/lib/seo';
import type { FeedItem } from '@/lib/feed-types';

const fetchThread = createServerFn({ method: 'GET' })
  .validator((rootId: string) => rootId)
  .handler(async ({ data: rootId }) => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    return getThread(rootId, session?.user.id ?? null);
  });

export const Route = createFileRoute('/_site/thread/$rootId')({
  /**
   * A thread is the same content as the post permalink it starts from, and the
   * RSS feeds link here rather than there — so this URL is the one a crawler
   * meets first, and both used to be indexable with no relationship declared.
   * The permalink is canonical (it names the author, which is what a search
   * result wants to show); this page points at it.
   *
   * The title is the opening post rather than the word "Thread", which was the
   * same seven characters on every thread on the site.
   */
  // `loaderData` is annotated explicitly for the same reason `/games/$gameId`
  // annotates it: `head` is evaluated while the route's own type is still being
  // inferred, so it otherwise resolves to `never` and every access errors.
  head: ({ loaderData }: { loaderData?: { items: FeedItem[] } }) => {
    const root = loaderData?.items?.[0];
    const handle = root?.user?.handle;
    const author = root?.user?.name || 'Someone';
    // `locked` covers paid posts; a thread is only reachable here when the
    // viewer may read it, but the meta tags are served to everyone.
    const body = root && !root.locked ? root.content?.trim() : '';
    const snippet = body ? (body.length > 120 ? `${body.slice(0, 119)}…` : body) : '';
    const canonical = handle && root ? `${SITE_URL}/u/${handle}/post/${root.id}` : null;

    return {
      meta: [
        { title: snippet ? `${author}: "${snippet}" | RMH Studios` : `Thread | RMH Studios` },
        {
          name: 'description',
          content: snippet || `A thread by ${author} on RMH Studios.`,
        },
        // Without a handle there is no canonical to point at, so keep the
        // duplicate out of the index rather than letting it compete.
        ...(canonical ? [] : [{ name: 'robots', content: 'noindex, follow' }]),
      ],
      links: canonical ? [{ rel: 'canonical', href: canonical }] : [],
    };
  },
  loader: async ({ params }) => {
    const items = await fetchThread({ data: params.rootId });
    if (!items) throw notFound();
    return { items };
  },
  component: ThreadPage,
});

function ThreadPage() {
  const { items } = Route.useLoaderData();
  return (
    <>
      <PageFrame>
        <ThreadView items={items} />
      </PageFrame>
    </>
  );
}
