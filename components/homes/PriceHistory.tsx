/**
 * The price history of one listing: rows on rules (date, old to new, the change in percent), newest first, up
 * to 20. Nothing is shown when the price has never changed. Dates and money follow the reader's locale.
 */
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiQuery } from '@/lib/contract/client';
import { getHomeListingPricesApi } from '@/lib/homes/prices.contract';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

export function formatUsd(amount: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
      amount,
    );
  } catch {
    // An invalid locale tag: fall back to the plain whole number rather than a hard-coded locale.
    return `$${Math.round(amount)}`;
  }
}

function formatPercent(percent: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits: 1,
      signDisplay: 'exceptZero',
    }).format(percent / 100);
  } catch {
    return `${percent > 0 ? '+' : ''}${percent}%`;
  }
}

export function PriceHistory({ listingId }: { listingId: string }) {
  const { t, i18n } = useTranslation('listing-prices');
  const locale = i18n.language || 'en';
  const query = useQuery(apiQuery(getHomeListingPricesApi, { params: { id: listingId } }));
  const changes = query.data?.changes ?? [];
  const arrival = useArrival(!query.isPending);

  if (query.isPending) {
    return <Skeleton className="mt-4 h-16 w-full" aria-hidden />;
  }
  if (query.isError) {
    return (
      <p className="t-meta mt-4" role="status">
        {t('history-error', { defaultValue: 'Could not load the price history.' })}
      </p>
    );
  }
  if (changes.length === 0) return null;

  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  return (
    <section className={cn('mt-4', arrival)} aria-labelledby="price-history-heading">
      <h2 id="price-history-heading" className="mb-2 site-section-label">
        {t('history-title', { defaultValue: 'Price history' })}
      </h2>
      <ul className="border-t border-site-border">
        {changes.map((c) => (
          <li key={c.id} className="t-body flex flex-wrap items-baseline gap-x-3 border-b border-site-border py-2">
            <time dateTime={c.changedAt} className="t-meta">
              {date.format(new Date(c.changedAt))}
            </time>
            <span className="whitespace-nowrap">
              {formatUsd(c.oldPrice, locale)} {'→'} {formatUsd(c.newPrice, locale)}
            </span>
            <span className="t-meta ms-auto whitespace-nowrap">{formatPercent(c.percent, locale)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
