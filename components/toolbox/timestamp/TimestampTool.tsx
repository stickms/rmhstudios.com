import { useEffect, useId, useState } from 'react';
import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { FieldError, ResultRow, ToolFrame, ToolSection } from '@/components/toolbox/ToolFrame';
import {
  dayOfYear,
  isoWeek,
  parseTimestamp,
  relativeParts,
  unixSeconds,
  type UnitChoice,
} from '@/lib/toolbox/timestamp';

export function TimestampTool() {
  const { t, i18n } = useTranslation('toolbox');
  const locale = i18n.language || 'en';
  const inputId = useId();
  const unitId = useId();
  const [text, setText] = useState('1700000000');
  const [unit, setUnit] = useState<UnitChoice>('auto');
  // The clock and the viewer's time zone are only known in the browser: rows that use either wait for hydration,
  // so the server's render (in UTC) and the first client render agree.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), [text, unit]);

  const parsed = parseTimestamp(text, unit);
  const unitName = (u: string): string => {
    switch (u) {
      case 'seconds':
        return t('ts-unit-seconds', { defaultValue: 'Seconds' });
      case 'milliseconds':
        return t('ts-unit-milliseconds', { defaultValue: 'Milliseconds' });
      case 'microseconds':
        return t('ts-unit-microseconds', { defaultValue: 'Microseconds' });
      case 'nanoseconds':
        return t('ts-unit-nanoseconds', { defaultValue: 'Nanoseconds' });
      case 'date':
        return t('ts-unit-date', { defaultValue: 'A date' });
      default:
        return t('ts-unit-auto', { defaultValue: 'Detect from length' });
    }
  };

  const fill = () => {
    const d = new Date();
    setText(String(unixSeconds(d)));
    setUnit('auto');
  };

  return (
    <ToolFrame slug="timestamp">
      <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
        <div className="flex flex-col gap-2">
          <Label htmlFor={inputId}>{t('ts-input', { defaultValue: 'Timestamp or date' })}</Label>
          <Input
            id={inputId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            dir="ltr"
            className="font-mono"
            aria-invalid={parsed.ok || text.trim() === '' ? undefined : true}
            placeholder={t('ts-placeholder', { defaultValue: '1700000000 or 2026-11-20T12:00:00Z' })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={unitId}>{t('ts-unit', { defaultValue: 'Unit' })}</Label>
          <Select id={unitId} value={unit} onChange={(e) => setUnit(e.target.value as UnitChoice)}>
            {(['auto', 'seconds', 'milliseconds', 'microseconds', 'nanoseconds'] as const).map((u) => (
              <option key={u} value={u}>
                {unitName(u)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div>
        <Button variant="default" onClick={fill}>
          <Clock aria-hidden />
          {t('ts-now', { defaultValue: 'Now' })}
        </Button>
      </div>
      {!parsed.ok && parsed.reason !== 'empty' && (
        <FieldError>
          {parsed.reason === 'out-of-range'
            ? t('ts-out-of-range', { defaultValue: 'That is too far from 1970 for a calendar date.' })
            : t('ts-invalid', { defaultValue: 'Enter a number, or a date such as 2026-11-20 or 2026-11-20T12:00Z.' })}
        </FieldError>
      )}

      {parsed.ok && (
        <ToolSection
          title={t('ts-results', { defaultValue: 'Read as {{unit}}', unit: unitName(parsed.unit).toLowerCase() })}
        >
          <div aria-live="polite">
            <ResultRow
              label={t('ts-iso', { defaultValue: 'UTC, ISO 8601' })}
              value={parsed.date.toISOString()}
              action={<CopyButton value={parsed.date.toISOString()} />}
            />
            {now && (
              <ResultRow
                label={t('ts-local', { defaultValue: 'Your time' })}
                mono={false}
                value={new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'long' }).format(parsed.date)}
              />
            )}
            {now && (
              <ResultRow
                label={t('ts-relative', { defaultValue: 'Relative to now' })}
                mono={false}
                value={new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
                  ...relativeParts(parsed.date, now),
                )}
              />
            )}
            <ResultRow
              label={t('ts-seconds', { defaultValue: 'Unix seconds' })}
              value={unixSeconds(parsed.date)}
              action={<CopyButton value={String(unixSeconds(parsed.date))} />}
            />
            <ResultRow
              label={t('ts-milliseconds', { defaultValue: 'Unix milliseconds' })}
              value={parsed.date.getTime()}
              action={<CopyButton value={String(parsed.date.getTime())} />}
            />
            <ResultRow
              label={t('ts-day-of-year', { defaultValue: 'Day of the year (UTC)' })}
              value={dayOfYear(parsed.date)}
            />
            <ResultRow
              label={t('ts-iso-week', { defaultValue: 'ISO week (UTC)' })}
              value={(() => {
                const w = isoWeek(parsed.date);
                return `${w.year}-W${String(w.week).padStart(2, '0')}`;
              })()}
            />
          </div>
        </ToolSection>
      )}
    </ToolFrame>
  );
}
