import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { StorefrontColumn } from '@/components/feed/StorefrontColumn';
import { auth } from '@/lib/auth';
import { listStorefront } from '@/lib/storefront.server';

// Prefetch the creator's storefront server-side so it's present at first paint
// (SSR) and prefetched on hover intent instead of fetched client-side on mount.
// A missing creator yields `null` and the column falls back to its client path
// (which renders the not-found state). Mutations still fetch.
const fetchStorefront = createServerFn({ method: 'GET' })
  .validator((userid: string) => userid)
  .handler(async ({ data: userid }) => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    return { data: await listStorefront(userid, session?.user?.id ?? null) };
  });

export const Route = createFileRoute('/_site/store/$userid')({
  head: () => ({ meta: [{ title: 'Store | RMH Studios' }] }),
  loader: ({ params }) => fetchStorefront({ data: params.userid }),
  component: StorePage,
});

function StorePage() {
  const { userid } = Route.useParams();
  const { data } = Route.useLoaderData();
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <StorefrontColumn key={userid} userid={userid} initialData={data} />
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
