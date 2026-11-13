/**
 * The sort control of a Create list: one labelled `Select` in the shared page toolbar.
 *
 * Pages, User Builds and AI Personas each rendered (or lacked) their own; they now share this, so the
 * control is the same size in the same place and "Best" is the first option and the default on all three
 * (`lib/ranking/best.ts` says what Best means).
 */
import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/select';

export interface SortOption<T extends string> {
  value: T;
  label: string;
}

export function SortSelect<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly SortOption<T>[];
}) {
  const { t } = useTranslation('builds');
  const label = t('sort-label', { defaultValue: 'Sort' });
  return (
    <label className="builds-sort">
      <span className="sr-only">{label}</span>
      <Select
        controlSize="sm"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label={label}
        containerClassName="w-36"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

/** The three sorts every ranked Create list offers, Best first. */
export function useCreationSortOptions(): SortOption<'best' | 'popular' | 'newest'>[] {
  const { t } = useTranslation('builds');
  return [
    { value: 'best', label: t('sort-best', { defaultValue: 'Best' }) },
    { value: 'popular', label: t('sort-popular', { defaultValue: 'Popular' }) },
    { value: 'newest', label: t('sort-newest', { defaultValue: 'Newest' }) },
  ];
}
