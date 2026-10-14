import { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { MarathonSchedule } from '@/components/marathon/MarathonSchedule';
import { toolsApi } from '@/lib/tools/client';
import { noindexHead } from '@/lib/seo';
import type { MarathonItem } from '@/lib/dunesday/marathon';

export const Route = createFileRoute('/_site/marathon/$shareId')({
  head: () => noindexHead('Shared marathon'),
  component: SharedMarathon,
});

type Shared = { title: string; deadline: string; items: MarathonItem[] };

function SharedMarathon() {
  const { t } = useTranslation('f-tools');
  const { shareId } = Route.useParams();
  const [list, setList] = useState<Shared | null | undefined>(undefined);
  useEffect(() => {
    toolsApi<{ list: Shared }>('GET', `/api/marathon-lists/shared/${encodeURIComponent(shareId)}`)
      .then((d) => setList(d.list))
      .catch(() => setList(null));
  }, [shareId]);
  return (
    <PageLayout
      title={list?.title ?? t('marathon-heading', { defaultValue: 'Marathon planner' })}
      backTo="/marathon"
      backLabel={t('marathon-back', { defaultValue: 'My lists' })}
    >
      {list === undefined ? null : list === null ? (
        <p className="p-4 text-sm text-site-text-muted">
          {t('marathon-missing', { defaultValue: 'This marathon link is not valid.' })}
        </p>
      ) : (
        <div className="space-y-3 p-1">
          <p className="text-sm text-site-text-muted">
            {t('marathon-shared-intro', {
              defaultValue: '{{count}} titles, to finish by {{date}}. Planned from today.',
              count: list.items.length,
              date: list.deadline,
            })}
          </p>
          <MarathonSchedule items={list.items} deadline={list.deadline} />
        </div>
      )}
    </PageLayout>
  );
}
