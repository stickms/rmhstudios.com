import type { ComponentProps } from 'react';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/**
 * A select on paper. It is the shared Radix listbox in its `app` tier (keyboard navigation, typeahead, the listbox
 * ARIA wiring and the hidden native input come with it; the list portals into `.app-theme`, so it wears this app's
 * palette in both modes), with the trigger drawn as a field (`.medapp-select`: 44px, 14px radius, paper, 1px border).
 * `<option>` children and `onChange(e.target.value)` are the native shape, as for `Select`.
 */
export function MedSelect({ className, ...rest }: Omit<ComponentProps<typeof Select>, 'tier' | 'controlSize'>) {
  return <Select tier="app" className={cn('medapp-select', className)} {...rest} />;
}
