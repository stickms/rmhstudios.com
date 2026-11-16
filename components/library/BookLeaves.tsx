/**
 * BookLeaves — the loose pages inside a shelf book's cover.
 *
 * Hidden behind the cover at rest; on hover/focus (catalog-reader.css, `.lib-book__leaf`)
 * they fan open from the spine one after another, so the book riffles through its pages in
 * direct response to the pointer. Purely presentational: the CSS owns the motion.
 */
import type { CSSProperties } from 'react';

const LEAF_COUNT = 5;
const LEAVES = Array.from({ length: LEAF_COUNT }, (_, i) => i);

export function BookLeaves() {
  return (
    <>
      {LEAVES.map((i) => (
        <span
          key={i}
          className="lib-book__leaf"
          style={{ '--leaf': i } as CSSProperties}
          aria-hidden="true"
        />
      ))}
    </>
  );
}
