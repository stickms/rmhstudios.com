import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MedChartedTypeId, MedEventTypeId } from '../medschools.contract';
import { CATEGORY_STYLE } from './charts/CategoryLines';
import { useMedLabels } from './labels';

/** Canonical order, the order the chart and the table use. */
const ORDER: readonly MedChartedTypeId[] = ['SECONDARY', 'INTERVIEW', 'WAITLIST', 'REJECTION', 'ACCEPTANCE'];

/** Press one category. Result is in canonical order; the last one that is on cannot be turned off (O4). */
export function toggleCategory(value: readonly MedEventTypeId[], type: MedChartedTypeId): MedChartedTypeId[] {
  const on = new Set<MedEventTypeId>(value);
  if (on.has(type)) {
    if (ORDER.filter((c) => on.has(c)).length <= 1) return ORDER.filter((c) => on.has(c));
    on.delete(type);
  } else {
    on.add(type);
  }
  return ORDER.filter((c) => on.has(c));
}

function Sample({ type }: { type: MedChartedTypeId }) {
  const s = CATEGORY_STYLE[type];
  return (
    <svg width="24" height="8" viewBox="0 0 24 8" aria-hidden="true" focusable="false">
      <line
        x1="0"
        x2="24"
        y1="4"
        y2="4"
        stroke={s.stroke === 'ink' ? 'var(--site-text)' : 'var(--site-text-muted)'}
        strokeWidth={s.width}
        strokeDasharray={s.dash}
      />
    </svg>
  );
}

/**
 * One aria-pressed button per charted category, each with a sample of its line (O4). A labelled group, not a tab
 * strip. The caller keeps the value in the URL; this only reports the next list.
 */
export function CategoryToggles({
  value,
  onChange,
}: {
  value: readonly MedEventTypeId[];
  onChange: (v: MedChartedTypeId[]) => void;
}) {
  const { t } = useTranslation('medschools');
  const { eventLabel } = useMedLabels();
  const onCount = ORDER.filter((c) => value.includes(c)).length;
  return (
    <div
      role="group"
      aria-label={t('category-toggles-label', { defaultValue: 'Show categories' })}
      className="flex flex-wrap gap-2"
    >
      {ORDER.map((type) => {
        const pressed = value.includes(type);
        return (
          <Button
            key={type}
            type="button"
            variant="ghost"
            size="xs"
            aria-pressed={pressed}
            // Pressed is an ink border and weight, unpressed a rule and muted text: state is never colour alone (A2).
            className={cn(
              'border',
              pressed ? 'border-site-text font-semibold' : 'border-site-border text-site-text-muted',
            )}
            aria-disabled={pressed && onCount <= 1 ? true : undefined}
            onClick={() => onChange(toggleCategory(value, type))}
          >
            <Sample type={type} />
            {eventLabel(type)}
          </Button>
        );
      })}
    </div>
  );
}
