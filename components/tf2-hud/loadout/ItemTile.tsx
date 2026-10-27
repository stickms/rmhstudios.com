/**
 * One item in a loadout slot or the picker: its inventory icon (when the Steam
 * schema supplied one) or a lettered placeholder, edged in the item's quality
 * colour, with its paint as a dot. A tiered item sits on its tier's colour (the HUD's own), and one that
 * can only be equipped around Halloween carries the Halloween mark in its corner.
 */
'use client';

import { useState } from 'react';
import { Ghost } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { rarityBackground } from '@/lib/tf2-loadout/rarity';
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
  // The icon synced from the game's own files first; then Steam's CDN if the catalog carries
  // a path for it; then initials.
  // A decorated weapon has no icon of its own in the game files: it shows its base weapon's.
  const sources = [
    `/api/tf2-loadout/icons/${item.id}`,
    iconUrl(item),
    item.sk ? `/api/tf2-loadout/icons/${item.sk.base}` : null,
  ].filter((u): u is string => !!u);
  // Per item, so a recycled tile starts over with the first source.
  const [attempt, setAttempt] = useState({ id: item.id, n: 0 });
  const tried = attempt.id === item.id ? attempt.n : 0;
  const src = sources[tried];
  if (src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setAttempt({ id: item.id, n: tried + 1 })}
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
  const { t } = useTranslation('c-tf2-hud');
  const halloween = t('halloween-only', { defaultValue: 'Halloween only' });
  const body = (
    <>
      <ItemIcon item={item} />
      {item.hr ? (
        <span
          title={halloween}
          className="absolute start-1 top-1 inline-flex size-4 items-center justify-center rounded-full bg-(--app-bg) text-(--app-accent)"
        >
          <Ghost className="size-3" aria-hidden />
          <span className="sr-only">{halloween}</span>
        </span>
      ) : null}
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
  const style =
    accent || item.rt
      ? {
          ...(accent ? { borderColor: accent } : {}),
          ...(item.rt ? { backgroundColor: rarityBackground(item.rt) } : {}),
        }
      : undefined;
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
