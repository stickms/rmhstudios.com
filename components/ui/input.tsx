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
          'flex h-10 w-full rounded-[var(--site-control-radius,12px)] border border-site-border/70 bg-site-surface/60 backdrop-blur-sm text-site-text px-3.5 py-2 text-sm transition-all duration-150 ease-out placeholder:text-site-text-dim hover:border-site-border-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent/40 focus-visible:border-site-accent focus-visible:bg-site-surface disabled:cursor-not-allowed disabled:opacity-50 shadow-inner',
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
