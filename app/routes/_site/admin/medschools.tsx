import { createFileRoute } from '@tanstack/react-router';
import { AdminMedSchoolsPage, parseAdminSearch } from '@features/medschools/ui/AdminMedSchoolsPage';

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
