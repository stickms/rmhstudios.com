'use client';

/** K4 — the "repeats" controls inside the event composer. */

import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import type { CalPerson } from '@/lib/calendar/types';
import { viewerTimeZone } from './api';
import { PersonPicker } from './PersonPicker';

export interface RecurrenceDraft {
  rule: 'none' | 'W' | 'M';
  /** YYYY-MM-DD or empty. */
  until: string;
  rotation: CalPerson[];
}

export const NO_RECURRENCE: RecurrenceDraft = { rule: 'none', until: '', rotation: [] };

/** The request body fragment for a draft, or undefined for a one-off event. */
export function buildRecurrence(draft: RecurrenceDraft) {
  if (draft.rule === 'none') return undefined;
  return {
    rule: draft.rule,
    tz: viewerTimeZone(),
    until: draft.until ? new Date(`${draft.until}T23:59:59`).toISOString() : null,
    rotatingHostIds: draft.rotation.map((p) => p.id),
  };
}

export function RecurrenceFields({
  value,
  onChange,
}: {
  value: RecurrenceDraft;
  onChange: (next: RecurrenceDraft) => void;
}) {
  const { t } = useTranslation('f-calendar');
  return (
    <fieldset className="flex flex-col gap-3 rounded-site border border-site-border p-3">
      <legend className="px-1 text-xs font-medium text-site-text-muted">
        {t('rec-legend', { defaultValue: 'Repeats' })}
      </legend>
      <Select
        controlSize="sm"
        containerClassName="w-full"
        value={value.rule}
        aria-label={t('rec-rule', { defaultValue: 'How often' })}
        onChange={(e) => onChange({ ...value, rule: e.target.value as RecurrenceDraft['rule'] })}
      >
        <option value="none">{t('rec-none', { defaultValue: 'Does not repeat' })}</option>
        <option value="W">{t('rec-weekly', { defaultValue: 'Every week' })}</option>
        <option value="M">{t('rec-monthly', { defaultValue: 'Every month, same weekday' })}</option>
      </Select>
      {value.rule !== 'none' && (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-site-text-muted">
            {t('rec-until', { defaultValue: 'Ends on (optional)' })}
            <Input
              type="date"
              value={value.until}
              onChange={(e) => onChange({ ...value, until: e.target.value })}
            />
          </label>
          <PersonPicker
            value={value.rotation}
            onChange={(rotation) => onChange({ ...value, rotation })}
            max={12}
            label={t('rec-rotation', {
              defaultValue: 'Rotate the host between these members (optional)',
            })}
          />
        </>
      )}
    </fieldset>
  );
}
