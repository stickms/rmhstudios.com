'use client';

/** Gift and mixtape exchanges (G3 / F2): the caller's list, plus a create form. */
import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Gift, Music } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { apiJson, errorCode } from '@/components/economy-plus/api';
import type { ExchangeKind, ExchangeSummary } from '@/lib/gifting/exchange';

const KEY = ['gift-exchanges'] as const;

function CreateForm() {
  const { t } = useTranslation('f-gifting');
  const navigate = useNavigate();
  const [kind, setKind] = useState<ExchangeKind>('GIFT');
  const [title, setTitle] = useState('');
  const [theme, setTheme] = useState('');
  const [budget, setBudget] = useState('100');
  const [drawAt, setDrawAt] = useState('');
  const [revealAt, setRevealAt] = useState('');

  const create = useMutation({
    mutationFn: () =>
      apiJson<{ id: string }>('/api/gift-exchanges', {
        method: 'POST',
        body: {
          kind,
          title: title.trim(),
          theme: theme.trim() || undefined,
          budget: kind === 'GIFT' ? Number(budget) : undefined,
          drawAt: new Date(drawAt).toISOString(),
          revealAt: new Date(revealAt).toISOString(),
        },
      }),
    onSuccess: ({ id }) => void navigate({ to: '/exchange/$id', params: { id } }),
    onError: (err) =>
      toast.error(
        errorCode(err) === 'REQUEST_FAILED'
          ? t('create-error', { defaultValue: "Couldn't create the exchange" })
          : errorCode(err),
      ),
  });

  const dates = drawAt !== '' && revealAt !== '' && new Date(revealAt) > new Date(drawAt);
  const valid = title.trim().length >= 3 && dates && (kind === 'MIXTAPE' || Number(budget) >= 10);

  return (
    <form
      className="glass-pane space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) create.mutate();
      }}
    >
      <h2 className="site-section-label">
        {t('create-title', { defaultValue: 'Start an exchange' })}
      </h2>
      <LiquidTabs
        tabs={[
          { id: 'GIFT', label: t('kind-gift', { defaultValue: 'Gift exchange' }), icon: Gift },
          {
            id: 'MIXTAPE',
            label: t('kind-mixtape', { defaultValue: 'Mixtape exchange' }),
            icon: Music,
          },
        ]}
        value={kind}
        onChange={(id) => setKind(id as ExchangeKind)}
        aria-label={t('create-kind', { defaultValue: 'Exchange type' })}
      />
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={80}
        placeholder={t('create-name', { defaultValue: 'Name, e.g. Winter Secret Santa' })}
        aria-label={t('create-name', { defaultValue: 'Name, e.g. Winter Secret Santa' })}
      />
      {kind === 'MIXTAPE' ? (
        <Input
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          maxLength={80}
          placeholder={t('create-theme', { defaultValue: 'Theme, e.g. songs for a rainy day' })}
          aria-label={t('create-theme', { defaultValue: 'Theme, e.g. songs for a rainy day' })}
        />
      ) : (
        <div className="space-y-1">
          <label htmlFor="ex-budget" className="site-section-label block">
            {t('create-budget', { defaultValue: 'Budget per gift (coins)' })}
          </label>
          <Input
            id="ex-budget"
            type="number"
            min={10}
            max={10000}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="ex-draw" className="site-section-label block">
            {t('create-draw', { defaultValue: 'Sign-ups close and the draw runs' })}
          </label>
          <Input
            id="ex-draw"
            type="datetime-local"
            value={drawAt}
            onChange={(e) => setDrawAt(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="ex-reveal" className="site-section-label block">
            {t('create-reveal', { defaultValue: 'Everyone sees who gave to whom' })}
          </label>
          <Input
            id="ex-reveal"
            type="datetime-local"
            value={revealAt}
            onChange={(e) => setRevealAt(e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="accent"
          size="sm"
          disabled={!valid}
          loading={create.isPending}
        >
          {t('create-submit', { defaultValue: 'Create exchange' })}
        </Button>
      </div>
    </form>
  );
}

export default function ExchangesPage() {
  const { t } = useTranslation('f-gifting');
  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: () => apiJson<{ exchanges: ExchangeSummary[] }>('/api/gift-exchanges'),
  });
  const statusLabel: Record<string, string> = {
    OPEN: t('status-open', { defaultValue: 'Open' }),
    DRAWN: t('status-drawn', { defaultValue: 'Drawn' }),
    FAILED: t('status-failed', { defaultValue: 'Not drawn' }),
    CANCELLED: t('status-cancelled', { defaultValue: 'Cancelled' }),
  };

  return (
    <div className="space-y-4 p-4">
      <CreateForm />
      <section aria-labelledby="ex-mine" className="space-y-2">
        <h2 id="ex-mine" className="site-section-label px-1">
          {t('list-title', { defaultValue: 'Your exchanges' })}
        </h2>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !data || data.exchanges.length === 0 ? (
          <EmptyState
            icon={Gift}
            title={t('list-empty', { defaultValue: 'No exchanges yet' })}
            description={t('list-empty-desc', {
              defaultValue: 'Start one above, or open a link a friend sent you.',
            })}
          />
        ) : (
          <ul className="space-y-2">
            {data.exchanges.map((e) => (
              <li key={e.id}>
                <Link
                  to="/exchange/$id"
                  params={{ id: e.id }}
                  className="glass-fill flex items-center justify-between gap-3 rounded-site-sm p-3 hover:text-site-accent"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {e.kind === 'MIXTAPE' ? (
                      <Music className="size-4 shrink-0" aria-hidden />
                    ) : (
                      <Gift className="size-4 shrink-0" aria-hidden />
                    )}
                    <span className="truncate text-sm font-medium">{e.title}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-site-text-muted">
                    {t('list-members', { defaultValue: '{{count}} members', count: e.memberCount })}
                    <Badge variant={e.status === 'DRAWN' ? 'success' : 'default'}>
                      {statusLabel[e.status]}
                    </Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
