import * as React from 'react';

import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        data-slot="input"
        type={type}
        className={cn(
          // Steel K4: 40px high, surface fill, 1px border, 12px side padding, muted placeholder. Focus is the global K10 outline.
          'flex h-10 w-full rounded-site border border-site-border bg-site-surface px-3 text-base sm:text-sm text-site-text transition-[border-color] duration-(--m1) ease-[ease] placeholder:text-site-text-muted aria-invalid:border-site-danger disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
