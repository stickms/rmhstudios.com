import { createFileRoute } from '@tanstack/react-router';
import { DelightAdminPage } from '@/components/delight/admin/DelightAdminPage';

export const Route = createFileRoute('/_site/admin/delight')({
  head: () => ({ meta: [{ title: 'Delight tools | Admin | RMH Studios' }] }),
  component: DelightAdminPage,
});
