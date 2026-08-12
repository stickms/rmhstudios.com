import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /**
   * Grow with the content instead of scrolling, up to `--textarea-max-block`
   * (default 40vh), after which `overflow-y: auto` takes over.
   *
   * This is `field-sizing: content` — the browser sizes the control during the
   * layout pass it was already running. The JS equivalent, which several
   * components hand-rolled, is:
   *
   * ```ts
   * el.style.height = 'auto';                  // write → invalidates layout
   * el.style.height = `${el.scrollHeight}px`;  // read  → FORCES synchronous layout
   * ```
   *
   * — the canonical layout-thrash shape, run on every keystroke. See
   * docs/performance-audit-2026-08-12.md §1.7.
   *
   * Engines without `field-sizing` are unaffected: the `@supports` block in
   * globals.css simply does not apply, and the field behaves exactly as a
   * fixed-height textarea does today. A caller that must autosize on those
   * engines keeps its own effect behind `@supports not (field-sizing: content)`.
   */
  autosize?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autosize = false, ...props }, ref) => {
    return (
      <textarea
        data-slot="textarea"
        className={cn(
          'glass-inset flex min-h-24 w-full rounded-site-sm text-site-text px-4 py-3 text-sm leading-relaxed transition duration-site ease-out placeholder:text-site-text-dim hover:border-site-text/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:border-site-accent disabled:cursor-not-allowed disabled:opacity-50',
          autosize && 'textarea-autosize',
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
