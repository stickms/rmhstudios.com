import {
  GRID_COLS,
  GRID_ROWS,
  TILE_POS,
} from '@/lib/elections/tilegrid';
import type { Tone } from '@/lib/elections/map-model';

export interface TileCell {
  tone: Tone;
  caption: string;
  flipped?: boolean;
  /** Accessible description, e.g. "Pennsylvania: Senate, Democrat called, +3.1". */
  label: string;
}

/**
 * The cartogram. Equal squares, one `<button>` each; the grid is a real CSS grid
 * so it reflows with the viewport and every tile stays a ≥ 28px tap target even
 * at 320px (the surrounding padding collapses first).
 */
export function TileGrid({
  cells,
  selected,
  onSelect,
  ariaLabel,
}: {
  cells: Map<
    string,
    TileCell
  >;
  selected:
    | string
    | null;
  onSelect: (
    postal: string,
  ) => void;
  ariaLabel: string;
}) {
  return (
    <div
      className="el-grid el-box"
      role="group"
      aria-label={
        ariaLabel
      }
      style={{
        ['--cols' as string]:
          GRID_COLS,
      }}
    >
      {Object.entries(
        TILE_POS,
      ).map(
        ([
          postal,
          [
            row,
            col,
          ],
        ]) => {
          const cell =
            cells.get(
              postal,
            );
          const tone =
            cell?.tone ??
            'none';
          return (
            <button
              key={
                postal
              }
              type="button"
              className={`el-tile el-tile--${tone}`}
              style={{
                gridRow:
                  row +
                  1,
                gridColumn:
                  col +
                  1,
              }}
              aria-pressed={
                selected ===
                postal
              }
              aria-label={
                cell?.label ??
                postal
              }
              onClick={() =>
                onSelect(
                  postal,
                )
              }
            >
              <span className="el-tile__code">
                {
                  postal
                }
              </span>
              {cell?.caption ? (
                <span className="el-tile__cap">
                  {
                    cell.caption
                  }
                </span>
              ) : null}
              {cell?.flipped ? (
                <span className="el-tile__flip">
                  FLIP
                </span>
              ) : null}
            </button>
          );
        },
      )}
    </div>
  );
}

export const GRID_DIMENSIONS =
  {
    cols: GRID_COLS,
    rows: GRID_ROWS,
  };
