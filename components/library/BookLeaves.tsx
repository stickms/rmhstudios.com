/**
 * BookLeaves — the loose pages inside a shelf book's page block.
 *
 * They lie between the cover and the back of the volume, hidden at rest; on hover/focus
 * (book-riffle.css, `.lib-book__leaf`) they flick out past the fore-edge one after another, so
 * the book riffles through its pages in direct response to the pointer. Purely presentational:
 * the CSS owns the motion. Each page carries its index (`--leaf`) and its depth as a fraction of
 * the book's thickness (`--z`, negative: behind the cover).
 */
import type { CSSProperties } from 'react';

const LEAF_COUNT = 6;
const LEAVES = Array.from({ length: LEAF_COUNT }, (_, i) => ({
  leaf: i,
  z: -(i + 1) / (LEAF_COUNT + 1),
}));

export function BookLeaves() {
  return (
    <>
      {LEAVES.map(({ leaf, z }) => (
        <span
          key={leaf}
          className="lib-book__leaf"
          style={{ '--leaf': leaf, '--z': z } as CSSProperties}
          aria-hidden="true"
        />
      ))}
    </>
  );
}
