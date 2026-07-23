import * as React from 'react';
import { cn } from '@/lib/utils';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        data-slot="textarea"
        className={cn(
          'flex min-h-20 w-full rounded-[var(--site-control-radius,12px)] border border-site-border/70 bg-site-surface/60 backdrop-blur-sm text-site-text px-3.5 py-2.5 text-sm leading-relaxed transition-all duration-150 ease-out placeholder:text-site-text-dim hover:border-site-border-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent/40 focus-visible:border-site-accent focus-visible:bg-site-surface disabled:cursor-not-allowed disabled:opacity-50 shadow-inner',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };
