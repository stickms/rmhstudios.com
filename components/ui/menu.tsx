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
 * ## The grammar is text rows in one rounded panel
 *
 * A dropdown is ONE rounded slab, not a stack of pills and not a stack of bands.
 * A row has no fill, edge or radius of its own — it is its text (and icon) —
 * and hovering it, or moving the keyboard highlight onto it, wakes a gentle
 * glow behind the text: a soft accent wash that fades to nothing at the row's
 * own edges (globals.css §7.3, `[data-slot='menu-item']::before`). The panel
 * clips its contents (`overflow`, `py-1.5`, no side padding), and row text is
 * inset `px-4` so it clears the panel's curve. A row that sits OUTSIDE a clipping
 * panel (a list inside a dialog) opts back in with its own `rounded-site-sm`.
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
  'rounded-none px-4 py-2 text-left text-sm outline-none',
  'transition-colors duration-site',
  // Focus is the highlight here. The menu moves real DOM focus between rows
  // (that is what `role="menu"` requires), so the focused row must read as the
  // highlighted one — otherwise a keyboard user is navigating an invisible
  // cursor. The global focus ring still lands on top of it. The glow is the row's
  // eversion layer (`data-evert`, globals.css §7.3): hover, press and keyboard
  // focus wake it.
  'disabled:pointer-events-none disabled:opacity-50',
  // A disabled <a> is not a thing, so links opt out through the attribute the
  // menu's roving focus and the pointer both read.
  'aria-disabled:pointer-events-none aria-disabled:opacity-50',
);

const TONE: Record<MenuItemTone, string> = {
  default: 'text-site-text',
  danger: 'text-site-danger',
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
    'data-evert': '',
    // A row is text, not a body: no rim slab, no soft body, no haze floor. Only the hover glow (`data-evert`) wakes.
    'data-jelly': 'off',
    'data-tone': tone,
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
 * Inset to the rows' text and softened, so it divides the groups without
 * becoming a hairline that runs into the panel's rounded corners: the panel is
 * a 32px slab, a full-bleed 1px rule meets its curve at a point.
 */
export function MenuSeparator({ className }: { className?: string }) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className={cn('mx-4 my-1.5 h-px bg-site-border/50', className)}
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
        'px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-site-text-dim',
        className,
      )}
    >
      {children}
    </div>
  );
}
