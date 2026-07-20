import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { PageLayout } from '@/components/feed/PageLayout';
import { HistoryList } from '@/components/history/HistoryList';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { listHistory, type HistoryView } from '@/lib/history/history.server';

interface HistoryData {
  items: HistoryView[];
  nextCursor: string | null;
  paused: boolean;
}

const fetchHistory = createServerFn({ method: 'GET' }).handler(async (): Promise<HistoryData> => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session) return { items: [], nextCursor: null, paused: false };
  const [result, profile] = await Promise.all([
    listHistory(session.user.id, {}),
    prisma.userProfile.findUnique({
      where: { userId: session.user.id },
      select: { historyPaused: true },
    }),
  ]);
  return { ...result, paused: profile?.historyPaused ?? false };
});

export const Route = createFileRoute('/_site/history')({
  head: () => ({
    meta: [{ title: 'History | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  loader: () => fetchHistory(),
  component: HistoryPage,
});

function HistoryPage() {
  const data = Route.useLoaderData();
  return (
    <PageLayout title="History">
      <HistoryList initial={data} />
    </PageLayout>
  );
}
