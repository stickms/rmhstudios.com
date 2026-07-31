import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { Check, TriangleAlert, X } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Shared pill/badge primitive. Consolidates the many inline
 * `inline-flex items-center gap-1 rounded-full …` chips scattered across the
 * feed, profile, predictions and shop columns into one token-driven component
 * so every status/label pill looks the same.
 *
 * **Status variants carry a glyph, not just a colour.** `success`, `warning`
 * and `danger` are the three variants whose meaning is *semantic* rather than
 * decorative, and colour alone cannot carry that meaning: roughly 8% of men
 * have a colour-vision deficiency, and red/green — the exact pair these
 * variants lean on — is the most common one to lose. The colour-vision modes in
 * Settings → Appearance retint the palette, but a retint only helps a viewer
 * who has found and enabled it. A glyph works for everyone, immediately, and
 * satisfies WCAG 1.4.1 (Use of Colour) without depending on configuration.
 *
 * The icon is decorative (`aria-hidden`) because the badge's own text already
 * names the state for assistive technology; it exists for sighted users who
 * cannot separate the hues. Pass `icon={false}` for the rare case where the
 * caller supplies its own leading glyph, and `icon={<Custom />}` to override.
 */
const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1 rounded-[var(--site-control-radius)] border font-semibold whitespace-nowrap transition-colors [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3",
  {
    variants: {
      variant: {
        default: 'border-site-border bg-site-surface text-site-text-muted',
        accent: 'border-site-accent/20 bg-site-accent-dim text-site-accent',
        solid: 'border-site-accent bg-site-accent text-site-accent-fg',
        success: 'border-site-success/20 bg-site-success/10 text-site-success',
        warning: 'border-site-warning/20 bg-site-warning/10 text-site-warning',
        danger: 'border-site-danger/20 bg-site-danger/10 text-site-danger',
        outline: 'border border-site-border text-site-text-muted',
      },
      size: {
        sm: 'px-2 py-0.5 text-[10px]',
        default: 'px-2.5 py-1 text-xs',
        lg: 'px-3 py-1.5 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

/**
 * The non-colour signal for each semantic variant. Only the three status
 * variants get one — `accent`/`solid`/`default`/`outline` are labels, not
 * states, so a glyph would be noise.
 */
const STATUS_ICONS = {
  success: Check,
  warning: TriangleAlert,
  danger: X,
} as const;

function Badge({
  className,
  variant,
  size,
  asChild = false,
  icon,
  children,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
    /**
     * Leading glyph. Defaults to this variant's status icon; `false` opts out
     * (for callers that render their own), or pass a node to override.
     */
    icon?: React.ReactNode | false;
  }) {
  const Comp = asChild ? Slot : 'span';

  // `asChild` hands rendering to the caller's element, so injecting a sibling
  // would break Slot's single-child contract — skip the auto icon there.
  const AutoIcon =
    !asChild && icon === undefined && variant && variant in STATUS_ICONS
      ? STATUS_ICONS[variant as keyof typeof STATUS_ICONS]
      : null;

  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {AutoIcon ? <AutoIcon aria-hidden /> : null}
      {icon && icon !== true ? icon : null}
      {children}
    </Comp>
  );
}

export { Badge, badgeVariants };
