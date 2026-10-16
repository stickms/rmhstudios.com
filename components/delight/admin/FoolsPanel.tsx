'use client';

import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { fetchJson } from '@/lib/http';

export default function FoolsPanel() {
  const { t } = useTranslation('f-delight');
  const q = useQuery({
    queryKey: ['delight', 'admin', 'fools'],
    queryFn: () => fetchJson<{ fools: boolean }>('/api/admin/delight/fools'),
  });
  const set = async (on: boolean) => {
    try {
      await fetchJson('/api/admin/delight/fools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ on }),
      });
      await q.refetch();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t('admin-error', { defaultValue: 'Something went wrong' }),
      );
    }
  };
  return (
    <section className="glass-pane flex items-center justify-between gap-4 rounded-site p-4">
      <div>
        <h2 className="font-semibold text-site-text" id="fools-label">
          {t('fools-admin-title', { defaultValue: 'April Fools mode' })}
        </h2>
        <p className="text-sm text-site-text-muted">
          {t('fools-admin-desc', {
            defaultValue:
              'Cosmetic emoji and logo swaps for everyone. Each member sees an off switch. Visitors pick it up within about ten minutes.',
          })}
        </p>
      </div>
      <Switch
        checked={q.data?.fools ?? false}
        disabled={q.isPending}
        onCheckedChange={(v) => void set(v)}
        aria-labelledby="fools-label"
      />
    </section>
  );
}
