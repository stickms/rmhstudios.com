import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * Text fields on paper: 44px high, 14px radius, a 1px border (`.medapp-field`). Native input and textarea elements, so
 * labels, `aria-invalid`, `disabled`, `maxLength`, date pickers and autofill all keep their platform behaviour; the
 * focus ring is the app tier's global one. A textarea takes its direction from its first strong character (member
 * free text), as the site's `Textarea` does.
 */
export function MedInput({ className, ...rest }: ComponentProps<'input'>) {
  return <input data-slot="med-input" className={cn('medapp-field', className)} {...rest} />;
}

export function MedTextarea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea data-slot="med-textarea" dir="auto" className={cn('medapp-field', className)} {...rest} />;
}
