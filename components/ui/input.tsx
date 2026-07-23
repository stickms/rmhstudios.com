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
          // .glass-inset: a recessed well (ink fill + inverted inner shadow, no
          // backdrop blur — legibility + cost). Focus fills the well with light.
          // §15.4: compact padding is canonical on fine pointers; the global
          // coarse-pointer rule restores the 44px mobile tap target.
          'flex h-10 w-full rounded-full border border-site-border bg-site-surface px-4 py-2 text-sm text-site-text transition-all duration-200 ease-out placeholder:text-site-text-dim hover:border-site-text/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:border-site-accent disabled:cursor-not-allowed disabled:opacity-50 shadow-xs',
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
