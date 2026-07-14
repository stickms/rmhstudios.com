import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { RecapColumn } from '@/components/feed/RecapColumn';
import { auth } from '@/lib/auth';
import { getWeeklyRecap } from '@/lib/recap.server';

// Generate the recap server-side so it's present at first paint / prefetched on
// intent instead of fetched on mount. Signed-out visitors get `null` and the
// column falls back to its client path (which 401s into the error state).
const fetchRecap = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session) return { recap: null };
  return { recap: await getWeeklyRecap(session.user.id) };
});

export const Route = createFileRoute('/_site/recap')({
  head: () => ({ meta: [{ title: 'Your Week | RMH Studios' }] }),
  loader: () => fetchRecap(),
  component: RecapPage,
});

function RecapPage() {
  const { recap } = Route.useLoaderData();
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-[calc(env(safe-area-inset-bottom,0px)+92px)] md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
      <RecapColumn initialData={recap} />
    </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
