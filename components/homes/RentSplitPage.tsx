import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import {
  parseRentSplit,
  serializeRentSplit,
  type RentSplitSearch,
  type RentSplitState,
} from '@/lib/homes/rent-split-url';
import { RentSplitCalculator } from './RentSplitCalculator';

/** Standalone fair-rent-split page body (F10); `onChange` mirrors the state into the URL. */
export function RentSplitPage({
  search,
  onSearch,
}: {
  search: RentSplitSearch;
  onSearch: (next: Required<RentSplitSearch>) => void;
}) {
  const { t } = useTranslation('f-ladder-homes');
  // Parsed once: later edits flow out to the URL, never back in.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => parseRentSplit(search), []);
  return (
    <PageLayout title={t('rsp-page-title', { defaultValue: 'Fair rent split' })}>
      <div className="mx-auto max-w-3xl px-4 pb-12">
        <p className="mb-5 text-sm text-site-text-muted">
          {t('rsp-page-intro', {
            defaultValue:
              'Rent = a shared part split evenly + a private part split by room points (area × feature multipliers). Change anything; the link updates so you can send it to your roommates.',
          })}
        </p>
        <RentSplitCalculator
          initial={initial}
          onChange={(s: RentSplitState) => onSearch(serializeRentSplit(s))}
        />
      </div>
    </PageLayout>
  );
}
