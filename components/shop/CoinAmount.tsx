import { useTranslation } from 'react-i18next';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { cn } from '@/lib/utils';

/**
 * A coin amount: the coin, then the number in the mono face (Steel type: counts and small data).
 * The one way a price or a balance is written in the store. The icon is decorative; the unit is
 * spoken to a screen reader.
 */
export function CoinAmount({ amount, className }: { amount: number; className?: string }) {
  const { t } = useTranslation('feed');
  return (
    <span
      data-slot="coin-amount"
      className={cn('inline-flex shrink-0 items-center gap-1 font-mono tabular-nums', className)}
    >
      <span aria-hidden className="inline-flex">
        <CoinIcon className="size-[1.1em]" />
      </span>
      {amount.toLocaleString()}
      <span className="sr-only">{t('coins-unit', { defaultValue: 'coins' })}</span>
    </span>
  );
}
