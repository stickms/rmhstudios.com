'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/Tooltip';

type IconButtonProps = React.ComponentProps<typeof Button> & {
 /** Required — becomes the accessible name AND the tooltip text. */
 label: string;
 /** Icon to render (or pass children instead, e.g. for `asChild` links). */
 icon?: LucideIcon;
 /** Show the hover/focus tooltip. Defaults to true. */
 showTooltip?: boolean;
 tooltipClassName?: string;
};

/**
 * An icon-only button that can't be shipped without a label. Bundles the three
 * things an icon control always needs — `aria-label`, a hover/focus `Tooltip`,
 * and consistent `icon` sizing — so every icon button across the app looks and
 * announces the same way.
 *
 * ```tsx
 * <IconButton icon={Trash2} label="Delete" variant="ghost" onClick={remove} />
 * <IconButton asChild label="Settings"><Link to="/settings"><Settings /></Link></IconButton>
 * ```
 */
export function IconButton({
 label,
 icon: Icon,
 children,
 showTooltip = true,
 tooltipClassName,
 variant = 'ghost',
 size = 'icon-sm',
 ...props
}: IconButtonProps) {
 const button = (
 <Button
 variant={variant}
 size={size}
 aria-label={label}
 title={showTooltip ? undefined : label}
 {...props}
 >
 {Icon ? <Icon aria-hidden /> : children}
 </Button>
 );

 if (!showTooltip) return button;
 return (
 <Tooltip content={label} className={tooltipClassName}>
 {button}
 </Tooltip>
 );
}
