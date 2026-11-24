import type { ComponentProps, Ref } from 'react';
import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * A search field on paper: `type="search"` (search semantics for screen readers), a leading icon and, once there is
 * text, a clear button (44px target) inside the field's trailing edge. Same API as the site's `SearchField`
 * (`value`, `onValueChange`), so a call site only changes its import.
 */
export function MedSearch({
  value,
  onValueChange,
  containerClassName,
  className,
  ref,
  ...rest
}: Omit<ComponentProps<'input'>, 'type' | 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Layout classes for the wrapper (width, flex behaviour). */
  containerClassName?: string;
  ref?: Ref<HTMLInputElement>;
}) {
  const { t } = useTranslation('medschools');
  return (
    <div className={cn('medapp-search', containerClassName)} data-slot="med-search">
      <Search aria-hidden="true" className="medapp-search__icon size-4" />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn('medapp-field', className)}
        {...rest}
      />
      {value ? (
        <button
          type="button"
          className="medapp-search__clear"
          aria-label={t('controls-clear-search', { defaultValue: 'Clear search' })}
          onClick={() => onValueChange('')}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
