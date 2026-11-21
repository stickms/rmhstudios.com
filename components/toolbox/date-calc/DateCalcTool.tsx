import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs } from '@/components/ui/tabs';
import { ResultRow, ToolFrame, ToolSection, ToolSwitch } from '@/components/toolbox/ToolFrame';
import {
  addBusinessDays,
  addToDate,
  differenceBetween,
  formatPlainDate,
  parsePlainDate,
  toDayNumber,
  type PlainDate,
} from '@/lib/toolbox/date-calc';

type Mode = 'between' | 'add';

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function CountField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" inputMode="numeric" step={1} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** Today in the viewer's own calendar, as `YYYY-MM-DD`. */
function today(): string {
  const now = new Date();
  return formatPlainDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}

export function DateCalcTool() {
  const { t, i18n } = useTranslation('toolbox');
  const locale = i18n.language || 'en';
  const [mode, setMode] = useState<Mode>('between');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [inclusive, setInclusive] = useState(false);
  const [years, setYears] = useState('0');
  const [months, setMonths] = useState('0');
  const [weeks, setWeeks] = useState('0');
  const [days, setDays] = useState('30');
  const [business, setBusiness] = useState('10');

  // "Today" depends on the viewer's clock and zone, so the fields fill in after hydration.
  useEffect(() => {
    const now = today();
    setStart(now);
    const [y = 2026] = now.split('-').map(Number);
    setEnd(`${y}-12-31`);
  }, []);

  const a = parsePlainDate(start);
  const b = parsePlainDate(end);
  const num = (n: number) => new Intl.NumberFormat(locale).format(n);
  const long = (d: PlainDate) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(toDayNumber(d) * 86_400_000));
  const int = (s: string) => Math.trunc(Number(s) || 0);

  return (
    <ToolFrame slug="date-calc">
      <Tabs
        value={mode}
        onChange={(id) => setMode(id as Mode)}
        aria-label={t('date-mode', { defaultValue: 'Calculation' })}
        tabs={[
          { id: 'between', label: t('date-tab-between', { defaultValue: 'Between two dates' }) },
          { id: 'add', label: t('date-tab-add', { defaultValue: 'Add or subtract' }) },
        ]}
      />

      {mode === 'between' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <DateField label={t('date-start', { defaultValue: 'Start date' })} value={start} onChange={setStart} />
            <DateField label={t('date-end', { defaultValue: 'End date' })} value={end} onChange={setEnd} />
          </div>
          <ToolSwitch
            label={t('date-inclusive', { defaultValue: 'Count the end date too' })}
            checked={inclusive}
            onCheckedChange={setInclusive}
          />
          {a && b && (() => {
            const diff = differenceBetween(a, b, inclusive);
            const sign = diff.totalDays < 0 ? '−' : '';
            return (
              <ToolSection title={t('date-difference', { defaultValue: 'Difference' })}>
                <p className="t-title font-mono" aria-live="polite">
                  {t('date-days', { defaultValue: '{{count}} days', count: diff.totalDays })}
                </p>
                <div>
                  <ResultRow
                    label={t('date-calendar', { defaultValue: 'Years, months and days' })}
                    mono={false}
                    value={`${sign}${t('date-ymd', {
                      defaultValue: '{{years}} y, {{months}} m, {{days}} d',
                      years: diff.calendar.years,
                      months: diff.calendar.months,
                      days: diff.calendar.days,
                    })}`}
                  />
                  <ResultRow
                    label={t('date-weeks', { defaultValue: 'Weeks and days' })}
                    mono={false}
                    value={`${sign}${t('date-wd', {
                      defaultValue: '{{weeks}} weeks, {{days}} days',
                      weeks: diff.weeks,
                      days: diff.remainderDays,
                    })}`}
                  />
                  <ResultRow
                    label={t('date-business', { defaultValue: 'Weekdays (Monday to Friday)' })}
                    value={num(diff.businessDays)}
                  />
                  <ResultRow
                    label={t('date-hours', { defaultValue: 'Hours' })}
                    value={num(diff.totalDays * 24)}
                  />
                </div>
              </ToolSection>
            );
          })()}
        </>
      ) : (
        <>
          <DateField label={t('date-from', { defaultValue: 'From' })} value={start} onChange={setStart} />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <CountField label={t('date-add-years', { defaultValue: 'Years' })} value={years} onChange={setYears} />
            <CountField label={t('date-add-months', { defaultValue: 'Months' })} value={months} onChange={setMonths} />
            <CountField label={t('date-add-weeks', { defaultValue: 'Weeks' })} value={weeks} onChange={setWeeks} />
            <CountField label={t('date-add-days', { defaultValue: 'Days' })} value={days} onChange={setDays} />
          </div>
          <p className="t-meta">
            {t('date-add-hint', { defaultValue: 'Use negative numbers to go back. Month ends are kept: 31 January plus one month is the end of February.' })}
          </p>
          {a && (
            <ToolSection title={t('date-result', { defaultValue: 'Result' })}>
              <p className="t-heading" aria-live="polite">
                {long(addToDate(a, { years: int(years), months: int(months), weeks: int(weeks), days: int(days) }))}
              </p>
            </ToolSection>
          )}
          <ToolSection title={t('date-business-add', { defaultValue: 'Add weekdays' })}>
            <CountField
              label={t('date-business-count', { defaultValue: 'Weekdays to add' })}
              value={business}
              onChange={setBusiness}
            />
            {a && <p className="t-body">{long(addBusinessDays(a, Math.max(-10_000, Math.min(10_000, int(business)))))}</p>}
          </ToolSection>
        </>
      )}
    </ToolFrame>
  );
}
