'use client';

/**
 * RMHHomes — "can I afford it?".
 *
 * A singular panel (L2 `.glass-pane`), not a repeated card: there is one of
 * these per page, above the results.
 *
 * The income figure lives in `localStorage` and nowhere else — no request
 * carries it, no table stores it, and the panel says so in plain words right
 * under the input, with a one-press erase next to it. `lib/homes/affordability`
 * holds the arithmetic; this file only collects numbers and renders them.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator, Lock, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  assessListing,
  clearIncomeProfile,
  DEFAULT_INCOME_PROFILE,
  formatMoney,
  formatMonthly,
  formatShare,
  hasIncome,
  loadIncomeProfile,
  maxAffordablePrice,
  maxAffordableRent,
  MAX_HOUSING_RATIO,
  MIN_HOUSING_RATIO,
  persistIncomeProfile,
  purchaseBreakdown,
  type AffordabilityMode,
  type IncomeProfile,
} from '@/lib/homes/affordability';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

export interface AffordabilityPanelProps {
  /** `'rent'` shows the 30%-rule budget; `'buy'` shows the payment breakdown. */
  mode: AffordabilityMode;
  /**
   * A representative price to break down — usually the listing being viewed, or
   * the median of the current results. Omit to show the ceiling only.
   */
  samplePrice?: number;
  /** Whether the caller is currently hiding results above budget. */
  filterActive?: boolean;
  /** Raised when the profile or the filter toggle changes, so the page can refilter. */
  onChange?: (profile: IncomeProfile, filterActive: boolean) => void;
}

