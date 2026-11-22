import { useEffect, useState } from 'react';
import { createFileRoute, useLocation, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { AdminBody } from '@/components/admin/AdminBody';
import { LookupBatch } from '@/components/admin/LookupBatch';
import { MAX_LOOKUP_LENGTH, classifyLookup } from '@/lib/admin/lookup';

export const Route = createFileRoute('/_site/admin/lookup')({
  head: () => ({
    meta: [
      {
        title: 'Lookup | Admin | RMH Studios',
      },
    ],
  }),
  // A single non-e-mail query is in the address, so a result can be shared between admins. An e-mail
  // address never is: an old link that still carries one is dropped here, so it never reaches a request.
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    q?: string;
  } => {
    const q = typeof search.q === 'string' ? search.q.trim().slice(0, MAX_LOOKUP_LENGTH) : '';
    return q && classifyLookup(q).type !== 'email'
      ? {
          q,
        }
      : {};
  },
  component: AdminLookupPage,
});

function AdminLookupPage() {
  const { t } = useTranslation('admin-lookup');
  const { q } = Route.useSearch();
  const navigate = useNavigate();
  const handedOver = useLocation({
    select: (l) => l.state.lookupItems,
  });
  const [legacy, setLegacy] = useState<string | null>(null);
  // An old link or bookmark that still carries an e-mail address: fill the box with it once and
  // replace the history entry without it. The admin presses Look up.
  useEffect(() => {
    const old = new URLSearchParams(window.location.search).get('q');
    if (old && classifyLookup(old.trim()).type === 'email') {
      setLegacy(old.trim());
      void navigate({
        to: '/admin/lookup',
        search: {},
        replace: true,
      });
    }
  }, [navigate]);
  const initial = legacy ?? handedOver?.join('\n');
  return (
    <PageLayout
      title={t('page-title', {
        defaultValue: 'Lookup',
      })}
      description={t('page-description', {
        defaultValue:
          'Paste an id, a handle, an e-mail address or a link to find what it is, its state and the tools that act on it.',
      })}
      wide
      backTo="/admin"
    >
      <AdminBody width="narrow">
        <LookupBatch key={`${q ?? ''}|${initial ?? ''}`} q={q} initial={initial} />
      </AdminBody>
    </PageLayout>
  );
}
