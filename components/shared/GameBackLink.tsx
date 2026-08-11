'use client';

/**
 * GameBackLink — the "leave this game" corner control.
 *
 * Every full-screen game route grew its own copy of the same twelve lines: a
 * `<div className="absolute top-3 left-3 z-50">` wrapping a ghost `<Button>`
 * with an `ArrowLeft` and a label that hides below `sm`. Six copies, none of
 * which allowed for the hardware — `top-3 left-3` is measured from the window,
 * and on a phone held sideways (which is how these games are played) the window
 * starts underneath the sensor housing. The single control every game shares was
 * the one control every game hid.
 *
 * One component, one geometry: the floating edge PLUS the device's own inset, so
 * the button sits the same visual distance from the first usable pixel on a
 * notched phone, a flat phone, and a desktop.
 *
 * It also goes BACK. It used to be a plain link to a catalog page wearing an
 * ArrowLeft, so the arrow lied: reaching a game from `/explore` or from the
 * game's own menu and pressing it landed you on `/games`, past wherever you came
 * from and — in the sub-screen case — out of the game instead of up one level.
 * `useBackOrFallback` steps back when this SPA session has its own prior entry
 * and falls through to `to` when it does not (a shared link, a new tab, a search
 * result). `to` stays required and stays a real `<Link>` href, so the control is
 * still a right-clickable link with a correct destination on a cold load.
 */

import { Link, type LinkProps } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBackOrFallback } from '@/hooks/useBackOrFallback';
import { cn } from '@/lib/utils';

interface GameBackLinkProps {
  /**
   * Where back goes when there is no history to step into — the game's own menu
   * route if it has one, otherwise the catalog it belongs to (`/games`,
   * `/apps`). Not the destination on a normal in-session press; see the
   * docblock.
   */
  to: LinkProps['to'];
  /** Visible next to the arrow from `sm` up. Defaults to the studio name. */
  label?: string;
  /**
   * Stacking order. Games layer their own overlays wildly (Rochester Offensive
   * needs 60 to clear its scoreboard), so this stays a prop rather than a
   * constant nobody can override.
   */
  z?: string;
  className?: string;
  /**
   * Which ground this control is sitting on.
   *
   * It shipped assuming every game is dark, because for six games it was — the
   * chip is black at 50% with a zinc border and zinc-500 ink. On Bum's Rush,
   * whose whole surface is cream paper, that renders as an unreadable dark blob
   * in the corner: near-black on near-white, with the label invisible until you
   * hover. `tone` is the two-line fix, and `dark` stays the default so no
   * existing caller changes.
   */
  tone?: 'dark' | 'light';
}

const TONES = {
  dark: 'border-zinc-800 bg-black/50 text-zinc-500 hover:text-white',
  // Opacity-modified black/white rather than a palette step, so this reads
  // correctly on any light ground without importing that game's tokens.
  light: 'border-black/25 bg-white/55 text-black/65 hover:text-black',
} as const;

export function GameBackLink({
  to,
  label = 'RMH Studios',
  z = 'z-50',
  className,
  tone = 'dark',
}: GameBackLinkProps) {
  const goBack = useBackOrFallback();

  return (
    <div
      className={cn(
        'absolute top-[calc(0.75rem+var(--safe-top))] left-[calc(0.75rem+var(--safe-left))]',
        z,
        className,
      )}
    >
      <Link to={to} onClick={goBack}>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'flex items-center gap-1.5 border text-xs backdrop-blur-sm sm:text-sm',
            TONES[tone],
          )}
        >
          <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4" aria-hidden />
          <span className="hidden sm:inline">{label}</span>
          {/* The label is decorative below `sm`, but the control still has to
              name itself for anyone not reading the arrow. */}
          <span className="sr-only sm:hidden">{label}</span>
        </Button>
      </Link>
    </div>
  );
}
