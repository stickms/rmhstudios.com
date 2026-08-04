/**
 * Massive March — the island's glyphs.
 *
 * Eight marks that look like they were scratched from things that grow on the
 * headland, and are named nowhere in the interface. That silence is deliberate:
 * §12.4 wants each group to arrive at its own words for these — one table's
 * "fork tree" is another's "angry antler" — and printing a caption under them
 * would hand over the vocabulary the puzzle exists to make you build.
 *
 * So they are drawn, never labelled. The only text near one is whatever the
 * players end up shouting at each other.
 *
 * Accessible name is the id, which is not a word the game uses anywhere a
 * player can read it, but is stable — a screen-reader user needs *some*
 * consistent handle to say "press the third one", and an unlabelled path gives
 * them nothing at all.
 */

import type { SymbolId } from '@/lib/massive-march/world/sites';

const PATHS: Record<SymbolId, string> = {
  // A trunk that splits, twice.
  fork: 'M12 21 L12 13 M12 13 L6 5 M12 13 L18 5 M6 5 L3 2 M18 5 L21 2',
  // Two curved tines off a stem.
  antler: 'M12 21 L12 9 M12 14 C8 13 6 9 7 4 M12 12 C16 11 18 7 17 3',
  // A frond: a spine with leaflets.
  frond: 'M12 21 L12 3 M12 7 L6 4 M12 7 L18 4 M12 12 L7 9 M12 12 L17 9 M12 17 L8 14 M12 17 L16 14',
  // A seed case, split.
  seed: 'M12 3 C5 8 5 16 12 21 C19 16 19 8 12 3 Z M12 3 L12 21',
  // Water, twice.
  wave: 'M2 9 C6 4 9 14 13 9 C16 5 19 13 22 9 M2 16 C6 11 9 21 13 16 C16 12 19 20 22 16',
  // A boulder on a boulder.
  stone: 'M4 20 L7 12 L15 11 L19 20 Z M8 11 L10 5 L15 6 L16 11',
  // A nest: three arcs.
  nest: 'M3 13 C7 6 17 6 21 13 M5 17 C8 12 16 12 19 17 M8 20 L16 20',
  // A closed bud on a stem.
  bud: 'M12 21 L12 12 M12 12 C7 12 6 5 12 2 C18 5 17 12 12 12 Z',
};

export function Glyph({
  symbol,
  size = 28,
  color = 'currentColor',
  className,
}: {
  symbol: SymbolId;
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={symbol}
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[symbol]} />
    </svg>
  );
}
