/* eslint-disable local/no-adhoc-spinner -- in-button busy icon or inline status: <Spinner> renders role="status" and would join the control accessible name */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart, Loader2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { api } from '@/lib/contract/client';
import { HttpError, serverError } from '@/lib/http';
import { favoriteHomeListingApi, unfavoriteHomeListingApi } from '@/lib/homes/homes.contract';

interface FavoriteButtonProps {
  listingId: string;
  favorited: boolean;
  onChange?: (favorited: boolean) => void;
  /** Compact icon-only variant for cards. */
  compact?: boolean;
  /**
   * The compact control sits on a photograph (a card's picture): it takes the `--site-media-*` chip so it
   * reads on any image. Off a picture (a list row) it is a plain borderless icon control.
   */
  onMedia?: boolean;
}

/**
 * Heart toggle that favorites/unfavorites a listing. Optimistic with rollback.
 */
export function FavoriteButton({
  listingId,
  favorited,
  onChange,
  compact,
  onMedia = true,
}: FavoriteButtonProps) {
  const { t } = useTranslation('site');
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
            ? t('homes-save-failed', { defaultValue: 'Could not update your saved listings' })
            : err instanceof Error
              ? err.message
              : t('homes-save-error', { defaultValue: 'Something went wrong. Try again.' })),
      );
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    // 44px square in both places (A3). No scale on press and no hover lift: the fill is the response (M1).
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={isFav}
        aria-label={
          isFav
            ? t('homes-unsave-listing', { defaultValue: 'Remove from saved' })
            : t('homes-save-listing', { defaultValue: 'Save listing' })
        }
        className={cn(
          'grid size-11 place-items-center transition-colors duration-(--m1)',
          onMedia
            ? 'rounded-full bg-site-media-scrim text-site-media-ink hover:bg-site-media-scrim-hover'
            : 'rounded-site text-site-text-muted hover:bg-site-bg-subtle hover:text-site-text',
        )}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Heart
            className={cn('size-4', isFav && 'fill-site-danger text-site-danger')}
            aria-hidden
          />
        )}
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant={isFav ? 'default' : 'default'}
      onClick={toggle}
      loading={busy}
      className={isFav ? 'border-site-danger/40 text-site-danger hover:bg-site-danger/10' : ''}
    >
      {!busy && <Heart className={`h-4 w-4 ${isFav ? 'fill-site-danger text-site-danger' : ''}`} />}
      {isFav
        ? t('homes-saved', { defaultValue: 'Saved' })
        : t('homes-save', { defaultValue: 'Save' })}
    </Button>
  );
}
