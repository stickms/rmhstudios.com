import { createFileRoute } from '@tanstack/react-router';
import { PageFrame } from '@/components/feed/PageLayout';
import { createServerFn } from '@tanstack/react-start';
import { RecapColumn } from '@/components/feed/RecapColumn';
import { getRequestSession } from '@/lib/auth-session.server';
import { getWeeklyRecap } from '@/lib/recap.server';

// Generate the recap server-side so it's present at first paint / prefetched on
// intent instead of fetched on mount. Signed-out visitors get `null` and the
// column falls back to its client path (which 401s into the error state).
const fetchRecap = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
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
      <PageFrame>
      <RecapColumn initialData={recap} />
    </PageFrame>
    </>
  );
}
