import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs } from '@/components/ui/tabs';
import { FieldError, ResultRow, ToolFrame, ToolSection } from '@/components/toolbox/ToolFrame';
import { MAX_LOAN_MONTHS, amortize, validateLoan, yearlyTotals } from '@/lib/toolbox/loan';

type View = 'yearly' | 'monthly';

function NumberField({
  label,
  value,
  onChange,
  step = 'any',
  invalid,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step?: string;
  invalid?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid ? true : undefined}
      />
    </div>
  );
}

export function LoanTool() {
  const { t, i18n } = useTranslation('toolbox');
  const locale = i18n.language || 'en';
  const [principal, setPrincipal] = useState('250000');
  const [rate, setRate] = useState('6.5');
  const [years, setYears] = useState('30');
  const [extra, setExtra] = useState('0');
  const [view, setView] = useState<View>('yearly');

  const input = {
    principal: Number(principal),
    annualRatePercent: Number(rate),
    months: Math.round(Number(years) * 12),
    extraMonthly: Number(extra) || 0,
  };
  const validation = validateLoan(input);
  // A 1,200-row schedule is a few microseconds of arithmetic: no memo needed.
  const result = validation === 'ok' ? amortize(input) : null;
  const baseline = validation === 'ok' && input.extraMonthly > 0 ? amortize({ ...input, extraMonthly: 0 }) : null;

  const money = (n: number) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const duration = (months: number) =>
    t('loan-duration', {
      defaultValue: '{{years}} years, {{months}} months',
      years: Math.floor(months / 12),
      months: months % 12,
    });

  return (
    <ToolFrame slug="loan">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label={t('loan-principal', { defaultValue: 'Amount borrowed' })}
          value={principal}
          onChange={setPrincipal}
          invalid={validation === 'principal'}
        />
        <NumberField
          label={t('loan-rate', { defaultValue: 'Annual interest rate (%)' })}
          value={rate}
          onChange={setRate}
          invalid={validation === 'rate'}
        />
        <NumberField
          label={t('loan-years', { defaultValue: 'Term in years' })}
          value={years}
          onChange={setYears}
          invalid={validation === 'months'}
        />
        <NumberField
          label={t('loan-extra', { defaultValue: 'Extra paid each month' })}
          value={extra}
          onChange={setExtra}
          invalid={validation === 'extra'}
        />
      </div>
      {validation !== 'ok' && (
        <FieldError>
          {validation === 'principal'
            ? t('loan-error-principal', { defaultValue: 'Enter an amount above zero.' })
            : validation === 'rate'
              ? t('loan-error-rate', { defaultValue: 'Enter a rate from 0 to 100 percent.' })
              : validation === 'months'
                ? t('loan-error-months', {
                    count: Number(MAX_LOAN_MONTHS / 12),
                    defaultValue_one: 'Enter a term from one month to {{years}} year.',
                    defaultValue: 'Enter a term from one month to {{years}} years.',
                    years: MAX_LOAN_MONTHS / 12,
                  })
                : t('loan-error-extra', { defaultValue: 'The extra payment cannot be negative.' })}
        </FieldError>
      )}

      {result && (
        <>
          <ToolSection title={t('loan-summary', { defaultValue: 'Summary' })}>
            <p className="t-title font-mono" aria-live="polite">
              {money(result.monthlyPayment + input.extraMonthly)}
            </p>
            <p className="t-body text-site-text-muted">
              {input.extraMonthly > 0
                ? t('loan-per-month-extra', {
                    defaultValue: 'a month: {{payment}} scheduled plus {{extra}} extra',
                    payment: money(result.monthlyPayment),
                    extra: money(input.extraMonthly),
                  })
                : t('loan-per-month', { defaultValue: 'a month' })}
            </p>
            <div>
              <ResultRow
                label={t('loan-total-interest', { defaultValue: 'Total interest' })}
                value={money(result.totalInterest)}
              />
              <ResultRow label={t('loan-total-paid', { defaultValue: 'Total paid' })} value={money(result.totalPaid)} />
              <ResultRow
                label={t('loan-payoff', { defaultValue: 'Paid off in' })}
                mono={false}
                value={duration(result.payoffMonths)}
              />
              {baseline && (
                <ResultRow
                  label={t('loan-saved', { defaultValue: 'Interest saved by paying extra' })}
                  value={money(baseline.totalInterest - result.totalInterest)}
                />
              )}
            </div>
          </ToolSection>

          <ToolSection title={t('loan-schedule', { defaultValue: 'Repayment schedule' })}>
            <Tabs
              value={view}
              onChange={(v) => setView(v as View)}
              size="sm"
              aria-label={t('loan-schedule-view', { defaultValue: 'Schedule view' })}
              tabs={[
                { id: 'yearly', label: t('loan-yearly', { defaultValue: 'By year' }) },
                { id: 'monthly', label: t('loan-monthly', { defaultValue: 'By month' }) },
              ]}
            />
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-right text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="t-label border-b border-site-border px-2 py-2 text-left">
                      {view === 'yearly'
                        ? t('loan-col-year', { defaultValue: 'Year' })
                        : t('loan-col-month', { defaultValue: 'Month' })}
                    </th>
                    <th scope="col" className="t-label border-b border-site-border px-2 py-2">
                      {t('loan-col-principal', { defaultValue: 'Principal' })}
                    </th>
                    <th scope="col" className="t-label border-b border-site-border px-2 py-2">
                      {t('loan-col-interest', { defaultValue: 'Interest' })}
                    </th>
                    <th scope="col" className="t-label border-b border-site-border px-2 py-2">
                      {t('loan-col-balance', { defaultValue: 'Balance' })}
                    </th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {(view === 'yearly'
                    ? yearlyTotals(result.schedule).map((y) => ({ key: y.year, ...y }))
                    : result.schedule.map((m) => ({ key: m.period, ...m }))
                  ).map((row) => (
                    <tr key={row.key} className="border-b border-site-border">
                      <td className="px-2 py-1.5 text-left">{row.key}</td>
                      <td className="px-2 py-1.5">{money(row.principal)}</td>
                      <td className="px-2 py-1.5">{money(row.interest)}</td>
                      <td className="px-2 py-1.5">{money(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ToolSection>
        </>
      )}
    </ToolFrame>
  );
}
