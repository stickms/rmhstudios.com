'use client';

/**
 * SearchField — the one search input on the site.
 *
 * There were three near-copies of this markup (the Explore column, the Inbox's
 * message search, the library's explorer), each a `relative` wrapper with an
 * absolutely-positioned leading icon and a `rounded-full` input padded to clear
 * it. They had drifted: two placeholder colours (`-muted` vs `-dim`), a clear
 * button on one and a spinner on another, and the library's was a bespoke CSS
 * class with its own height. Same control, three answers.
 *
 * The trailing slot is what kept them apart, so it is a prop: pass a spinner
 * while a query is in flight, or nothing. The clear button is built in, because
 * every copy either had one or wanted one — it appears only when there is text
 * to clear, and it sits inside the field's right padding rather than displacing
 * the layout.
 *
 * `type="search"` (not `text`) on purpose: it gets the platform's own clear
 * affordance and search semantics for screen readers. The UA's own clear
 * control is hidden in `globals.css` so it can't stack with this one.
 */

import * as React from 'react';
import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface SearchFieldProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> {
  value: string;
  onValueChange: (value: string) => void;
  /** Rendered inside the field's right edge — a spinner, a count, nothing. */
  trailing?: React.ReactNode;
  /** Layout classes for the wrapper (width, flex behaviour). */
  containerClassName?: string;
}

export const SearchField = React.forwardRef<HTMLInputElement, SearchFieldProps>(
  ({ value, onValueChange, trailing, className, containerClassName, ...props }, ref) => {
    const { t } = useTranslation('c-ui');

    return (
      <div className={cn('relative min-w-0', containerClassName)} data-slot="search-field">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-site-text-dim"
        />
        <input
          ref={ref}
          type="search"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className={cn(
            'w-full rounded-full border border-site-border bg-site-surface py-2 pl-9 pr-9 text-sm text-site-text',
            'placeholder:text-site-text-dim focus:border-site-accent focus:outline-none',
            className,
          )}
          {...props}
        />
        {/* The trailing slot and the clear button share the right padding: a
            field that is both loading and clearable would otherwise stack two
            controls on top of each other. Loading wins while it lasts. */}
        {trailing ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            {trailing}
          </span>
        ) : (
          value && (
            <button
              type="button"
              onClick={() => onValueChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-site-text-dim hover:text-site-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent"
              aria-label={t('clear-search', { defaultValue: 'Clear search' })}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )
        )}
      </div>
    );
  },
);
SearchField.displayName = 'SearchField';
