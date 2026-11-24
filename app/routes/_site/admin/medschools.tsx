import { createFileRoute } from '@tanstack/react-router';
import { AdminMedSchoolsPage } from '@/components/admin/medschools/AdminMedSchoolsPage';
import { parseAdminSearch } from '@features/medschools/engine/admin-search';

export const Route = createFileRoute('/_site/admin/medschools')({
  head: () => ({
    meta: [
      {
        title: 'Med Schools | Admin | RMH Studios',
      },
    ],
  }),
  validateSearch: parseAdminSearch,
  component: AdminPage,
});

function AdminPage() {
  const { tab } = Route.useSearch();
  return <AdminMedSchoolsPage {...(tab ? { tab } : {})} />;
}
