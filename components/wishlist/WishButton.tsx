'use client';

import { useState } from 'react';
import { Heart } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { WishlistEntityType } from '@/lib/wishlist/types';

/**
 * WishButton (§8) — add/remove an item from the wishlist. Optimistic; the
 * caller passes the known `initialWished` state. Reusable across shop items,
 * market cosmetics, and creator-builds follow.
 */
export function WishButton({
  entityType,
  entityId,
  initialWished = false,
  label,
}: {
  entityType: WishlistEntityType;
  entityId: string;
  initialWished?: boolean;
  /** Optional visible text (e.g. "Notify me"); icon-only when omitted. */
  label?: string;
}) {
  const { t } = useTranslation('c-wishlist');
  const [wished, setWished] = useState(initialWished);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    const next = !wished;
    setBusy(true);
    setWished(next);
    try {
      const res = await fetch('/api/wishlist', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, entityId }),
      });
      if (!res.ok) throw new Error('wishlist failed');
      if (next) toast.success(t('added', { defaultValue: 'Added to wishlist' }));
    } catch {
      setWished(!next);
      toast.error(t('error', { defaultValue: "Couldn't update your wishlist" }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant={wished ? 'accent-outline' : 'outline'}
      size="sm"
      onClick={toggle}
      disabled={busy}
      aria-pressed={wished}
    >
      <Heart className={cn('h-4 w-4', wished && 'fill-current')} aria-hidden />
      {label ?? (wished ? t('wished', { defaultValue: 'Wishlisted' }) : t('wish', { defaultValue: 'Wishlist' }))}
    </Button>
  );
}
