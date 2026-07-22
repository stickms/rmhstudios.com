'use client';

/**
 * Liquid Glass primitives — the SSR filter host + a thin `GlassPane` helper.
 *
 * `GlassFilter` mounts the SVG lens filters (`#glass-lens`, `#glass-lens-press`,
 * `#glass-lens-prism`) that Chromium samples through `backdrop-filter: url(...)`
 * — and Gecko/WebKit through `filter: url(...)` over a mirrored aurora copy
 * (§3.6) — on `.glass-refract` surfaces (v2 §3). It is mounted once globally in
 * `__root.tsx`; only mount it again for markup rendered outside the root
 * document. Per-size-bucket variants (rest + press pairs) are generated at
 * runtime by `lib/glass-lens.ts` and appended into the same `#glass-filters`
 * node.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { lensMapDataURI } from '@/lib/glass-lens';

// The §3.2 static default map (256×256): R = x-displacement, G = y-displacement,
// 50% gray = neutral. The bucket generator refines this per element at runtime;
// this constant is the first-paint default so refraction appears immediately.
const LENS_MAP_HREF = lensMapDataURI(256, 256);

/**
 * GlassFilter — the global lens filter host (v2 §3.3–§3.4).
 *
 * `#glass-lens`: feImage(displacement map) → blur → single displacement pass.
 * `#glass-lens-press`: the same at ×1.6 displacement scale — the pre-hydration
 * default for the §3.7 press state (`.glass-refract:active`), before the bucket
 * generator mints per-size press pairs.
 * `#glass-lens-prism`: three channel-isolated displacements at ±12% scale, then
 * re-summed — true chromatic dispersion (blue bends more than red). Budget: ≤1
 * prism element per page. On Chromium these feed `backdrop-filter`; on
 * Gecko/WebKit the same filters drive `filter` over the mirrored aurora (§3.6).
 */
const GlassFilter: React.FC = () => (
  <svg id="glass-filters" style={{ display: 'none' }} aria-hidden>
    <filter
      id="glass-lens"
      x="0%"
      y="0%"
      width="100%"
      height="100%"
      colorInterpolationFilters="sRGB"
    >
      <feImage
        href={LENS_MAP_HREF}
        x="0"
        y="0"
        width="256"
        height="256"
        preserveAspectRatio="none"
        result="map"
      />
      <feGaussianBlur in="map" stdDeviation="2" result="soft" />
      <feDisplacementMap
        in="SourceGraphic"
        in2="soft"
        scale="56"
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>

    {/* §3.7 press default: same map, displacement ×1.6 (56 → 90). */}
    <filter
      id="glass-lens-press"
      x="0%"
      y="0%"
      width="100%"
      height="100%"
      colorInterpolationFilters="sRGB"
    >
      <feImage
        href={LENS_MAP_HREF}
        x="0"
        y="0"
        width="256"
        height="256"
        preserveAspectRatio="none"
        result="map"
      />
      <feGaussianBlur in="map" stdDeviation="2" result="soft" />
      <feDisplacementMap
        in="SourceGraphic"
        in2="soft"
        scale="90"
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>

    <filter
      id="glass-lens-prism"
      x="0%"
      y="0%"
      width="100%"
      height="100%"
      colorInterpolationFilters="sRGB"
    >
      <feImage
        href={LENS_MAP_HREF}
        x="0"
        y="0"
        width="256"
        height="256"
        preserveAspectRatio="none"
        result="map"
      />
      <feGaussianBlur in="map" stdDeviation="2" result="soft" />
      <feDisplacementMap
        in="SourceGraphic"
        in2="soft"
        scale="49"
        xChannelSelector="R"
        yChannelSelector="G"
        result="dr"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="soft"
        scale="56"
        xChannelSelector="R"
        yChannelSelector="G"
        result="dg"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="soft"
        scale="63"
        xChannelSelector="R"
        yChannelSelector="G"
        result="db"
      />
      <feColorMatrix in="dr" result="r" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" />
      <feColorMatrix in="dg" result="g" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" />
      <feColorMatrix in="db" result="b" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" />
      <feComposite in="r" in2="g" operator="arithmetic" k2="1" k3="1" result="rg" />
      <feComposite in="rg" in2="b" operator="arithmetic" k2="1" k3="1" />
    </filter>

    {/* §5.47/§15.3 gooey metaball merge: blur, then an alpha ramp that cuts the
        blur back to a threshold — two nearby solid blobs fuse into one, so a
        moving capsule and its trailing droplet read as a stretching teardrop that
        pinches off and reabsorbs on arrival. §15.3 tuning ("morph more"): the
        blur widens to stdDeviation 9 and the alpha ramp is rebalanced (16/-6, a
        lower threshold over a gentler slope) so the fusion neck is THICKER and
        lives LONGER — the merge is visible in normal use, not just glimpsed. The
        wider blur needs a larger filter region (160%) so the fattened neck isn't
        clipped. Applied via regular `filter` (Gecko/WebKit-safe) to a capsule-only
        underlay (`.lg-goo`), NEVER to a subtree containing labels/icons
        (thresholding destroys glyph edges) or a backdrop-filter element (a
        backdrop sampler inside a filtered subtree re-rasterizes — the capsule
        material is plain accent tint + rim). */}
    <filter id="glass-goo" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur" />
      <feColorMatrix
        in="blur"
        type="matrix"
        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 16 -6"
        result="goo"
      />
    </filter>
  </svg>
);

/**
 * GlassPane — a thin wrapper over the L2 `.glass-pane` elevation class with the
 * optional interactive pointer-light, for pages that need a one-off pane without
 * hand-writing the class trio. Renders a plain `<div>` by default.
 */
interface GlassPaneProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Add hover tint-raise, press flex, and the pointer specular highlight. */
  interactive?: boolean;
  /**
   * Add edge lens refraction (v2 §3): the aurora bends in the pane's edge band.
   * Sets `data-glass-lens` so `lib/glass-lens.ts` sizes a displacement filter to
   * this pane on Chromium; other engines fall back to the edge blur. Hero/chrome
   * only — ration to ≤2 per page, never in scroll containers.
   */
  refract?: boolean;
  /**
   * Add the ambient "liquid" sheen — a slow specular that drifts across the pane
   * like light over wet glass. In v2 the sheen is a background layer (no pseudo),
   * so it composes freely with `refract` and `interactive` on the same pane.
   * Signature surfaces only; ration it like `refract` (≤2–3 per page).
   */
  liquid?: boolean;
}

const GlassPane: React.FC<GlassPaneProps> = ({
  interactive = false,
  refract = false,
  liquid = false,
  className,
  children,
  ...props
}) => (
  <div
    data-slot="glass-pane"
    data-glass-light={interactive ? '' : undefined}
    data-glass-lens={refract ? '' : undefined}
    className={cn(
      'glass-pane',
      interactive && 'glass-interactive',
      refract && 'glass-refract',
      liquid && 'glass-liquid',
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export { GlassFilter, GlassPane };
export type { GlassPaneProps };