/** Parse a currency-ish input without letting an empty box become NaN. */
function toNumber(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function AffordabilityPanel({
  mode,
  samplePrice,
  filterActive = false,
  onChange,
}: AffordabilityPanelProps) {
  const { t } = useTranslation('site');
  const [profile, setProfile] = useState<IncomeProfile>(DEFAULT_INCOME_PROFILE);
  const [filterOn, setFilterOn] = useState(filterActive);

  // Read on mount only: localStorage is not available during SSR, and hydrating
  // from it in the initial state would mismatch the server-rendered markup.
  useEffect(() => {
    setProfile(loadIncomeProfile());
  }, []);

  const update = useCallback(
    (patch: Partial<IncomeProfile>) => {
      setProfile((prev) => {
        const next = { ...prev, ...patch };
        persistIncomeProfile(next);
        onChange?.(next, filterOn);
        return next;
      });
    },
    [filterOn, onChange],
  );

  const toggleFilter = useCallback(
    (on: boolean) => {
      setFilterOn(on);
      onChange?.(profile, on);
    },
    [onChange, profile],
  );

  const reset = useCallback(() => {
    clearIncomeProfile();
    setProfile({ ...DEFAULT_INCOME_PROFILE });
    setFilterOn(false);
    onChange?.({ ...DEFAULT_INCOME_PROFILE }, false);
    toast.success(t('homes.incomeCleared', { defaultValue: 'Income cleared from this device.' }));
  }, [onChange, t]);

  const known = hasIncome(profile);
  const ceiling = useMemo(
    () => (mode === 'buy' ? maxAffordablePrice(profile) : maxAffordableRent(profile)),
    [mode, profile],
  );
  const breakdown = useMemo(
    () => (mode === 'buy' && samplePrice ? purchaseBreakdown(samplePrice, profile) : null),
    [mode, samplePrice, profile],
  );
  const verdict = useMemo(
    () =>
      samplePrice
        ? assessListing(
            { price: samplePrice, listingType: mode === 'buy' ? 'SALE' : 'RENT' },
            profile,
          )
        : null,
    [samplePrice, mode, profile],
  );

  const ratioPct = Math.round(profile.housingRatio * 100);

  return (
    <section
      className="glass-pane p-4 sm:p-5"
      aria-labelledby="homes-afford-heading"
      data-slot="affordability-panel"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Calculator className="size-4 text-site-accent" aria-hidden />
        <h2 id="homes-afford-heading" className="text-sm font-semibold text-site-text">
          {t('homes.affordTitle', { defaultValue: 'What can I afford?' })}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={reset}
          className="ml-auto min-h-11"
        >
          <RotateCcw className="size-4" aria-hidden />
          {t('homes.affordReset', { defaultValue: 'Clear' })}
        </Button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="homes-afford-income">
            {t('homes.affordIncome', { defaultValue: 'Gross annual income' })}
          </Label>
          <Input
            id="homes-afford-income"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            value={profile.annualIncome === 0 ? '' : String(profile.annualIncome)}
            onChange={(e) => update({ annualIncome: toNumber(e.target.value) })}
            className="mt-1.5"
          />
          <p className="mt-1.5 flex items-start gap-1.5 text-xs text-site-text-dim">
            <Lock className="mt-px size-3 shrink-0" aria-hidden />
            <span>
              {t('homes.affordPrivacy', {
                defaultValue:
                  'Stored on this device only. Your income is never sent to RMH Studios and never leaves your browser.',
              })}
            </span>
          </p>
        </div>

        <div>
          <Label htmlFor="homes-afford-debts">
            {t('homes.affordDebts', { defaultValue: 'Monthly debt payments' })}
          </Label>
          <Input
            id="homes-afford-debts"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            value={profile.monthlyDebts === 0 ? '' : String(profile.monthlyDebts)}
            onChange={(e) => update({ monthlyDebts: toNumber(e.target.value) })}
            className="mt-1.5"
          />
          <p className="mt-1.5 text-xs text-site-text-dim">
            {t('homes.affordDebtsHint', {
              defaultValue: 'Student loans, car payments, minimum card payments.',
            })}
          </p>
        </div>

        <div className="sm:col-span-2">
          <span
            id="homes-afford-ratio-label"
            className="mb-1.5 block text-sm font-medium text-site-text"
          >
            {t('homes.affordRatio', {
              defaultValue: 'Share of income for housing: {{pct}}%',
              pct: ratioPct,
            })}
          </span>
          <Slider
            min={Math.round(MIN_HOUSING_RATIO * 100)}
            max={Math.round(MAX_HOUSING_RATIO * 100)}
            step={1}
            value={[ratioPct]}
            onValueChange={([v]) => update({ housingRatio: v / 100 })}
            aria-labelledby="homes-afford-ratio-label"
          />
          <p className="mt-1.5 text-xs text-site-text-dim">
            {t('homes.affordRatioHint', {
              defaultValue: 'The classic rule is 30% of gross income.',
            })}
          </p>
        </div>

        {mode === 'buy' && (
          <>
            <div>
              <Label htmlFor="homes-afford-down">
                {t('homes.affordDown', { defaultValue: 'Down payment' })}
              </Label>
              <Input
                id="homes-afford-down"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                value={profile.downPayment === 0 ? '' : String(profile.downPayment)}
                onChange={(e) => update({ downPayment: toNumber(e.target.value) })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="homes-afford-rate">
                {t('homes.affordRate', { defaultValue: 'Interest rate (%)' })}
              </Label>
              <Input
                id="homes-afford-rate"
                inputMode="decimal"
                autoComplete="off"
                value={String(profile.interestRate)}
                onChange={(e) => update({ interestRate: toNumber(e.target.value) })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="homes-afford-term">
                {t('homes.affordTerm', { defaultValue: 'Term (years)' })}
              </Label>
              <Input
                id="homes-afford-term"
                inputMode="numeric"
                autoComplete="off"
                value={String(profile.termYears)}
                onChange={(e) => update({ termYears: toNumber(e.target.value) })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="homes-afford-tax">
                {t('homes.affordTax', { defaultValue: 'Property tax rate (%/yr)' })}
              </Label>
              <Input
                id="homes-afford-tax"
                inputMode="decimal"
                autoComplete="off"
                value={String(profile.propertyTaxRate)}
                onChange={(e) => update({ propertyTaxRate: toNumber(e.target.value) })}
                className="mt-1.5"
              />
            </div>
          </>
        )}
      </div>

      {known && (
        <div className="mt-5 border-t border-site-border pt-4">
          <p className="text-sm text-site-text-muted">
            {mode === 'buy'
              ? t('homes.affordCeilingBuy', {
                  defaultValue: 'At this budget you can look up to {{amount}}.',
                  amount: formatMoney(ceiling),
                })
              : t('homes.affordCeilingRent', {
                  defaultValue: 'At this budget your rent ceiling is {{amount}}.',
                  amount: formatMonthly(ceiling),
                })}
          </p>

          {breakdown && (
            <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
              {[
                {
                  term: t('homes.affordPI', { defaultValue: 'Principal + interest' }),
                  value: formatMonthly(breakdown.principalAndInterest),
                },
                {
                  term: t('homes.affordTaxRow', { defaultValue: 'Property tax (est.)' }),
                  value: formatMonthly(breakdown.tax),
                },
                {
                  term: t('homes.affordInsurance', { defaultValue: 'Insurance' }),
                  value: formatMonthly(breakdown.insurance),
                },
                {
                  term: t('homes.affordHoa', { defaultValue: 'HOA' }),
                  value: formatMonthly(breakdown.hoa),
                },
              ].map((row) => (
                <div key={row.term} className="flex items-baseline justify-between gap-3">
                  <dt className="text-site-text-muted">{row.term}</dt>
                  <dd className="font-mono text-site-text">{row.value}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3 border-t border-site-border pt-1.5 sm:col-span-2">
                <dt className="font-semibold text-site-text">
                  {t('homes.affordTotal', { defaultValue: 'Total monthly' })}
                </dt>
                <dd className="font-mono font-semibold text-site-text">
                  {formatMonthly(breakdown.total)}
                </dd>
              </div>
            </dl>
          )}

          {verdict?.known && (
            <p
              className={`mt-3 text-sm ${verdict.affordable ? 'text-site-success' : 'text-site-warning'}`}
            >
              {verdict.affordable
                ? t('homes.affordYes', {
                    defaultValue: 'Within budget — {{share}} of gross income.',
                    share: formatShare(verdict.shareOfIncome),
                  })
                : t('homes.affordNo', {
                    defaultValue: 'Over budget by {{amount}} a month.',
                    amount: formatMonthly(verdict.overBy),
                  })}
            </p>
          )}

          <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm text-site-text">
            <Switch
              checked={filterOn}
              onCheckedChange={toggleFilter}
              aria-label={t('homes.affordFilter', {
                defaultValue: 'Show only homes I can afford',
              })}
            />
            {t('homes.affordFilter', { defaultValue: 'Show only homes I can afford' })}
          </label>
        </div>
      )}

      {!known && (
        <p className="mt-4 text-sm text-site-text-dim">
          {t('homes.affordPrompt', {
            defaultValue: 'Enter your income to see a budget and a payment breakdown.',
          })}
        </p>
      )}
    </section>
  );
}
