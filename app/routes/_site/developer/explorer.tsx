import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ApiExplorer } from '@/components/developer/explorer/ApiExplorer';
import { PageLayout } from '@/components/feed/PageLayout';
import { buildCanonical, buildMeta } from '@/lib/seo';

// Public and client-only: it reads the endpoint registry and calls /api/v1 with a key the member pastes.
export const Route = createFileRoute('/_site/developer/explorer')({
  validateSearch: (search: Record<string, unknown>): { op?: string } =>
    typeof search.op === 'string' && search.op ? { op: search.op } : {},
  head: () => ({
    meta: buildMeta({
      title: 'API Explorer | RMH Studios Developer',
      description:
        'Browse every endpoint of the RMH Studios API, send a request with your key and copy the curl, JavaScript or Python for it.',
      path: '/developer/explorer',
    }),
    links: [buildCanonical('/developer/explorer')],
  }),
  component: ExplorerPage,
});

function ExplorerPage() {
  const { t } = useTranslation('dev-explorer');
  const { op } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <PageLayout
      title={t('page-title', { defaultValue: 'API explorer' })}
      description={t('page-description', {
        defaultValue:
          'Pick an endpoint, fill in its parameters and send a request with your key. Test keys return sample data and change nothing.',
      })}
      backTo="/developer"
      backLabel={t('page-back', { defaultValue: 'Developer API' })}
      wide
    >
      <ApiExplorer
        op={op}
        onSelect={(operationId) =>
          void navigate({ to: '/developer/explorer', search: { op: operationId }, replace: true })
        }
      />
    </PageLayout>
  );
}
