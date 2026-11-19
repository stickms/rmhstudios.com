/**
 * ListingRows — the Store's Cards and Products tabs: things other members sell,
 * as rows on 1px rules (R3), one `ListingView` per row whatever its kind.
 *
 * Each row is one link to the thing's own page, where it is bought (a card's
 * market page, a creator's storefront), so the money paths stay where they
 * are. The price is the one `CoinAmount`; the count says how many are on offer
 * (cards) or how many have sold (products).
 */
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { CoinAmount } from '@/components/shop/CoinAmount';
import { EmptyState } from '@/components/ui/empty-state';
import type { ListingView } from '@/lib/listings/views';

export function ListingRows({
  rows,
  empty,
}: {
  rows: ListingView[];
  /** What to say when nothing is on sale. */
  empty: string;
}) {
  const { t } = useTranslation('site');
  if (rows.length === 0) return <EmptyState title={empty} />;
  return (
    <ul data-slot="listing-rows" className="border-t border-site-border">
      {rows.map((row) => (
        <li key={`${row.kind}:${row.id}`} className="border-b border-site-border">
          <Link
            to={row.href as string}
            {...(row.search ? { search: row.search } : {})}
            className="flex items-center gap-4 px-4 py-3 transition-[background-color] duration-site hover:bg-site-bg-subtle"
          >
            <span className="min-w-0 flex-1">
              <span className="t-body block truncate text-site-text">{row.title}</span>
              {row.detail && (
                <span className="t-meta block truncate">{row.detail}</span>
              )}
            </span>
            <span className="t-meta shrink-0">
              {row.kind === 'card'
                ? t('listing-rows-on-offer', { defaultValue: '{{n}} on offer', n: row.count })
                : t('listing-rows-sold', { defaultValue: '{{n}} sold', n: row.count })}
            </span>
            <CoinAmount amount={row.priceCoins} className="t-body text-site-text" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
