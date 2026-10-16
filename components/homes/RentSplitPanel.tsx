import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { RentSplitState } from '@/lib/homes/rent-split-url';
import { RentSplitCalculator } from './RentSplitCalculator';

/** Collapsed-by-default fair-rent-split calculator for multi-bedroom rentals (F10). */
export function RentSplitPanel({
  rent,
  beds,
  sqft,
}: {
  rent: number;
  beds: number;
  sqft: number | null;
}) {
  const { t } = useTranslation('f-ladder-homes');
  const [open, setOpen] = useState(false);
  const count = Math.min(8, Math.max(2, beds));
  const area = sqft ? Math.max(20, Math.round(sqft / count)) : 120;
  const initial: RentSplitState = {
    rent: Math.round(rent),
    shared: 30,
    rooms: Array.from({ length: count }, (_, i) => ({ name: `Room ${i + 1}`, area, features: [] })),
  };
  return (
    <section className="mt-5">
      <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-site-text font-display">
        <Scale className="size-5" aria-hidden />
        {t('rsp-heading', { defaultValue: 'Splitting this with roommates?' })}
      </h2>
      <p className="mb-3 text-sm text-site-text-muted">
        {t('rsp-body', {
          defaultValue: 'Work out what each room should pay, with every number explained.',
        })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open
            ? t('rsp-hide', { defaultValue: 'Hide calculator' })
            : t('rsp-show', { defaultValue: 'Split the rent fairly' })}
        </Button>
        <Button asChild variant="ghost" className="min-h-11">
          <Link to="/homes/rent-split">
            {t('rsp-standalone', { defaultValue: 'Open full page' })}
          </Link>
        </Button>
      </div>
      {open && <RentSplitCalculator className="mt-4" initial={initial} />}
    </section>
  );
}
