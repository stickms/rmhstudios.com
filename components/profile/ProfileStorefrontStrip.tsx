/**
 * The creator's shop on their profile: a row of their products under the header, each a link to the storefront.
 *
 * It replaced a bare "Storefront" link in the meta row, which every profile showed whether or not the person sold
 * anything. Now the row appears only when there is something to buy; on your own profile with no products it offers
 * "Open your shop" (the storefront page is where products are added); anyone else's empty shop shows nothing.
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HorizontalScroller } from '@/components/ui/horizontal-scroller';
import { CoinAmount } from '@/components/shop/CoinAmount';
import { useArrival } from '@/components/ui/arrive';
import { storefrontQuery } from '@/lib/storefront/storefront.queries';
import { cn } from '@/lib/utils';

/** How many products the strip shows before "See all". */
const STRIP_LIMIT = 12;

export function ProfileStorefrontStrip({
  userKey,
  isOwnProfile,
}: {
  /** Handle or id, as the storefront URL takes it. */
  userKey: string;
  isOwnProfile: boolean;
}) {
  const { t } = useTranslation('feed');
  const { data } = useQuery(storefrontQuery(userKey));
  // Only products the visitor can buy; the owner also sees their inactive drafts on the storefront page itself.
  const products = (data?.products ?? []).filter((p) => p.active).slice(0, STRIP_LIMIT);
  const arrival = useArrival(!!data);
  const storeHref = `/store/${userKey}`;

  if (!data) return null;

  if (products.length === 0) {
    if (!isOwnProfile) return null;
    return (
      <div className={cn('profile-head__block flex items-center justify-between gap-4', arrival)}>
        <span className="min-w-0">
          <span className="t-label block text-site-text">
            {t('profile-shop-empty-title', {
              defaultValue: 'Your shop',
            })}
          </span>
          <span className="t-body block text-site-text-muted">
            {t('profile-shop-empty-hint', {
              defaultValue: 'Sell downloads and extras to people who follow you.',
            })}
          </span>
        </span>
        <Button asChild variant="default" size="sm">
          <Link to={storeHref as string}>
            <Store aria-hidden />
            {t('profile-shop-open', {
              defaultValue: 'Open your shop',
            })}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <section className={cn('profile-head__block', arrival)} aria-labelledby="profile-shop-title">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <h2 id="profile-shop-title" className="t-label text-site-text">
          {t('profile-shop-title', {
            defaultValue: 'Shop',
          })}
        </h2>
        <Link to={storeHref as string} className="t-meta inline-flex items-center gap-1">
          {t('profile-shop-see-all', {
            defaultValue: 'See all',
          })}
          <ChevronRight className="size-3 rtl:-scale-x-100" aria-hidden />
        </Link>
      </div>
      <HorizontalScroller
        aria-label={t('profile-shop-products', {
          defaultValue: 'Products',
        })}
        surface="none"
      >
        {products.map((p) => (
          <Link
            key={p.id}
            to={storeHref as string}
            className="flex w-48 shrink-0 flex-col gap-1 rounded-site border border-site-border px-3 py-2.5 transition-colors duration-(--m1) ease-[ease] hover:bg-site-bg-subtle"
          >
            <span className="line-clamp-2 text-sm font-medium text-site-text">{p.title}</span>
            <span className="t-meta flex items-center gap-2">
              <CoinAmount amount={p.price} />
              {p.owned ? (
                <span>
                  {t('profile-shop-owned', {
                    defaultValue: 'Owned',
                  })}
                </span>
              ) : null}
            </span>
          </Link>
        ))}
      </HorizontalScroller>
    </section>
  );
}
