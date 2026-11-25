import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { PageFrame } from '@/components/feed/PageLayout';
import { ReadAlongPage } from '@/components/communities/ReadAlongPage';
import { getRequestSession } from '@/lib/auth-session.server';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { getReadAlongPage } from '@/lib/communities/read-along.server';
import type { ReadAlongPageDTO } from '@/lib/communities/read-along';

// The guard is inside the handler (a server function is its own HTTP endpoint): a missing community, a missing
// read-along and a private community's read-along for someone outside it are the same null, and the loader's 404.
const fetchReadAlong = createServerFn({ method: 'GET' })
  .validator((input: { slug: string; id: string }) => input)
  .handler(async ({ data }): Promise<ReadAlongPageDTO | null> => {
    const session = await getRequestSession();
    return getReadAlongPage({
      slug: data.slug,
      id: data.id,
      viewerId: session?.user?.id ?? null,
      isSiteAdmin: Boolean((session?.user as { isAdmin?: boolean } | undefined)?.isAdmin),
    });
  });

export const Route = createFileRoute('/_site/c/$slug_/read/$id')({
  // Annotated for the inference quirk documented on `/games/$gameId`.
  head: ({ loaderData, params }: { loaderData?: ReadAlongPageDTO | null; params: { slug: string; id: string } }) => {
    const path = `/c/${params.slug}/read/${params.id}`;
    // A read-along is reached from its community's page and is not listed in the sitemap; no text goes in the head
    // when the page did not load (a private community's is never shown to someone outside it).
    if (!loaderData) {
      return {
        meta: [{ title: 'Read-along | RMH Studios' }, { name: 'robots', content: 'noindex, follow' }],
        links: [buildCanonical(path)],
      };
    }
    return {
      meta: buildMeta({
        title: `${loaderData.bookTitle} read-along — ${loaderData.communityName} | RMH Studios`,
        description: `Reading ${loaderData.bookTitle} together in ${loaderData.communityName}, a part at a time.`,
        path,
      }),
      links: [buildCanonical(path)],
    };
  },
  loader: async ({ params }) => {
    const data = await fetchReadAlong({ data: { slug: params.slug, id: params.id } });
    if (!data) throw notFound();
    return data;
  },
  component: ReadAlongRoute,
});

function ReadAlongRoute() {
  const data = Route.useLoaderData() as ReadAlongPageDTO;
  return (
    <PageFrame>
      <ReadAlongPage data={data} />
    </PageFrame>
  );
}
