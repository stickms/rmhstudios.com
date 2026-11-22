import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AdminBody } from '@/components/admin/AdminBody';
import { WebhooksAdmin } from '@/components/admin/WebhooksAdmin';
import { PageLayout } from '@/components/feed/PageLayout';
import { NoMargin } from '@/components/shell/NoMargin';
import { WEBHOOK_FILTERS, type WebhookFilter } from '@/lib/admin/webhooks';

export const Route = createFileRoute('/_site/admin/webhooks')({
  head: () => ({
    meta: [{ title: 'Webhooks | Admin | RMH Studios' }],
  }),
  /** `?filter=failing`; anything else is the default. Hand-checked: no schema library on a route. */
  validateSearch: (search: Record<string, unknown>): { filter?: WebhookFilter } => {
    const f = search.filter;
    return typeof f === 'string' && (WEBHOOK_FILTERS as readonly string[]).includes(f)
      ? { filter: f as WebhookFilter }
      : {};
  },
  component: AdminWebhooksPage,
});

function AdminWebhooksPage() {
  const { t } = useTranslation('admin-webhooks');
  const { filter = 'failing' } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <PageLayout
      title={t('page-title', { defaultValue: 'Webhooks' })}
      description={t('page-description', {
        defaultValue:
          'Endpoints that are failing or off, with 24-hour delivery figures. Turn one off with a reason its owner reads.',
      })}
      wide
      backTo="/admin"
    >
      <NoMargin />
      <AdminBody width="wide">
        <WebhooksAdmin filter={filter} onFilterChange={(next) => void navigate({ search: { filter: next } })} />
      </AdminBody>
    </PageLayout>
  );
}
