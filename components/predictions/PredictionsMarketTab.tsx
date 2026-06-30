'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PredictionCard } from './PredictionCard';
import { CreatePredictionModal } from './CreatePredictionModal';
import type { Market } from './types';

interface Props {
  coins: number;
  setCoins: (coins: number) => void;
}

type Filter = 'open' | 'resolved' | 'mine';

export function PredictionsMarketTab({ coins, setCoins }: Props) {
  const { t } = useTranslation('c-predictions');
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
      {/* Filter row + create */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-site-sm text-sm font-medium transition-colors ${
                filter === f.id
                  ? 'bg-site-accent-dim text-site-accent'
                  : 'text-site-text-dim hover:text-site-text hover:bg-site-surface'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button variant="accent" size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          {t('create', { defaultValue: 'Create' })}
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 text-site-accent animate-spin" />
        </div>
      ) : markets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3 text-site-text-dim">
          <TrendingUp className="w-10 h-10 opacity-40" />
          <p className="text-sm max-w-xs">
            {filter === 'mine'
              ? t('empty-mine', { defaultValue: "You haven't created or traded any predictions yet." })
              : filter === 'resolved'
                ? t('empty-resolved', { defaultValue: 'No resolved markets yet.' })
                : t('empty-open', { defaultValue: 'No open markets right now. Create the first one!' })}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {markets.map((m) => (
            <PredictionCard
              key={m.id}
              market={m}
              coins={coins}
              setCoins={setCoins}
              onUpdated={handleUpdated}
            />
          ))}
        </div>
      )}

      <CreatePredictionModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
