'use client';

import { cn } from '@/lib/utils';

interface SwitchProps {
 checked: boolean;
 onCheckedChange: (checked: boolean) => void;
 disabled?: boolean;
 id?: string;
 className?: string;
 'aria-label'?: string;
 'aria-labelledby'?: string;
 'aria-describedby'?: string;
}

/** Accessible on/off toggle (role="switch") styled with site tokens. */
export function Switch({ checked, onCheckedChange, disabled, className, ...rest }: SwitchProps) {
 return (
 <button
 type="button"
 role="switch"
 aria-checked={checked}
 disabled={disabled}
 data-slot="switch"
 onClick={() => onCheckedChange(!checked)}
 className={cn(
 // Compact visual track with a larger invisible hit area. This keeps dense
 // settings rows easy to scan without shrinking the touch target.
 "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-site-border bg-site-surface-active shadow-site-sm after:absolute after:-inset-x-2 after:-inset-y-2.5 after:content-['']",
 // The track is always the off surface (never the same colour as the knob, so
 // the knob stays visible even in high-contrast, where --site-border ==
 // --site-text). The accent of the "on" state is a layer that everts out of
 // the knob as it travels and swallows back into it (globals.css §7.3).
 disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
 className
 )}
 {...rest}
 >
 <span
 aria-hidden
 // Travels on the eversion's landing spring (globals.css §7.3).
 data-switch-knob=""
 className={cn(
 // Knob colour is chosen to contrast its track in BOTH states: accent-fg is
 // guaranteed legible on the accent fill (on), text on the surface (off).
 'block h-4 w-4 rounded-full shadow-site-sm',
 checked ? 'translate-x-[21px] bg-site-accent-fg' : 'translate-x-[3px] bg-site-text',
 )}
 />
 </button>
 );
}
