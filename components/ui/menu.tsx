'use client';

/**
 * Menu rows — the contents of a floating menu, as primitives.
 *
 * `AnchoredMenu` owns the *panel*: where it hangs, which side it flips to, how
 * it portals, how it closes. What went in it was always the caller's problem,
 * and the result is this repo's most-repeated defect in its purest form — one
 * row shape, hand-copied into fifteen files and then drifted:
 *
 *   px-3 py-2 · px-2 py-1.5 · px-3 py-2.5 · px-3 py-1.5     (four paddings)
 *   square full-bleed rows · rounded-site-sm inset rows      (two grammars)
 *   with `transition-colors` · without                       (two hovers)
 *   text-site-danger + bg-site-danger/10 · plain             (two destructives)
 *
 * None of those is wrong on its own; together they are why two menus opened from
 * adjacent buttons in the same toolbar did not look like the same control. So
 * the row is a primitive now, and the four decisions above are made once.
 *
 * ## The grammar is inset-and-rounded, not full-bleed
 *
 * Of the two shapes in the codebase, this takes the one `Select` already used:
 * the panel carries `p-1` and each row is `rounded-site-sm`, so the highlight is
 * a rounded pill inset from the panel's edge rather than a square band running
 * wall to wall. That is what AppKit and UIKit both draw, and it is the shape the
 * panel's own corner radius implies — a square highlight in a rounded panel
 * collides with the curve on the first and last rows, which is exactly the
 * "sliced corner" the `Select` comment describes one level up.
 *
 * ## Height is a touch target, not a font size
 *
 * `min-h-9 pointer-coarse:min-h-11` — the same floor `LiquidTabs` keeps. The
 * hand-rolled rows were `py-2` around `text-sm`, which lands at 36px: fine under
 * a mouse, under the 44px floor under a thumb, and these menus are how you
 * delete a post.
 */

