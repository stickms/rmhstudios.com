import { createFileRoute } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDoctrineStore } from '@features/doctrine/ui/doctrineStore';
import { ContentCard } from '@features/doctrine/ui/safehouse/content-card';
import { AccessGate } from '@features/doctrine/ui/safehouse/access-gate';
import { Shield } from 'lucide-react';
import { api } from '@/lib/contract/client';
import { getSafehouseContentApi } from '@features/doctrine/engine/doctrine.contract';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/strategies/safehouse/')({
  head: () => noindexHead('Safehouse'),
  component: SafehouseFeed,
});

function SafehouseFeed() {
  const { t } = useTranslation("r-strategies");
  const setDoctrineTheme = useDoctrineStore(s => s.setDoctrineTheme);

  useEffect(() => {
    setDoctrineTheme('safehouse');
    return () => setDoctrineTheme('default');
  }, [setDoctrineTheme]);

  const { data, isLoading } = useQuery({
    queryKey: ['doctrine', 'safehouse', 'content'],
    queryFn: async () => {
      return api(getSafehouseContentApi);
    },
    staleTime: 60_000,
  });
  const arrival = useArrival(!isLoading);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-20 md:pb-6">
      <div className="flex items-center gap-2">
        <Shield size={20} style={{ color: 'var(--doctrine-accent)' }} />
        <h1 className="text-xl font-bold" style={{ color: 'var(--doctrine-text-primary)' }}>
          {t("safehouse-title", { defaultValue: "The Safehouse" })}
        </h1>
      </div>
      <p className="text-sm" style={{ color: 'var(--doctrine-text-muted)' }}>
        {t("safehouse-subtitle", { defaultValue: "Classified intelligence. Raw development. Unfiltered process." })}
      </p>

      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 rounded-lg animate-pulse" style={{ background: 'var(--doctrine-bg-secondary)' }} />
          ))}
        </div>
      )}

      {data?.items?.length === 0 && (
        <div className={cn('text-center py-16', arrival)}>
          <Shield size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm text-white/60">{t("no-intelligence", { defaultValue: "No intelligence available at your clearance level." })}</p>
          <p className="text-xs text-white/50 mt-1">{t("upgrade-tier", { defaultValue: "Upgrade your tier to access classified content." })}</p>
        </div>
      )}

      <div className={cn('space-y-3', arrival)}>
        {data?.items?.map((item) => (
          <ContentCard key={item.id} {...item} />
        ))}
      </div>
    </div>
  );
}
