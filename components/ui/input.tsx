import * as React from 'react';

import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-11 w-full rounded-[var(--site-control-radius)] border border-site-border bg-site-surface px-3.5 py-2.5 text-sm text-site-text transition-[color,box-shadow,border-color,background-color] placeholder:text-site-text-dim hover:border-site-border-bright focus-visible:border-site-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent/20 disabled:cursor-not-allowed disabled:opacity-50',
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
