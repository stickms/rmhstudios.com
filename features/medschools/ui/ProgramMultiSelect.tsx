import { useTranslation } from 'react-i18next';
import { PROGRAM_KEYS, isAllPrograms, type ProgramKey } from '../engine/programs';
import { MAX_STATES } from '../engine/search';
import { stateNameOf } from '../engine/state-names';
import type { MedEventTypeId } from '../medschools.contract';
import { MedMultiSelect } from './controls/MedMultiSelect';
import { useMedLabels } from './labels';
import { StatusIcon } from './status/StatusIcon';
import { statusOfEvent } from './status/status';

/**
 * The program set (MD, MD-PhD, DO, DO-PhD) as a compact multi-select: the index toolbar, the live page and the rail.
 * At least one stays on; all four on is no filter. The trigger says "All programs", the one or two chosen, or a count.
 */
export function ProgramMultiSelect({
  value,
  onChange,
  compact,
}: {
  value: readonly ProgramKey[];
  onChange: (next: ProgramKey[]) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation('medschools');
  const { programKeyLabel } = useMedLabels();
  return (
    <MedMultiSelect<ProgramKey>
      label={t('program-set-label', { defaultValue: 'Programs' })}
      options={PROGRAM_KEYS.map((k) => ({ value: k, label: programKeyLabel(k) }))}
      value={value}
      onChange={onChange}
      compact={compact ?? false}
      doneLabel={t('multi-select-done', { defaultValue: 'Done' })}
      summary={(v) =>
        isAllPrograms(v)
          ? t('program-set-all', { defaultValue: 'All programs' })
          : v.length <= 2
            ? v.map(programKeyLabel).join(', ')
            : t('program-set-count', { defaultValue: '{{n}} programs', n: v.length })
      }
    />
  );
}

/** Every public event type, in the live feed's order. */
export const LIVE_EVENT_TYPES: readonly MedEventTypeId[] = [
  'INTERVIEW',
  'SECONDARY',
  'ACCEPTANCE',
  'WAITLIST',
  'REJECTION',
  'HOLD',
  'WITHDRAWN',
];

/** Event types as a compact multi-select with each type's status disc: "All events", the one chosen, or a count. */
export function EventTypeMultiSelect({
  value,
  onChange,
  compact,
}: {
  value: readonly MedEventTypeId[];
  onChange: (next: MedEventTypeId[]) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation('medschools');
  const { eventLabel } = useMedLabels();
  return (
    <MedMultiSelect<MedEventTypeId>
      label={t('rail-kind-label', { defaultValue: 'Event' })}
      options={LIVE_EVENT_TYPES.map((ty) => ({
        value: ty,
        label: eventLabel(ty),
        icon: <StatusIcon status={statusOfEvent(ty)} size="sm" />,
      }))}
      value={value}
      onChange={onChange}
      compact={compact ?? false}
      doneLabel={t('multi-select-done', { defaultValue: 'Done' })}
      summary={(v) =>
        v.length === LIVE_EVENT_TYPES.length
          ? t('live-type-all', { defaultValue: 'All events' })
          : v.length === 1
            ? eventLabel(v[0]!)
            : t('event-type-count', { defaultValue: '{{n}} types', n: v.length })
      }
    />
  );
}

/**
 * The states as a multi-select with a filter field (owner 2026-11-24): "California (CA)" sorted by name, the trigger
 * "All states", "CA", "CA, NY" or "5 states". None checked is every state (no filter), so nothing is kept on.
 */
export function StateMultiSelect({
  states,
  value,
  onChange,
  compact,
}: {
  /** The codes that have schools. */
  states: readonly string[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation('medschools');
  const options = [...new Set([...states, ...value])]
    .map((code) => ({ value: code, label: `${stateNameOf(code)} (${code})` }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return (
    <MedMultiSelect<string>
      label={t('index-state-label', { defaultValue: 'State' })}
      options={options}
      value={value}
      // The URL's canonical order: sorted codes.
      onChange={(next) => onChange([...next].sort())}
      keepOne={false}
      max={MAX_STATES}
      searchLabel={t('state-filter-search', { defaultValue: 'Find a state' })}
      compact={compact ?? false}
      doneLabel={t('multi-select-done', { defaultValue: 'Done' })}
      summary={(v) =>
        v.length === 0
          ? t('index-state-all', { defaultValue: 'All states' })
          : v.length <= 2
            ? v.join(', ')
            : t('state-count', { defaultValue: '{{n}} states', n: v.length })
      }
    />
  );
}
