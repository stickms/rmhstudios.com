'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { apiJson } from './api';

export interface PickedItem {
  id: string;
  name: string;
  price: number;
}

interface Row extends PickedItem {
  kind: string;
  rarity: string;
}

/**
 * Type-ahead over the cosmetics catalog. The search runs on the server (the
 * catalog is ~1,000 items and never ships to the client for this), debounced,
 * and returns at most a dozen rows.
 */
export function ItemPicker({
  mode,
  picked,
  onPick,
  label,
}: {
  mode: 'any' | 'tradable' | 'giftable';
  picked: PickedItem | null;
  onPick: (item: PickedItem | null) => void;
  label: string;
}) {
  const { t } = useTranslation('f-economy-plus');
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(text.trim()), 250);
    return () => window.clearTimeout(id);
  }, [text]);

  const { data, isFetching } = useQuery({
    queryKey: ['economy-plus', 'item-search', mode, debounced],
    queryFn: () =>
      apiJson<{ items: Row[] }>(`/api/shop/search?mode=${mode}&q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2 && !picked,
    staleTime: 60_000,
  });

  if (picked) {
    return (
      <div className="glass-inset flex items-center justify-between gap-3 rounded-site-sm px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-site-text">{picked.name}</p>
          <p className="flex items-center gap-1 text-xs text-site-text-muted">
            <CoinIcon className="size-3.5" /> {picked.price.toLocaleString()}
          </p>
        </div>
        <button
          type="button"
          className="text-xs font-semibold text-site-accent hover:underline"
          onClick={() => {
            onPick(null);
            setText('');
          }}
        >
          {t('picker-change', { defaultValue: 'Change' })}
        </button>
      </div>
    );
  }

  const rows = data?.items ?? [];
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-site-text-dim"
          aria-hidden
        />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('picker-placeholder', { defaultValue: 'Search items by name…' })}
          aria-label={label}
          className="pl-9"
          maxLength={60}
        />
      </div>
      {debounced.length >= 2 && !isFetching && rows.length === 0 ? (
        <p className="px-1 text-xs text-site-text-muted">
          {t('picker-none', { defaultValue: 'No items match that search.' })}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="glass-fill divide-y divide-site-border overflow-hidden rounded-site-sm">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-site-surface-hover focus-visible:bg-site-surface-hover"
                onClick={() => onPick({ id: row.id, name: row.name, price: row.price })}
              >
                <span className="min-w-0 truncate text-sm text-site-text">{row.name}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-site-text-muted">
                  <CoinIcon className="size-3.5" /> {row.price.toLocaleString()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
