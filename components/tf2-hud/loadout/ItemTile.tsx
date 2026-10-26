/**
 * One item in a loadout slot or the picker: its inventory icon (when the Steam
 * schema supplied one) or a lettered placeholder, edged in the item's quality
 * colour, with its paint as a dot.
 */
'use client';

import { useState } from 'react';
import {
  iconUrl,
  qualityAccent,
  type CatalogItem,
  type CatalogPaint,
} from '@/lib/tf2-loadout/catalog-types';
import { cn } from '@/lib/utils';

function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .split(/\s+/)
    .filter(Boolean);
  return (
    words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)
  ).toUpperCase();
}

export function ItemIcon({ item, className }: { item: CatalogItem; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = iconUrl(item);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
        className={cn('size-full object-contain', className)}
      />
    );
  }
  // No icon (none supplied yet, or it failed to load): the item's initials, so a
  // grid of them is still scannable.
  return (
    <span
      aria-hidden
      className={cn(
        'tf2hud-title flex size-full items-center justify-center text-2xl tracking-wide text-(--app-text-dim)',
        className,
      )}
    >
      {initials(item.n)}
    </span>
  );
}

export default function ItemTile({
  item,
  paint,
  selected,
  label,
  onClick,
  className,
}: {
  item: CatalogItem;
  paint?: CatalogPaint;
  selected?: boolean;
  /** Accessible name; defaults to the item name. */
  label?: string;
  onClick?: () => void;
  className?: string;
}) {
  const body = (
    <>
      <ItemIcon item={item} />
      {paint ? (
        <span
          aria-hidden
          className="absolute end-1 top-1 size-3 rounded-full border border-(--app-bg)"
          style={{ background: paint.rgb }}
        />
      ) : null}
    </>
  );
  const common = cn(
    'relative block aspect-[5/4] w-full overflow-hidden rounded-(--app-radius-sm) border-2 border-(--app-border) bg-(--app-bg) p-1',
    selected && 'ring-2 ring-(--app-accent)',
    className,
  );
  const accent = qualityAccent(item.q);
  const style = accent ? { borderColor: accent } : undefined;
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ?? item.n}
      aria-pressed={selected}
      title={item.n}
      style={style}
      className={cn(
        common,
        'transition-[box-shadow] duration-(--app-duration-fast) hover:ring-2 hover:ring-(--app-border-bright)',
      )}
    >
      {body}
    </button>
  ) : (
    <span title={item.n} style={style} className={common}>
      {body}
    </span>
  );
}
