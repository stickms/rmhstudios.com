import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Compact controls for toolbars; standard form selects keep the 44px target. */
  controlSize?: 'sm' | 'default';
  /** Layout classes for the chevron-owning wrapper. */
  containerClassName?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, controlSize = 'default', containerClassName, ...props }, ref) => {
    return (
      <span className={cn('relative block', containerClassName)} data-slot="select-control">
        <select
          data-slot="select"
          className={cn(
            'flex w-full appearance-none glass-inset text-site-text transition-[color,box-shadow,border-color,background-color] hover:border-site-border-bright',
            controlSize === 'sm'
              ? 'h-9 px-2.5 py-1.5 pr-8 text-xs'
              : 'h-11 px-3.5 py-2.5 pr-9 text-sm',
            'focus-visible:border-site-accent focus-visible:bg-site-glass-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent/50',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-site-text-dim"
        />
      </span>
    );
  },
);
Select.displayName = 'Select';

export { Select };
