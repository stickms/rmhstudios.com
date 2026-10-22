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
          'glass-inset flex h-12 w-full rounded-site-sm px-4 py-3 text-base sm:text-sm text-site-text transition-[color,border-color,background-color] duration-site-fast placeholder:text-site-text-muted hover:border-site-border-bright focus-visible:border-site-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent/30 aria-invalid:border-site-danger aria-invalid:ring-site-danger/30 disabled:cursor-not-allowed disabled:opacity-50',
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
