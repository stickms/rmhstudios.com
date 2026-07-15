import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { useSession } from '@/components/Providers';
import { WagerCard } from '@/components/wager/WagerCard';
import type { SerializedWager } from '@/lib/wager/wager.server';

export const Route = createFileRoute('/_site/wager/$id')({
  head: () => ({ meta: [{ title: 'Wager Match | RMH Studios' }] }),
  component: WagerDetailPage,
});

function WagerDetailPage() {
  const { t } = useTranslation('c-wager');
  const { id } = Route.useParams();
  const { data: session } = useSession();
  const viewerId = session?.user?.id ?? null;
  const [wager, setWager] = useState<SerializedWager | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/wager/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (active) setWager(d.wager ?? null);
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <PageLayout
      title={t('detail-title', { defaultValue: 'Wager Match' })}
      backTo="/wager"
      backLabel={t('back', { defaultValue: 'Back to wagers' })}
    >
      <div className="max-w-xl">
        {loading ? (
          <div className="h-48 rounded-site glass-fill animate-pulse" />
        ) : wager ? (
          <WagerCard wager={wager} viewerId={viewerId} onChange={(w) => w && setWager(w)} />
        ) : (
          <p className="text-site-text-dim py-12 text-center">
            {t('not-found', { defaultValue: 'This match no longer exists.' })}
          </p>
        )}
      </div>
    </PageLayout>
  );
}
