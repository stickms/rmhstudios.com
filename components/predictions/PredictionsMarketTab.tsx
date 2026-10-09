'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Spinner } from '@/components/ui/spinner';
import { PredictionCard } from './PredictionCard';
import { useSignInPrompt } from '@/hooks/useSignInPrompt';
import { CreatePredictionModal } from './CreatePredictionModal';
import type { Market } from './types';
import { Reveal } from '@/components/motion';

interface Props {
  coins: number;
  setCoins: (coins: number) => void;
  /** Signed-out visitors read the markets; trading and creating ask first. */
  signedIn: boolean;
}

type Filter = 'open' | 'resolved' | 'mine';

export function PredictionsMarketTab({ coins, setCoins, signedIn }: Props) {
  const { t } = useTranslation('c-predictions');
  const promptSignIn = useSignInPrompt();
  const [filter, setFilter] = useState<Filter>('open');
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback((f: Filter) => {
    setLoading(true);
    fetch(`/api/predictions?filter=${f}`)
      .then((r) => r.json())
      .then((data) => setMarkets(data.markets ?? []))
      .catch(() => setMarkets([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  const handleUpdated = (m: Market) => {
    setMarkets((prev) => prev.map((x) => (x.id === m.id ? m : x)));
  };

  const handleCreated = (m: Market) => {
    // New submissions are PENDING; surface them under the "mine" filter.
    if (filter === 'mine') setMarkets((prev) => [m, ...prev]);
  };

  const filters: { id: Filter; label: string }[] = [
    { id: 'open', label: t('filter-open', { defaultValue: 'Open' }) },
    { id: 'resolved', label: t('filter-resolved', { defaultValue: 'Resolved' }) },
    { id: 'mine', label: t('filter-mine', { defaultValue: 'Mine' }) },
  ];

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4">
      {/* Filter row + create. The filters were a hand-rolled row of tinted
          buttons with no tab semantics and their own active style — a third
          switcher look on the same page as the Markets/Games strip above it.
          They are the shared strip now, small, at the width three short labels
          need. */}
      <div className="flex items-center gap-2">
        <LiquidTabs
          size="sm"
          className="w-auto min-w-0 max-w-xs flex-1"
          tabs={filters}
          value={filter}
          onChange={(id) => setFilter(id as Filter)}
          aria-label={t('filter-aria-label', { defaultValue: 'Filter markets' })}
        />
        <Button
          variant="accent"
          size="sm"
          className="ml-auto"
          onClick={() =>
            signedIn
              ? setCreateOpen(true)
              : promptSignIn(t('create-sign-in', { defaultValue: 'Sign in to open a market.' }))
          }
        >
          <Plus className="w-4 h-4 mr-1" />
          {t('create', { defaultValue: 'Create' })}
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      ) : markets.length === 0 ? (
        <Reveal className="flex flex-col items-center justify-center py-16 text-center gap-3 text-site-text-dim">
          <TrendingUp className="w-10 h-10 opacity-40" />
          <p className="text-sm max-w-xs">
            {filter === 'mine'
              ? t('empty-mine', { defaultValue: "You haven't created or traded any predictions yet." })
              : filter === 'resolved'
                ? t('empty-resolved', { defaultValue: 'No resolved markets yet.' })
                : t('empty-open', { defaultValue: 'No open markets right now. Create the first one!' })}
          </p>
        </Reveal>
      ) : (
        <Reveal className="grid gap-3 sm:grid-cols-2">
          {markets.map((m) => (
            <PredictionCard
              key={m.id}
              market={m}
              coins={coins}
              setCoins={setCoins}
              onUpdated={handleUpdated}
              signedIn={signedIn}
            />
          ))}
        </Reveal>
      )}

      <CreatePredictionModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
