import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { milestoneDateWindow, unsetMilestoneTypes, type MilestoneType } from '../../engine/tracker';
import { useMedLabels } from '../labels';

/**
 * Add or edit one milestone, inline in its application's row. Adding offers only the types not set yet (a milestone is
 * unique per application and type, so a second one would be an edit). Editing fixes the type and changes the date, or
 * removes the milestone. The date input's `min` and `max` are the window the server enforces (`milestoneDateWindow`).
 */
export function MilestoneForm({
  cycleYear,
  existing,
  editing,
  onSave,
  onRemove,
  onCancel,
  now = new Date(),
}: {
  cycleYear: number;
  existing: readonly { type: MilestoneType }[];
  editing?: { type: MilestoneType; date: string };
  /** Rejects with the server's refusal; the form shows it and stays open. */
  onSave: (type: MilestoneType, date: string) => Promise<void>;
  onRemove?: () => Promise<void>;
  onCancel: () => void;
  now?: Date;
}) {
  const { t } = useTranslation('medschools');
  const { milestoneLabel } = useMedLabels();
  const refusal = useRefusalText();
  const types = editing ? [editing.type] : unsetMilestoneTypes(existing);
  const [type, setType] = useState<MilestoneType>(types[0] ?? 'SUBMITTED');
  const [date, setDate] = useState(editing?.date ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { min, max } = milestoneDateWindow(cycleYear, now);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(refusal(e));
      setBusy(false);
    }
  };

  if (types.length === 0) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <p className="t-meta m-0">
          {t('tracker-milestones-all-set', { defaultValue: 'Every milestone is already set for this school.' })}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t('tracker-cancel', { defaultValue: 'Cancel' })}
        </Button>
      </div>
    );
  }

  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (date) void run(async () => onSave(type, date));
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="t-label">{t('tracker-milestone-type', { defaultValue: 'Milestone' })}</span>
        <Select
          controlSize="sm"
          aria-label={t('tracker-milestone-type', { defaultValue: 'Milestone' })}
          value={type}
          disabled={!!editing || busy}
          onChange={(e) => setType(e.target.value as MilestoneType)}
        >
          {types.map((ty) => (
            <option key={ty} value={ty}>
              {milestoneLabel(ty)}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="t-label">{t('tracker-milestone-date', { defaultValue: 'Date' })}</span>
        <Input
          type="date"
          required
          min={min}
          max={max}
          value={date}
          disabled={busy}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 w-44 pointer-coarse:h-11"
        />
      </label>
      <Button type="submit" loading={busy} disabled={!date}>
        {t('tracker-save', { defaultValue: 'Save' })}
      </Button>
      {onRemove ? (
        <Button
          type="button"
          variant="danger"
          disabled={busy}
          aria-label={t('tracker-milestone-remove-label', { defaultValue: 'Remove milestone' })}
          onClick={() => void run(onRemove)}
        >
          {t('tracker-milestone-remove', { defaultValue: 'Remove' })}
        </Button>
      ) : null}
      <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
        {t('tracker-cancel', { defaultValue: 'Cancel' })}
      </Button>
      {error ? (
        <p className="t-meta m-0 w-full" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
