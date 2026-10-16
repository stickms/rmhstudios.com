import { createFileRoute } from '@tanstack/react-router';
import { AdminQotdPanel } from '@/components/posts-plus/AdminQotdPanel';

export const Route = createFileRoute('/_site/admin/qotd')({
  head: () => ({ meta: [{ title: 'Question of the Day | Admin | RMH Studios' }] }),
  component: AdminQotdPanel,
});
