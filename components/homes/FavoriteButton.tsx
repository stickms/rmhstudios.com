'use client';

import { useState } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface FavoriteButtonProps {
  listingId: string;
  favorited: boolean;
  onChange?: (favorited: boolean) => void;
  /** Compact icon-only variant for cards. */
  compact?: boolean;
}

/**
 * Heart toggle that favorites/unfavorites a listing. Optimistic with rollback.
 */
export function FavoriteButton({ listingId, favorited, onChange, compact }: FavoriteButtonProps) {
  const [isFav, setIsFav] = useState(favorited);
  const [busy, setBusy] = useState(false);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;

    const next = !isFav;
    setIsFav(next);
    setBusy(true);
    try {
      const res = await fetch(`/api/homes/listings/${encodeURIComponent(listingId)}/favorite`, {
        method: next ? 'POST' : 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not update favorites');
      }
      onChange?.(next);
    } catch (err) {
      setIsFav(!next);
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={isFav}
        aria-label={isFav ? 'Remove from saved' : 'Save listing'}
        className="grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65 active:scale-90"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Heart className={`h-4 w-4 ${isFav ? 'fill-rose-500 text-rose-500' : ''}`} />
        )}
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant={isFav ? 'accent-outline' : 'secondary'}
      onClick={toggle}
      className={isFav ? 'border-rose-500/40 text-rose-400 hover:bg-rose-500/10' : ''}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Heart className={`h-4 w-4 ${isFav ? 'fill-rose-500 text-rose-500' : ''}`} />
      )}
      {isFav ? 'Saved' : 'Save'}
    </Button>
  );
}
