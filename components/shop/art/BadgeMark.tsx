import { Emoji } from '@/components/ui/emoji';
import { BadgeArt, hasBadgeArt } from './BadgeArt';

/**
 * The one way a badge or a pet is drawn, wherever it shows (the shop, the market, a post, a profile): its drawn art
 * when the catalog item has one (`data.art`, stamped in `lib/shop/catalog.ts`), its emoji otherwise. A surface that
 * draws `cosmetics.badge.emoji` by hand skips the art, so it goes through here instead.
 */
export function BadgeMark({
  badge,
  size,
  title,
  className,
}: {
  badge: { art?: string; emoji?: string } | undefined | null;
  size: number;
  title?: string;
  className?: string;
}) {
  if (!badge) return null;
  if (hasBadgeArt(badge.art)) {
    return <BadgeArt id={badge.art as string} size={size} className={className} {...(title ? { title } : {})} />;
  }
  if (!badge.emoji) return null;
  return (
    <span className={className} title={title}>
      <Emoji size={size}>{badge.emoji}</Emoji>
    </span>
  );
}
