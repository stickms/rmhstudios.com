import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MedButton } from '../controls/MedButton';
import { MedInput } from '../controls/MedField';
import { MedSelect } from '../controls/MedSelect';
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
      <div className="medapp-actions medapp-subrule">
        <p className="medapp-meta">
          {t('tracker-milestones-all-set', { defaultValue: 'Every milestone is already set for this school.' })}
        </p>
        <MedButton type="button" variant="tertiary" onClick={onCancel}>
          {t('tracker-cancel', { defaultValue: 'Cancel' })}
        </MedButton>
      </div>
    );
  }

  return (
    <form
      className="medapp-form medapp-subrule"
      onSubmit={(e) => {
        e.preventDefault();
        if (date) void run(async () => onSave(type, date));
      }}
    >
      <label className="medapp-fieldset">
        <span className="medapp-label">{t('tracker-milestone-type', { defaultValue: 'Milestone' })}</span>
        <MedSelect
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
        </MedSelect>
      </label>
      <label className="medapp-fieldset">
        <span className="medapp-label">{t('tracker-milestone-date', { defaultValue: 'Date' })}</span>
        <MedInput
          type="date"
          required
          min={min}
          max={max}
          value={date}
          disabled={busy}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <div className="medapp-actions">
        <MedButton type="submit" loading={busy} disabled={!date}>
          {t('tracker-save', { defaultValue: 'Save' })}
        </MedButton>
        {onRemove ? (
          <MedButton
            type="button"
            variant="danger"
            disabled={busy}
            aria-label={t('tracker-milestone-remove-label', { defaultValue: 'Remove milestone' })}
            onClick={() => void run(onRemove)}
          >
            {t('tracker-milestone-remove', { defaultValue: 'Remove' })}
          </MedButton>
        ) : null}
        <MedButton type="button" variant="tertiary" disabled={busy} onClick={onCancel}>
          {t('tracker-cancel', { defaultValue: 'Cancel' })}
        </MedButton>
      </div>
      {error ? (
        <p className="medapp-meta basis-full" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
