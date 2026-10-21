import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { PageLayout } from '@/components/feed/PageLayout';
import { ListDetailView } from '@/components/lists/ListDetailView';
import { getRequestSession } from '@/lib/auth-session.server';
import { getListDetail, type ListDetail } from '@/lib/lists/lists.server';

const fetchList = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: id }): Promise<ListDetail> => {
    const session = await getRequestSession();
    const detail = await getListDetail(id, session?.user.id ?? null);
    if (!detail) throw notFound();
    return detail;
  });

export const Route = createFileRoute('/_site/lists/$id')({
  head: () => ({ meta: [{ title: 'List | RMH Studios' }, { name: 'robots', content: 'noindex' }] }),
  loader: ({ params }) => fetchList({ data: params.id }),
  component: ListPage,
});

function ListPage() {
  const { list, members } = Route.useLoaderData();
  return (
    <PageLayout title={list.name} backTo="/saves">
      <ListDetailView list={list} members={members} />
    </PageLayout>
  );
}