import * as React from 'react';
import { Link } from '@tanstack/react-router';
import { Check, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * How the row reads.
 *
 * `danger` is the only tone that changes the ink, and it changes the hover tint
 * with it — a destructive row that highlights in the ordinary surface colour
 * reads as "the same as the others, but red", which is the wrong emphasis for
 * the one row in the menu you cannot undo.
 */
export type MenuItemTone = 'default' | 'danger';

interface MenuItemOwnProps {
  /** Leading glyph. Decorative — the label carries the meaning, so it is hidden. */
  icon?: LucideIcon;
  /**
   * Override the icon's ink. For the handful of rows whose icon carries STATE
   * rather than identity — a filled bookmark, a filled pin — where the fill is
   * the whole point and must survive the row's default dim.
   */
  iconClassName?: string;
  tone?: MenuItemTone;
  /**
   * A trailing check, and `role="menuitemradio"` + `aria-checked` instead of a
   * plain `menuitem`. For a row that reports a choice rather than performing an
   * action — a sort order, a language, a playback speed.
   */
  checked?: boolean;
  /** Right-aligned hint: a keyboard shortcut, a count, a current value. */
  hint?: React.ReactNode;
  /** Runs, then it is the caller's job to close. Named to match Radix's menus. */
  onSelect?: (event: React.MouseEvent<HTMLElement>) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

type MenuItemProps = MenuItemOwnProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onSelect' | 'children' | 'className'> & {
    /** Render as a router `Link` instead of a button. */
    href?: string;
  };

/**
 * Every row, whatever it renders as, carries this. It is what
 * `AnchoredMenu`'s roving focus enumerates — a selector over `button, a[href]`
 * would also collect a control that happens to be sitting inside a row (the
 * clear button in a search field, a toggle in a header), and arrowing onto one
 * of those puts the keyboard somewhere the arrow keys cannot get it back out of.
 */
export const MENU_ITEM_ATTR = 'data-menu-item';

const ROW_BASE = cn(
  'relative flex w-full min-h-9 pointer-coarse:min-h-11 cursor-pointer select-none items-center gap-2.5',
  'rounded-site-sm px-3 py-2 text-left text-sm outline-none',
  'transition-colors duration-site',
  // Focus is the highlight here. The menu moves real DOM focus between rows
  // (that is what `role="menu"` requires), so the focused row must read as the
  // highlighted one — otherwise a keyboard user is navigating an invisible
  // cursor. The global focus ring still lands on top of it; this is the fill.
  'hover:bg-site-surface-hover focus-visible:bg-site-surface-hover',
  'disabled:pointer-events-none disabled:opacity-50',
  // A disabled <a> is not a thing, so links opt out through the attribute the
  // menu's roving focus and the pointer both read.
  'aria-disabled:pointer-events-none aria-disabled:opacity-50',
);

const TONE: Record<MenuItemTone, string> = {
  default: 'text-site-text',
  danger: 'text-site-danger hover:bg-site-danger/10 focus-visible:bg-site-danger/10',
};

/** Icon ink follows the row's tone, so a destructive row's glyph is not dim grey. */
const ICON_TONE: Record<MenuItemTone, string> = {
  default: 'text-site-text-dim',
  danger: 'text-site-danger',
};

/**
 * One row of a menu.
 *
 * ```tsx
 * <MenuItem icon={Bookmark} onSelect={save}>Bookmark</MenuItem>
 * <MenuItem icon={Trash2} tone="danger" onSelect={remove}>Delete</MenuItem>
 * <MenuItem icon={Globe} checked={locale === 'en'} onSelect={…}>English</MenuItem>
 * <MenuItem icon={Settings} href="/settings">Settings</MenuItem>
 * ```
 */
export const MenuItem = React.forwardRef<HTMLElement, MenuItemProps>(function MenuItem(
  {
    icon: Icon,
    iconClassName,
    tone = 'default',
    checked,
    hint,
    onSelect,
    onClick,
    children,
    className,
    disabled,
    href,
    ...rest
  },
  ref,
) {
  const body = (
    <>
      {Icon ? (
        <Icon className={cn('h-4 w-4 shrink-0', ICON_TONE[tone], iconClassName)} aria-hidden />
      ) : null}
      {/* `min-w-0` + `truncate`: a menu is a fixed-width panel and a label can be
          a username or a filename. Without this the row grows the panel instead. */}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? (
        <span className="shrink-0 text-xs tabular-nums text-site-text-dim">{hint}</span>
      ) : null}
      {checked ? <Check className="h-4 w-4 shrink-0 text-site-accent" aria-hidden /> : null}
    </>
  );

  const shared = {
    [MENU_ITEM_ATTR]: '',
    'data-slot': 'menu-item',
    role: checked === undefined ? 'menuitem' : 'menuitemradio',
    ...(checked === undefined ? {} : { 'aria-checked': checked }),
    className: cn(ROW_BASE, TONE[tone], className),
  } as const;

  if (href) {
    return (
      <Link
        {...shared}
        ref={ref as React.Ref<HTMLAnchorElement>}
        to={href}
        aria-disabled={disabled || undefined}
        onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
          if (disabled) {
            e.preventDefault();
            return;
          }
          onSelect?.(e);
          onClick?.(e as unknown as React.MouseEvent<HTMLButtonElement>);
        }}
        {...(rest as Record<string, unknown>)}
      >
        {body}
      </Link>
    );
  }

  return (
    <button
      {...shared}
      ref={ref as React.Ref<HTMLButtonElement>}
      type="button"
      disabled={disabled}
      onClick={(e) => {
        onSelect?.(e);
        onClick?.(e);
      }}
      {...rest}
    >
      {body}
    </button>
  );
});

/**
 * A hairline between groups of rows.
 *
 * Negative horizontal margin against the panel's `p-1`, so the rule spans the
 * panel's full width while the rows stay inset — a separator that stops where
 * the rows stop reads as a broken border rather than as a division.
 */
export function MenuSeparator({ className }: { className?: string }) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className={cn('-mx-1 my-1 h-px bg-site-border', className)}
    />
  );
}

/** A group heading. Matches `Select`'s own group label, which is the same idea. */
export function MenuLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-site-text-dim',
        className,
      )}
    >
      {children}
    </div>
  );
}
