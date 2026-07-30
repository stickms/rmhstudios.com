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
 * Two radii, so callers can pick how eagerly things merge:
 *  - `rmh-liquid-sm` — tight: rounds corners, fuses only touching shapes.
 *  - `rmh-liquid`    — the default: fuses neighbours a few px apart.
 *
 * Cost + correctness notes (why this is opt-in per cluster, never global):
 *  - An SVG filter is a real per-frame GPU cost, so `radial.css` only enables
 *    these ≥768px and under `prefers-reduced-motion: no-preference`.
 *  - **Only on small, bounded clusters.** A filtered subtree whose children
 *    animate cannot take the compositor fast path, so the whole filter graph is
 *    re-run every frame over the whole filter region. On a full-viewport layer
 *    that is catastrophic: the backdrop blob field used to carry a third,
 *    wide-radius filter (`rmh-liquid-lg`) and it pinned every desktop `_site`
 *    page at ~15fps. It was removed along with the filter — the field fuses
 *    itself with soft-edged gradients now (see `radial.css`
 *    `.radial-backdrop__blob`). Don't reintroduce a wide radius for that job.
 *  - **Only on opaque shapes.** The ramp maps alpha `a → ramp·a − (ramp−1)/2`,
 *    so anything below ~50% alpha is clamped away and the filter silently
 *    becomes a no-op (which is exactly how the field's cost went unnoticed).
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
] as const;
