import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { CardImage } from '@/lib/study/card-images';

/**
 * A card's picture (s08-15): above the text on its side, a picture box (S4: 8 px radius, 1 px rule, the subtle
 * ground) no taller than 45 % of the viewport, the whole picture shown (`object-contain`), `alt` from the member's
 * description. It opens at full size in a dialog on a click or tap; the dialog is named by the description too.
 * Below the fold it loads lazily; the one the review is about to show passes `eager`.
 */
export function CardPicture({
  image,
  eager = false,
  compact = false,
  className = '',
}: {
  image: CardImage;
  eager?: boolean;
  /** A list row: the picture is shown small (8 rem high) instead of up to 45 % of the viewport. */
  compact?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={`flex w-full cursor-zoom-in justify-center overflow-hidden rounded-site border border-site-border bg-site-bg-subtle ${className}`}
      >
        <img
          src={image.url}
          alt={image.alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className={`${compact ? 'max-h-32' : 'max-h-[45vh]'} w-auto max-w-full object-contain`}
        />
      </button>
      {open && (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent className="flex max-h-[90dvh] w-full max-w-4xl flex-col gap-3" aria-describedby={undefined}>
            <DialogTitle className="t-body break-words" dir="auto">
              {image.alt}
            </DialogTitle>
            <div className="flex min-h-0 justify-center overflow-auto rounded-site border border-site-border bg-site-bg-subtle">
              <img src={image.url} alt={image.alt} className="max-h-[75dvh] w-auto max-w-full object-contain" />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/** Preload the picture a review will show next (the next card's only, never the whole deck's). */
export function usePreloadPicture(image: CardImage | null | undefined): void {
  const url = image?.url;
  useEffect(() => {
    if (!url || typeof Image === 'undefined') return;
    const el = new Image();
    el.src = url;
  }, [url]);
}
