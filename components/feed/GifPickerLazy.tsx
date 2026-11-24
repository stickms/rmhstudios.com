import { lazy, type ComponentProps } from 'react';
import { ArrivalSuspense } from '@/components/ui/arrive';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * `GifPicker`, loaded when a picker is opened rather than with the composer, chat or
 * comment box that offers one.
 *
 * Every surface with a GIF button imported the picker (search, paging, Klipy result
 * rendering) statically, so opening a conversation or a post's comments downloaded it
 * whether or not anyone reached for a GIF (low-bandwidth audit, 2026-11-18). Every
 * caller already renders the picker only once it is opened, so the chunk is now
 * requested at that moment. Until it arrives the panel holds the picker's own shape —
 * its frame, a field-height search block and a grid of result blocks inside the same
 * scrolling height — as still blocks (M6: nothing shimmers), and the picker fades in
 * over it (M9).
 */
const GifPickerInner = lazy(() =>
  import('./GifPicker').then((m) => ({
    default: m.GifPicker,
  })),
);

type GifPickerProps = ComponentProps<typeof GifPickerInner>;

function GifPickerSkeleton({ className = '', listClassName = 'max-h-72' }: GifPickerProps) {
  return (
    <div className={`border-t border-site-border pt-4 ${className}`} aria-hidden>
      <Skeleton className="mb-2 h-9 w-full rounded-site-sm" />
      <div className={`${listClassName} overflow-hidden`}>
        <div className="grid grid-cols-2 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-site-sm" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function GifPicker(props: GifPickerProps) {
  return (
    <ArrivalSuspense fallback={<GifPickerSkeleton {...props} />}>
      <GifPickerInner {...props} />
    </ArrivalSuspense>
  );
}
