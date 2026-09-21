'use client';

/**
 * One GlobeSet card.
 *
 * The six dot positions are **fixed** — red always top-left, purple always
 * bottom-right — and an absent colour leaves its slot empty rather than
 * closing the gap. That is not a layout convenience: the player's whole job is
 * to count each colour across a handful of cards, and a dot that moves between
 * cards has to be re-identified on every single one. Pinned positions turn the
 * count into a scan down a column.
 *
 * Colour is the card's data (see the `--globeset-*` group in `globals.css`), so
 * it cannot be the ONLY channel carrying it. Each dot can also stamp a distinct
 * shape — circle, triangle, square, diamond, hexagon, star — which the board
 * turns on automatically for anyone playing with a colour-vision mode set, and
 * which anyone can turn on from the game's own controls.
 */

import { memo } from 'react';
import { m as motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { DOT_COLORS, dotsOf, type Card, type DotColor } from '@/lib/globeset/cards';
import { APPLE_SPRING } from '@/lib/motion';
import { cn } from '@/lib/utils';

/** Dot centres on a 3-wide, 2-tall grid, in a 100×72 viewBox. */
const SLOTS: { x: number; y: number }[] = [
  { x: 20, y: 22 },
  { x: 50, y: 22 },
  { x: 80, y: 22 },
  { x: 20, y: 52 },
  { x: 50, y: 52 },
  { x: 80, y: 52 },
];

const DOT_R = 11;

/** The glyph stamped inside a dot, as an SVG path in a unit box around (0,0). */
function shapePath(shape: DotColor['shape'], r: number): string {
  const p = (n: number) => Number(n.toFixed(2));
  switch (shape) {
    case 'circle':
      return `M ${p(-r)} 0 a ${p(r)} ${p(r)} 0 1 0 ${p(r * 2)} 0 a ${p(r)} ${p(r)} 0 1 0 ${p(-r * 2)} 0 Z`;
    case 'triangle':
      return `M 0 ${p(-r)} L ${p(r * 0.92)} ${p(r * 0.66)} L ${p(-r * 0.92)} ${p(r * 0.66)} Z`;
    case 'square':
      return `M ${p(-r * 0.78)} ${p(-r * 0.78)} H ${p(r * 0.78)} V ${p(r * 0.78)} H ${p(-r * 0.78)} Z`;
    case 'diamond':
      return `M 0 ${p(-r)} L ${p(r)} 0 L 0 ${p(r)} L ${p(-r)} 0 Z`;
    case 'hexagon': {
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        return `${p(Math.cos(a) * r)} ${p(Math.sin(a) * r)}`;
      });
      return `M ${pts.join(' L ')} Z`;
    }
    case 'star': {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const rad = i % 2 === 0 ? r : r * 0.45;
        return `${p(Math.cos(a) * rad)} ${p(Math.sin(a) * rad)}`;
      });
      return `M ${pts.join(' L ')} Z`;
    }
  }
}

export interface GlobeSetCardProps {
  card: Card;
  selected: boolean;
  /** Part of the GlobeSet a hint has pointed at. */
  hinted: boolean;
  /** The auto-solver is taking this card right now. */
  solving: boolean;
  disabled: boolean;
  /** Stamp a distinct glyph in each dot as well as colouring it. */
  shapes: boolean;
  /** 1-based, for the keyboard shortcut badge and the accessible name. */
  position: number;
  onToggle: () => void;
  /**
   * The globe turns to a card when it takes keyboard focus, so the focus ring
   * and the picture agree about which card is being talked about. Unused by the
   * flat board, where every card is already facing you.
   */
  onFocus?: () => void;
}

function GlobeSetCardImpl({
  card,
  selected,
  hinted,
  solving,
  disabled,
  shapes,
  position,
  onToggle,
  onFocus,
}: GlobeSetCardProps) {
  const { t } = useTranslation('c-daily-puzzles');

  /**
   * The card names its own dots.
   *
   * It was the board's job at first, and the race board — which renders the
   * same card — passed a bare "Card 3" instead, so a screen-reader user could
   * hear which card they were on and nothing about what was printed on it.
   * A card knows its own dots; nothing else should have to remember to say so.
   */
  const dots = dotsOf(card)
    .map((dot) => t(`globeset-color-${dot.id}`, { defaultValue: dot.id }))
    .join(', ');
  const label = t('globeset-card-label', {
    defaultValue: 'Card {{n}}: {{dots}}',
    n: position,
    dots,
  });

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      onFocus={onFocus}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={label}
      data-selected={selected || undefined}
      transition={APPLE_SPRING.snappy}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      className={cn(
        'group relative aspect-[10/7] w-full rounded-site outline-none',
        'border-2 shadow-site-sm transition-[border-color,box-shadow,transform]',
        'duration-site focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2',
        'focus-visible:ring-offset-site-bg disabled:cursor-default',
        selected
          ? 'border-site-accent shadow-[0_0_0_4px_var(--site-accent-dim)]'
          : 'border-[var(--globeset-card-edge)] hover:border-site-accent/60',
        hinted && !selected && 'border-site-warning',
        solving && 'border-site-success',
      )}
      style={{ background: 'var(--globeset-card-face)' }}
    >
      {/* Keyboard shortcut badge — the board binds 1–7 to these positions. */}
      <span
        aria-hidden
        className="absolute left-1.5 top-1 font-mono text-[0.6rem] leading-none opacity-35"
        style={{ color: 'var(--globeset-dot-ink)' }}
      >
        {position}
      </span>

      <svg
        viewBox="0 0 100 72"
        className="h-full w-full"
        role="presentation"
        focusable="false"
        aria-hidden
      >
        {DOT_COLORS.map((dot) => {
          const present = (card & (1 << dot.bit)) !== 0;
          if (!present) return null;
          const slot = SLOTS[dot.bit];
          return (
            <g key={dot.id} transform={`translate(${slot.x} ${slot.y})`}>
              <circle
                r={DOT_R}
                fill={`var(${dot.token})`}
                stroke="var(--globeset-dot-ink)"
                strokeOpacity={0.45}
                strokeWidth={1}
              />
              {shapes && (
                <path
                  d={shapePath(dot.shape, DOT_R * 0.58)}
                  fill="none"
                  stroke="var(--globeset-dot-ink)"
                  strokeOpacity={0.8}
                  strokeWidth={1.6}
                  strokeLinejoin="round"
                />
              )}
            </g>
          );
        })}
      </svg>
    </motion.button>
  );
}

/**
 * Memoised on purpose: a seven-card board re-renders on every tick of the run
 * clock, and a card's appearance depends on nothing that changes per tick.
 */
export const GlobeSetCard = memo(GlobeSetCardImpl);
