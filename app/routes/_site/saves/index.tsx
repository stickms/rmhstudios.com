import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { PageLayout } from '@/components/feed/PageLayout';
import { SavesHub } from '@/components/saves/SavesHub';
import { auth } from '@/lib/auth';
import { listSaves, listFolders } from '@/lib/saves/saves.server';
import type { HydratedSave, SaveFolderView } from '@/lib/saves/types';

interface HubData {
  items: HydratedSave[];
  nextCursor: string | null;
  folders: SaveFolderView[];
}

const fetchSaves = createServerFn({ method: 'GET' }).handler(async (): Promise<HubData> => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session) return { items: [], nextCursor: null, folders: [] };
  const [result, folders] = await Promise.all([
    listSaves(session.user.id, {}),
    listFolders(session.user.id),
  ]);
  return { ...result, folders };
});

export const Route = createFileRoute('/_site/saves/')({
  head: () => ({ meta: [{ title: 'Saved | RMH Studios' }, { name: 'robots', content: 'noindex' }] }),
  loader: () => fetchSaves(),
  component: SavesPage,
});

function SavesPage() {
  const data = Route.useLoaderData();
  return (
    <PageLayout title="Saved">
      <SavesHub initial={data} />
    </PageLayout>
  );
}
