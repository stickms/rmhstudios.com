'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Heart, Trash2, Gift } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { EmptyState } from '@/components/ui/empty-state';
import type { WishlistItemView } from '@/lib/wishlist/types';

export function WishlistView({ initial }: { initial: WishlistItemView[] }) {
  const { t } = useTranslation('c-wishlist');
  const [items, setItems] = useState(initial);

  async function remove(item: WishlistItemView) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    try {
      await fetch('/api/wishlist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: item.entityType, entityId: item.entityId }),
      });
    } catch {
      toast.error(t('error', { defaultValue: "Couldn't update your wishlist" }));
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Heart}
        title={t('empty-title', { defaultValue: 'Your wishlist is empty' })}
        description={t('empty-desc', {
          defaultValue: 'Wishlist shop items and creators to get notified.',
        })}
      />
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id}>
          <Card interactive className="flex-row items-center gap-3 px-4 py-3">
            <Gift className="h-5 w-5 shrink-0 text-site-accent" aria-hidden />
            <span className="min-w-0 flex-1">
              {item.href ? (
                <a href={item.href} className="block truncate text-sm font-medium text-site-text hover:underline">
                  {item.title}
                </a>
              ) : (
                <span className="block truncate text-sm font-medium text-site-text">{item.title}</span>
              )}
              {item.targetPrice != null ? (
                <span className="block text-xs text-site-text-muted">
                  {t('target', { defaultValue: 'Alert under' })} {item.targetPrice}
                </span>
              ) : null}
            </span>
            <IconButton
              icon={Trash2}
              variant="ghost"
              size="icon-sm"
              onClick={() => remove(item)}
              label={t('remove', { defaultValue: 'Remove' })}
            />
          </Card>
        </li>
      ))}
    </ul>
  );
}
