import { ArrowDownWideNarrow } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ListJobsFilters } from '@/lib/rmhladder/server/queries';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';

const FLOORS = [40_000, 60_000, 80_000, 100_000, 150_000];

/** Minimum-pay floor and "highest pay first" for the jobs list (F7). */
export function PayFilter({
  search,
  onUpdate,
}: {
  search: ListJobsFilters;
  onUpdate: (patch: Partial<ListJobsFilters>) => void;
}) {
  const { t } = useTranslation('f-ladder-homes');
  const byPay = search.sort === 'pay';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={String(search.minPay ?? '')}
        aria-label={t('pay-min-label', { defaultValue: 'Minimum annualized pay' })}
        onChange={(e) => onUpdate({ minPay: e.target.value ? Number(e.target.value) : undefined })}
      >
        <option value="">{t('pay-any', { defaultValue: 'Any pay' })}</option>
        {FLOORS.map((n) => (
          <option key={n} value={String(n)}>
            {t('pay-at-least', { defaultValue: 'At least ${{k}}k/yr', k: n / 1000 })}
          </option>
        ))}
      </Select>
      <Button
        type="button"
        size="sm"
        variant={byPay ? 'accent' : 'outline'}
        aria-pressed={byPay}
        className="min-h-11"
        onClick={() => onUpdate({ sort: byPay ? undefined : 'pay' })}
      >
        <ArrowDownWideNarrow aria-hidden />
        {t('pay-sort', { defaultValue: 'Highest pay first' })}
      </Button>
      <p className="text-xs text-site-text-muted">
        {t('pay-note', { defaultValue: 'Only postings that state their pay are filtered by it.' })}
      </p>
    </div>
  );
}
