import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AdminBody } from '@/components/admin/AdminBody';
import { CommunitiesAdmin } from '@/components/admin/CommunitiesAdmin';
import { PageLayout } from '@/components/feed/PageLayout';
import { NoMargin } from '@/components/shell/NoMargin';
import { COMMUNITY_FILTERS, type CommunityFilter } from '@/lib/admin/communities';

export const Route = createFileRoute('/_site/admin/communities')({
  head: () => ({
    meta: [{ title: 'Communities | Admin | RMH Studios' }],
  }),
  /** `?filter=reports`; anything else is the default. Hand-checked: no schema library on a route. */
  validateSearch: (search: Record<string, unknown>): { filter?: CommunityFilter } => {
    const f = search.filter;
    return typeof f === 'string' && (COMMUNITY_FILTERS as readonly string[]).includes(f)
      ? { filter: f as CommunityFilter }
      : {};
  },
  component: AdminCommunitiesPage,
});

function AdminCommunitiesPage() {
  const { t } = useTranslation('admin-communities');
  const { filter = 'all' } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <PageLayout
      title={t('page-title', { defaultValue: 'Communities' })}
      description={t('page-description', {
        defaultValue:
          'Open reports, quiet moderators and fast growth for every community. Take one out of discovery with a reason its moderators read.',
      })}
      wide
      backTo="/admin"
    >
      <NoMargin />
      <AdminBody width="wide">
        <CommunitiesAdmin filter={filter} onFilterChange={(next) => void navigate({ search: { filter: next } })} />
      </AdminBody>
    </PageLayout>
  );
}
