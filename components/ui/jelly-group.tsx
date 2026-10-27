'use client';

/**
 * JellyGroup — one jelly parent for a cluster of related controls.
 *
 * The group is the only body: it takes a glass role (and with it the rim, the haze and the soft press). Its
 * members lie flat inside it, with no edge or body of their own, the way the feed's compose + jump-to-top
 * control and the dropdown menus already read. Hover and the selected state are a soft feathered glow on the
 * parent (`data-evert` state layer, an opacity transition), never a raised pill. See
 * docs/superpowers/specs/2026-10-27-jelly-groups-design.md.
 *
 * Use it for a row of same-kind, mutually related controls (toolbars, action rows, segmented choices). A lone
 * control stays a pill; a real tab strip is `LiquidTabs`. Groups are one level deep.
 */

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';

import { cn } from '@/lib/utils';
import './jelly-group.css';

type GroupRole = 'chrome' | 'pane' | 'fill';

export interface JellyGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Glass elevation (role) of the parent body. Sticky bars pass `chrome`. */
  surface?: GroupRole;
  size?: 'sm' | 'default';
  orientation?: 'horizontal' | 'vertical';
}

function JellyGroupRoot({
  surface = 'fill',
  size = 'default',
  orientation = 'horizontal',
  className,
  ...props
}: JellyGroupProps) {
  return (
    <div
      data-slot="jelly-group"
      data-size={size}
      data-orientation={orientation}
      className={cn(`glass-${surface}`, className)}
      {...props}
    />
  );
}

export interface JellyGroupItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  asChild?: boolean;
}

const Item = React.forwardRef<HTMLButtonElement, JellyGroupItemProps>(function JellyGroupItem(
  { selected, asChild = false, disabled, className, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  const on = Boolean(selected) && !disabled;
  return (
    <Comp
      ref={ref}
      {...(asChild
        ? {}
        : {
            type: 'button',
            disabled,
            // A toggle only when the caller says so: a button that opens a panel is not "pressed".
            'aria-pressed': selected === undefined ? undefined : on,
          })}
      data-slot="jelly-group-item"
      // The group is the body; a member must not be pressed as a second one (lib/jelly/physics.ts).
      data-jelly="off"
      data-evert=""
      data-selected={on ? '' : undefined}
      className={cn(className)}
      {...props}
    />
  );
});

function Divider() {
  return <span data-slot="jelly-group-divider" aria-hidden />;
}

export const JellyGroup = Object.assign(JellyGroupRoot, { Item, Divider });
