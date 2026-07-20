import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { PageLayout } from '@/components/feed/PageLayout';
import { ListDetailView } from '@/components/lists/ListDetailView';
import { auth } from '@/lib/auth';
import { getListDetail, type ListDetail } from '@/lib/lists/lists.server';

const fetchList = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: id }): Promise<ListDetail> => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
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
    <PageLayout title={list.name} backTo="/lists">
      <ListDetailView list={list} members={members} />
    </PageLayout>
  );
}
