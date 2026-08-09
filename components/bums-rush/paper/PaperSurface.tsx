'use client';

/**
 * The paper surfaces every Bum's Rush DOM screen is built from.
 *
 * The site's `.glass-*` elevation classes are deliberately not used anywhere in
 * this game. They carry a material — translucent glass over the aurora canvas —
 * that is the opposite of the one this game is made of, and the game route
 * suppresses the site theme anyway, so a `.glass-pane` here would sample a
 * background that is not there and render as a grey rectangle. These four
 * components are the parallel vocabulary: a sheet, a card, a sticky note and a
 * strip of tape, all painted from the `--bum-*` tokens.
 *
 * They are DOM rather than canvas on purpose (design doc §11.3, §13): text that
 * scales with the browser's font size, is selectable, is translated, and is
 * reachable by a screen reader is worth more than text that matches the drawing
 * perfectly.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SheetProps {
  children: ReactNode;
  className?: string;
  /** Ruled + margin lines, as on the level sheet. Off for menus that are cards. */
  ruled?: boolean;
}

/**
 * A full sheet of paper. The ruled lines and margin are painted with gradients
 * rather than an image so they stay crisp at any zoom and cost nothing to load;
 * `background-size` is in `rem` so they scale with the user's font size instead
 * of pinning the page to a 16px assumption.
 */
export function PaperSheet({ children, className, ruled = true }: SheetProps) {
  return (
    <div
      className={cn('relative bg-bum-paper text-bum-ink', className)}
      style={
        ruled
          ? {
              backgroundImage: [
                'repeating-linear-gradient(to bottom, transparent 0, transparent calc(1.75rem - 1px), var(--bum-rule) calc(1.75rem - 1px), var(--bum-rule) 1.75rem)',
                'linear-gradient(to right, transparent 0, transparent 3.5rem, var(--bum-margin) 3.5rem, var(--bum-margin) calc(3.5rem + 1px), transparent calc(3.5rem + 1px))',
              ].join(','),
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

interface CardProps {
  children: ReactNode;
  className?: string;
  /**
   * A cut-out sits slightly askew with a drop shadow, which is the construction
   * language for "this thing moves" (design doc §2.6). Menus that are pinned in
   * place stay square.
   */
  tilt?: number;
  taped?: boolean;
}

/**
 * A card of paper laid on the sheet. The tilt is applied as an inline transform
 * rather than a utility because it is per-instance data, and it is capped at
 * ±2.5° — past that, text on a card starts to read as broken rather than
 * hand-placed, and it costs legibility for players with low vision.
 */
export function PaperCard({ children, className, tilt = 0, taped = false }: CardProps) {
  const angle = Math.max(-2.5, Math.min(2.5, tilt));
  return (
    <div
      className={cn(
        'relative rounded-bum bg-bum-surface text-bum-ink',
        'border border-bum-paper-edge shadow-[0_2px_0_0_var(--bum-paper-edge),0_6px_14px_-8px_rgba(0,0,0,0.45)]',
        className,
      )}
      style={angle === 0 ? undefined : { transform: `rotate(${angle}deg)` }}
    >
      {taped ? <Tape className="-top-2 left-1/2 -translate-x-1/2" /> : null}
      {children}
    </div>
  );
}

/**
 * A strip of tape. Purely decorative, so it is hidden from assistive tech and
 * from pointer events — a player must never be able to click the tape instead
 * of the button it is holding down.
 */
export function Tape({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute h-4 w-14 rotate-[-3deg] bg-bum-tape',
        'shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]',
        className,
      )}
    />
  );
}

interface NoteProps {
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'highlight';
}

/**
 * A sticky note — the game's tutorial and hint voice. Highlighted notes use
 * `--bum-highlight` behind the ink rather than coloured ink on paper, because
 * the highlighter is the one marker in the drawing that is meant to be
 * unmissable, and yellow ink on cream is not.
 */
export function StickyNote({ children, className, tone = 'default' }: NoteProps) {
  return (
    <div
      className={cn(
        'relative rounded-bum-sm px-3 py-2 text-sm leading-snug',
        'shadow-[0_3px_8px_-4px_rgba(0,0,0,0.4)]',
        tone === 'highlight' ? 'bg-bum-highlight text-bum-ink' : 'bg-bum-paper-2 text-bum-ink',
        className,
      )}
    >
      {children}
    </div>
  );
}
