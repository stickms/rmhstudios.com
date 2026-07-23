import * as React from 'react';
import { cn } from '@/lib/utils';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        data-slot="textarea"
        className={cn(
          'flex min-h-24 w-full rounded-2xl border border-site-border bg-site-surface text-site-text px-4 py-3 text-sm leading-relaxed transition-all duration-200 ease-out placeholder:text-site-text-dim hover:border-site-text/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:border-site-accent disabled:cursor-not-allowed disabled:opacity-50 shadow-xs',
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
