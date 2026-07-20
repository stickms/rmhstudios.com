import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { PageLayout } from '@/components/feed/PageLayout';
import { ListsManager } from '@/components/lists/ListsManager';
import { auth } from '@/lib/auth';
import { getUserLists } from '@/lib/lists/lists.server';
import type { ListView } from '@/lib/lists/constants';

const fetchLists = createServerFn({ method: 'GET' }).handler(async (): Promise<ListView[]> => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session) return [];
  return getUserLists(session.user.id);
});

export const Route = createFileRoute('/_site/lists/')({
  head: () => ({ meta: [{ title: 'Lists | RMH Studios' }, { name: 'robots', content: 'noindex' }] }),
  loader: () => fetchLists(),
  component: ListsPage,
});

function ListsPage() {
  const lists = Route.useLoaderData();
  return (
    <PageLayout title="Lists" backTo="/">
      <ListsManager initial={lists} />
    </PageLayout>
  );
}
