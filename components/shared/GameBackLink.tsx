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
 */

import { Link, type LinkProps } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface GameBackLinkProps {
  /** Where "back" goes — usually `/builds` or the game's own menu route. */
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
}

export function GameBackLink({ to, label = 'RMH Studios', z = 'z-50', className }: GameBackLinkProps) {
  return (
    <div
      className={cn(
        'absolute top-[calc(0.75rem+var(--safe-top))] left-[calc(0.75rem+var(--safe-left))]',
        z,
        className,
      )}
    >
      <Link to={to}>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-1.5 border border-zinc-800 bg-black/50 text-xs text-zinc-500 backdrop-blur-sm hover:text-white sm:text-sm"
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
