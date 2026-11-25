/**
 * The Lights Out board, drawn as the daily draws it: rectangles and masked shapes as a grid, triangles as centred
 * rows. Each cell is a native button (Tab order row by row, Space or Enter presses) that names its row and column and
 * reports whether it is lit. Shared by the daily game, the board maker and the member-made board page.
 */
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { isActiveCell, type GridShape } from '@/lib/lights-out/shapes';
import type { Grid } from '@/lib/lights-out/lights-out';

const cellBase = 'touch-manipulation rounded-site-sm transition-colors duration-site-fast disabled:cursor-default';
const cellState = (on: boolean) =>
  on ? 'bg-site-warning text-site-warning-fg' : 'border border-site-border bg-site-bg-subtle';
const hintRing = 'ring-2 ring-site-accent ring-offset-2 ring-offset-site-surface animate-pulse';

interface LightsGridProps {
  grid: Grid;
  shape: GridShape;
  onPress: (r: number, c: number) => void;
  /** The whole board is inert (a solved board, a preview). */
  disabled?: boolean;
  /** The cell the hint points at, if any (the daily's hint). */
  hintedCell?: [number, number] | null;
  /** The id of the element that describes the hinted cell, for `aria-describedby`. */
  hintId?: string;
}

export function LightsGrid({ grid, shape, onPress, disabled = false, hintedCell = null, hintId }: LightsGridProps) {
  const { t } = useTranslation('c-lights-out');
  const label = (r: number, c: number) =>
    t('cell-label', {
      defaultValue: 'Light row {{row}}, column {{col}}',
      row: r + 1,
      col: c + 1,
    });

  if (shape.type === 'triangle') {
    return (
      <div className="flex flex-col items-center gap-2 py-2">
        {grid.map((row, r) => (
          <div key={r} className="flex justify-center gap-2">
            {row.map((on, c) => {
              const isHinted = hintedCell?.[0] === r && hintedCell?.[1] === c;
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  onClick={() => onPress(r, c)}
                  disabled={disabled}
                  aria-label={label(r, c)}
                  aria-pressed={on}
                  aria-describedby={isHinted ? hintId : undefined}
                  className={`size-10 ${cellBase} ${cellState(on)} ${isHinted ? hintRing : ''} ${disabled ? '' : 'cursor-pointer hover:opacity-90 active:scale-95'}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  const gridCols = shape.cols;
  const gridRows = shape.rows;
  const isCustom = shape.type === 'custom';
  return (
    <div
      className="grid w-full gap-2"
      style={{
        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        gridTemplateRows: `repeat(${gridRows}, 1fr)`,
        aspectRatio: `${gridCols} / ${gridRows}`,
      }}
    >
      {grid.map((row, r) =>
        row.map((on, c) => {
          const active = isActiveCell(shape, r, c);
          const isHinted = hintedCell?.[0] === r && hintedCell?.[1] === c;

          if (isCustom && !active) {
            return <div key={`${r}-${c}`} />;
          }

          return (
            <button
              key={`${r}-${c}`}
              type="button"
              onClick={() => onPress(r, c)}
              disabled={disabled || !active}
              // Each cell names itself, reports its on/off state, and says when it is the hinted one: the board was
              // once nameless buttons whose only state was a colour.
              aria-label={label(r, c)}
              aria-pressed={on}
              aria-describedby={isHinted ? hintId : undefined}
              className={`relative min-h-0 ${cellBase} ${cellState(on)} ${isHinted ? hintRing : ''} ${!disabled && active ? 'cursor-pointer hover:opacity-90 active:scale-95' : ''}`}
            >
              {/* A shape, not just a ring: the hint has to survive both colour-blindness and a greyscale display. */}
              {isHinted ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 flex items-center justify-center text-site-accent"
                >
                  <Sparkles className="h-1/3 w-1/3" />
                </span>
              ) : null}
            </button>
          );
        }),
      )}
    </div>
  );
}
