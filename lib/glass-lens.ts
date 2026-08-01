'use client';

/**
 * The lens displacement map (v2 §3.3).
 *
 * One pure function: an SVG data URI whose red/green channels encode a surface
 * normal for an inset bevel, which `#glass-lens` in `GlassFilter` feeds to an
 * `feDisplacementMap`. The bevel band is a fixed 26px in the map so refraction
 * reads the same on a small capsule and a wide hero.
 *
 * **This used to be a generator.** `initGlassLens()` watched every
 * `[data-glass-lens]` element through a MutationObserver + ResizeObserver and
 * minted a per-size-bucket `<filter>` pair (rest + press ×1.6) for each, under an
 * 8-pair LRU. It had **no caller**: the displacement lens is parked (Chromium
 * composites the map into the bevel instead of bending the backdrop through it —
 * see the §3.3–§3.6 note in `app/globals.css`), so no CSS rule reads the
 * `--glass-lens` variable it wrote, and the one `initGlassLens()` call site went
 * away with `useGlassLight`. Minting filters nobody reads is not a parked
 * feature, it is DOM churn, so the generator is gone; the static 256×256 filter
 * in `GlassFilter` — which this function still builds — is what ships.
 *
 * Re-enabling the lens means restoring the `@supports` upgrades in `globals.css`
 * first. Whether per-element sizing comes back with it is a separate call: the
 * observers were the expensive half and the static map is what is actually
 * visible today.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

// The bevel band is a fixed pixel width in the map so refraction reads the same
// on a small capsule and a wide hero; it is NOT a percentage of pane size.
const BEVEL_PX = 26;

/**
 * The §3.2 displacement map as a data-URI SVG at `w`×`h`: R encodes horizontal
 * displacement, G vertical, 50% gray = neutral. Two plateau ramps per axis
 * (the outer `BEVEL_PX` bends; the centre stays neutral). Channels combine with
 * `screen` so `screen(rgb(r,0,0), rgb(0,g,0)) = rgb(r,g,0)`.
 */
export function lensMapDataURI(w: number, h: number): string {
  const bx = Math.min(BEVEL_PX, Math.floor(w / 2));
  const by = Math.min(BEVEL_PX, Math.floor(h / 2));
  const ox1 = (bx / w).toFixed(4);
  const ox2 = ((w - bx) / w).toFixed(4);
  const oy1 = (by / h).toFixed(4);
  const oy2 = ((h - by) / h).toFixed(4);
  const svg =
    `<svg xmlns="${SVG_NS}" width="${w}" height="${h}">` +
    `<defs>` +
    `<linearGradient id="gx" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="#000000"/><stop offset="${ox1}" stop-color="#800000"/>` +
    `<stop offset="${ox2}" stop-color="#800000"/><stop offset="1" stop-color="#ff0000"/>` +
    `</linearGradient>` +
    `<linearGradient id="gy" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#000000"/><stop offset="${oy1}" stop-color="#008000"/>` +
    `<stop offset="${oy2}" stop-color="#008000"/><stop offset="1" stop-color="#00ff00"/>` +
    `</linearGradient>` +
    `</defs>` +
    `<rect width="${w}" height="${h}" fill="black"/>` +
    `<rect width="${w}" height="${h}" fill="url(#gx)" style="mix-blend-mode:screen"/>` +
    `<rect width="${w}" height="${h}" fill="url(#gy)" style="mix-blend-mode:screen"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
