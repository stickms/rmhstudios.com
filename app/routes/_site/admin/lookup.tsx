import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { AdminBody } from '@/components/admin/AdminBody';
import { LookupField } from '@/components/admin/LookupField';
import { LookupResults } from '@/components/admin/LookupResults';
import { MAX_LOOKUP_LENGTH } from '@/lib/admin/lookup';

export const Route =
  createFileRoute(
    '/_site/admin/lookup',
  )(
    {
      head: () => ({
        meta: [
          {
            title:
              'Lookup | Admin | RMH Studios',
          },
        ],
      }),
      // The query is in the address, so a result can be shared between admins.
      validateSearch:
        (
          search: Record<
            string,
            unknown
          >,
        ): {
          q?: string;
        } => {
          const q =
            typeof search.q ===
            'string'
              ? search.q
                  .trim()
                  .slice(
                    0,
                    MAX_LOOKUP_LENGTH,
                  )
              : '';
          return q
            ? {
                q,
              }
            : {};
        },
      component:
        AdminLookupPage,
    },
  );

function AdminLookupPage() {
  const {
    t,
  } =
    useTranslation(
      'admin-lookup',
    );
  const {
    q,
  } =
    Route.useSearch();
  return (
    <PageLayout
      title={t(
        'page-title',
        {
          defaultValue:
            'Lookup',
        },
      )}
      description={t(
        'page-description',
        {
          defaultValue:
            'Paste an id, a handle, an e-mail address or a link to find what it is, its state and the tools that act on it.',
        },
      )}
      wide
      backTo="/admin"
    >
      <AdminBody width="narrow">
        <LookupField
          key={
            q ??
            ''
          }
          initial={
            q ??
            ''
          }
        />
        {q ? (
          <LookupResults
            key={
              q
            }
            q={
              q
            }
          />
        ) : null}
      </AdminBody>
    </PageLayout>
  );
}
