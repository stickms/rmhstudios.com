'use client';

/**
 * The metaball filter bank for the Radial Avant-Garde Glass UI.
 *
 * One hidden `<svg><defs>` mounted once in the shell, holding the **goo**
 * filters every liquid surface references from CSS (`filter: url(#rmh-liquid…)`).
 *
 * How a goo filter works: blur the source so neighbouring shapes bleed into each
 * other, then run the blurred alpha through a steep contrast ramp
 * (`feColorMatrix`) that snaps it back to a hard edge. Shapes that were merely
 * *near* each other come out fused by a smooth neck — the metaball look — and a
 * lone shape just gets organically rounded corners.
 *
 * Three radii, so callers can pick how eagerly things merge:
 *  - `rmh-liquid-sm` — tight: rounds corners, fuses only touching shapes.
 *  - `rmh-liquid`    — the default: fuses neighbours a few px apart.
 *  - `rmh-liquid-lg` — wide: distant blobs pull together (backdrop fields).
 *
 * Cost + correctness notes (why this is opt-in per cluster, never global):
 *  - An SVG filter is a real per-frame GPU cost, so `radial.css` only enables
 *    these ≥768px and under `prefers-reduced-motion: no-preference`.
 *  - `filter` creates a containing block for `position: fixed` descendants and a
 *    new stacking context — never put one on an ancestor of the fixed chrome.
 *  - The alpha ramp chews up text antialiasing, so a goo group must contain
 *    **shapes only**; glyph/label layers ride above it unfiltered (see the hub's
 *    `radial-hub__glyphs`).
 */
export function LiquidGoo() {
  return (
    <svg className="radial-goo-defs" width="0" height="0" aria-hidden focusable="false">
      <defs>
        {GOO.map(({ id, blur, ramp }) => (
          <filter key={id} id={id} colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="blur" />
            {/* Alpha contrast ramp: multiply alpha hard, then pull it back so the
                blurred halo collapses into a crisp fused silhouette. */}
            <feColorMatrix
              in="blur"
              mode="matrix"
              values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${ramp} -${(ramp - 1) / 2}`}
              result="goo"
            />
            {/* Composite the sharp original back over the fused shape so interior
                detail (borders, inner highlights) stays legible. */}
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        ))}
      </defs>
    </svg>
  );
}

const GOO = [
  { id: 'rmh-liquid-sm', blur: 4, ramp: 15 },
  { id: 'rmh-liquid', blur: 8, ramp: 19 },
  { id: 'rmh-liquid-lg', blur: 16, ramp: 24 },
] as const;
