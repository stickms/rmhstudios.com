import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The store's product grid: tiles as wide as their content needs and no narrower, as many per row
 * as fit. Sized from the column, not the viewport: two per row on a phone, four or five in the
 * wide desktop column.
 */
export const PRODUCT_GRID =
  'grid grid-cols-[repeat(auto-fill,minmax(min(100%,9.5rem),1fr))] gap-x-4 gap-y-6';

/**
 * One product in the grid: a picture with its caption under it. The whole tile is one button that
 * opens the item.
 *
 * A bordered box is a control or a picture (R3): here it is the picture, and the caption sits on
 * the page under it. Hover and focus turn the picture's border ink in 90 ms (M1); nothing lifts,
 * glows or covers the picture.
 */
export function ProductTile({
  picture,
  name,
  detail,
  trailing,
  footer,
  onOpen,
  label,
  className,
}: {
  /** The picture box (`ItemPicture`). */
  picture: ReactNode;
  name: ReactNode;
  /** Under the name, at the start: the rarity. */
  detail?: ReactNode;
  /** Under the name, at the end: the price, or the owned or equipped state. */
  trailing?: ReactNode;
  /** A last line (the seller of a listing). */
  footer?: ReactNode;
  onOpen: () => void;
  /** The accessible name, when the visible caption is not enough ("Sunset, common, 100 coins"). */
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-slot="product-tile"
      onClick={onOpen}
      aria-label={label}
      aria-haspopup="dialog"
      className={cn(
        'group flex min-w-0 flex-col gap-2 rounded-site text-start [&_[data-slot=item-picture]]:transition-[border-color] [&_[data-slot=item-picture]]:duration-(--m1) hover:[&_[data-slot=item-picture]]:border-site-text focus-visible:[&_[data-slot=item-picture]]:border-site-text',
        className,
      )}
    >
      {picture}
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-sm font-medium text-site-text">{name}</span>
        {detail || trailing ? (
          <span className="t-meta flex min-w-0 items-center justify-between gap-2">
            {detail}
            {trailing}
          </span>
        ) : null}
        {footer ? <span className="t-meta min-w-0 truncate">{footer}</span> : null}
      </span>
    </button>
  );
}
