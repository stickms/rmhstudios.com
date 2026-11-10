/* eslint-disable local/no-adhoc-spinner -- in-button busy icon or inline status: <Spinner> renders role="status" and would join the control accessible name */
import { useState } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/contract/client';
import { HttpError, serverError } from '@/lib/http';
import { favoriteHomeListingApi, unfavoriteHomeListingApi } from '@/lib/homes/homes.contract';

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
      await api(next ? favoriteHomeListingApi : unfavoriteHomeListingApi, {
        params: { id: listingId },
      });
      onChange?.(next);
    } catch (err) {
      setIsFav(!next);
      toast.error(
        serverError(err) ??
          (err instanceof HttpError
            ? 'Could not update favorites'
            : err instanceof Error
              ? err.message
              : 'Something went wrong'),
      );
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
        className="grid h-9 w-9 place-items-center rounded-full bg-site-media-scrim text-site-media-ink  transition hover:bg-site-media-scrim-hover active:scale-95"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Heart className={`h-4 w-4 ${isFav ? 'fill-site-danger text-site-danger' : ''}`} />
        )}
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant={isFav ? 'accent-outline' : 'secondary'}
      onClick={toggle}
      loading={busy}
      className={isFav ? 'border-site-danger/40 text-site-danger hover:bg-site-danger/10' : ''}
    >
      {!busy && <Heart className={`h-4 w-4 ${isFav ? 'fill-site-danger text-site-danger' : ''}`} />}
      {isFav ? 'Saved' : 'Save'}
    </Button>
  );
}
