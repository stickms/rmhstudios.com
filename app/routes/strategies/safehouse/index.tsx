import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDoctrineStore } from '@/stores/doctrineStore';
import { ContentCard } from '@/components/doctrine/safehouse/content-card';
import { AccessGate } from '@/components/doctrine/safehouse/access-gate';
import { Shield } from 'lucide-react';

export const Route = createFileRoute('/strategies/safehouse/')({
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
      const res = await fetch('/api/doctrine/safehouse/content');
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
    staleTime: 60_000,
  });

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
        <div className="text-center py-16">
          <Shield size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm text-white/40">{t("no-intelligence", { defaultValue: "No intelligence available at your clearance level." })}</p>
          <p className="text-xs text-white/20 mt-1">{t("upgrade-tier", { defaultValue: "Upgrade your tier to access classified content." })}</p>
        </div>
      )}

      <div className="space-y-3">
        {data?.items?.map((item: { id: string; type: string; title: string; body: string; minTier: string; publishedAt: string | null; reactions: { fire: number; based: number; mid: number; cringe: number; trash: number; tung: number } }) => (
          <ContentCard key={item.id} {...item} />
        ))}
      </div>
    </div>
  );
}
