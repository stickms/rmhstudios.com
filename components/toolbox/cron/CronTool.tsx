import { useEffect, useId, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs } from '@/components/ui/tabs';
import { FieldError, ResultRow, ToolFrame, ToolSection } from '@/components/toolbox/ToolFrame';
import {
  CRON_FIELDS,
  CRON_MACROS,
  nextRuns,
  parseCron,
  type CronError,
  type CronField,
  type CronZone,
  type ParsedCron,
} from '@/lib/toolbox/cron';

/** How many upcoming runs to list. */
const RUNS = 8;

function fieldName(t: TFunction, field: CronField): string {
  switch (field) {
    case 'minute':
      return t('cron-field-minute', { ns: 'toolbox', defaultValue: 'Minute' });
    case 'hour':
      return t('cron-field-hour', { ns: 'toolbox', defaultValue: 'Hour' });
    case 'dayOfMonth':
      return t('cron-field-day-of-month', { ns: 'toolbox', defaultValue: 'Day of month' });
    case 'month':
      return t('cron-field-month', { ns: 'toolbox', defaultValue: 'Month' });
    case 'dayOfWeek':
      return t('cron-field-day-of-week', { ns: 'toolbox', defaultValue: 'Day of week' });
  }
}

function errorText(t: TFunction, error: CronError): string {
  switch (error.code) {
    case 'field-count':
      return t('cron-error-count', {
        ns: 'toolbox',
        defaultValue: 'A cron expression has five fields; this has {{count}}.',
        count: error.count,
      });
    case 'bad-value':
      return t('cron-error-value', {
        ns: 'toolbox',
        defaultValue: '{{field}}: “{{token}}” is not a value or range.',
        field: fieldName(t, error.field),
        token: error.token,
      });
    case 'out-of-range':
      return t('cron-error-range', {
        ns: 'toolbox',
        defaultValue: '{{field}}: “{{token}}” is outside {{min}}–{{max}}.',
        field: fieldName(t, error.field),
        token: error.token,
        min: error.min,
        max: error.max,
      });
    case 'bad-step':
      return t('cron-error-step', {
        ns: 'toolbox',
        defaultValue: '{{field}}: the step in “{{token}}” must be a whole number above 0.',
        field: fieldName(t, error.field),
        token: error.token,
      });
    case 'unknown-macro':
      return t('cron-error-macro', {
        ns: 'toolbox',
        defaultValue: '“{{token}}” is not a known shortcut.',
        token: error.token,
      });
  }
}

function fieldValues(t: TFunction, cron: ParsedCron, field: CronField, locale: string): string {
  if (cron.wildcard[field]) return t('cron-every', { ns: 'toolbox', defaultValue: 'Every' });
  const values = cron.fields[field];
  if (field === 'month') {
    const fmt = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
    return values.map((m) => fmt.format(new Date(Date.UTC(2024, m - 1, 1)))).join(', ');
  }
  if (field === 'dayOfWeek') {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    // 2024-01-07 was a Sunday.
    return values.map((d) => fmt.format(new Date(Date.UTC(2024, 0, 7 + d)))).join(', ');
  }
  return values.join(', ');
}

export function CronTool({
  initialExpression = '*/15 9-17 * * 1-5',
  onExpressionChange,
}: {
  initialExpression?: string;
  onExpressionChange?: (expression: string) => void;
}) {
  const { t, i18n } = useTranslation('toolbox');
  const locale = i18n.language || 'en';
  const id = useId();
  const [text, setText] = useState(initialExpression);
  const [zone, setZone] = useState<CronZone>('local');
  // "Now" is read in the browser after hydration, so the server and client render the same first frame.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), [text, zone]);

  const result = parseCron(text);
  const runs = result.ok && now ? nextRuns(result.cron, now, RUNS, zone) : [];
  const fmt = new Intl.DateTimeFormat(locale, {
    dateStyle: 'full',
    timeStyle: 'short',
    ...(zone === 'utc' ? { timeZone: 'UTC' } : {}),
  });

  return (
    <ToolFrame slug="cron">
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>{t('cron-expression', { defaultValue: 'Cron expression' })}</Label>
        <Input
          id={id}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (parseCron(e.target.value).ok) onExpressionChange?.(e.target.value.trim());
          }}
          spellCheck={false}
          autoComplete="off"
          dir="ltr"
          className="font-mono"
          aria-invalid={result.ok ? undefined : true}
        />
        {!result.ok && <FieldError>{errorText(t, result.error)}</FieldError>}
        <p className="t-meta">
          {t('cron-macros', { defaultValue: 'Shortcuts: {{macros}}', macros: Object.keys(CRON_MACROS).join(', ') })}
        </p>
      </div>

      {result.ok && (
        <>
          <ToolSection title={t('cron-fields', { defaultValue: 'Field by field' })}>
            <div>
              {CRON_FIELDS.map((field) => (
                <ResultRow key={field} label={fieldName(t, field)} value={fieldValues(t, result.cron, field, locale)} />
              ))}
            </div>
            {!result.cron.wildcard.dayOfMonth && !result.cron.wildcard.dayOfWeek && (
              <p className="t-body text-site-text-muted">
                {t('cron-or-rule', {
                  defaultValue:
                    'Both day fields are set, so it runs on days that match either one, not only days that match both.',
                })}
              </p>
            )}
          </ToolSection>

          <ToolSection title={t('cron-next', { defaultValue: 'Next runs' })}>
            <Tabs
              value={zone}
              onChange={(v) => setZone(v as CronZone)}
              size="sm"
              aria-label={t('cron-zone', { defaultValue: 'Time zone' })}
              tabs={[
                { id: 'local', label: t('cron-zone-local', { defaultValue: 'Your time' }) },
                { id: 'utc', label: t('cron-zone-utc', { defaultValue: 'UTC' }) },
              ]}
            />
            {now && runs.length === 0 ? (
              <p className="t-body text-site-text-muted">
                {t('cron-never', { defaultValue: 'This schedule does not run in the next five years.' })}
              </p>
            ) : (
              <ol>
                {runs.map((run) => (
                  <li key={run.getTime()} className="t-body border-b border-site-border py-2 last:border-b-0">
                    {fmt.format(run)}
                  </li>
                ))}
              </ol>
            )}
          </ToolSection>
        </>
      )}
    </ToolFrame>
  );
}
