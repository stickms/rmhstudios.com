import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { ContextRail } from "@/components/feed/ContextRail";
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { ThreadView } from '@/components/feed/ThreadView';
import { auth } from '@/lib/auth';
import { getThread } from '@/lib/feed/thread.server';

const fetchThread = createServerFn({ method: 'GET' })
  .validator((rootId: string) => rootId)
  .handler(async ({ data: rootId }) => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    return getThread(rootId, session?.user.id ?? null);
  });

export const Route = createFileRoute('/_site/thread/$rootId')({
  head: () => ({ meta: [{ title: 'Thread | RMH Studios' }] }),
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
      <AnimatedMain
        className="w-full min-w-0 pb-dock"
      >
        <ThreadView items={items} />
      </AnimatedMain>
      <ContextRail reserve />
    </>
  );
}
