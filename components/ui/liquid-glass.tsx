'use client';

/**
 * Liquid Glass primitives — frosted, light-refracting surfaces (à la iOS 26
 * "Liquid Glass"). Powers the site-wide `.style-liquid-glass` theme in
 * `app/globals.css` and is available as a standalone building block anywhere
 * a one-off glass panel is wanted.
 *
 * `GlassFilter` (the SVG displacement filter the glass layers reference by
 * `url(#glass-distortion)`) is mounted once globally in `__root.tsx`; only
 * mount it again for markup rendered outside the root document.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { GLASS_EASE_CSS } from '@/lib/motion';

interface GlassEffectProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  href?: string;
  target?: string;
}

interface DockIcon {
  src: string;
  alt: string;
  onClick?: () => void;
}

// The springy overshoot curve every glass element eases with (see EASE.glass).
const GLASS_EASE = GLASS_EASE_CSS;

// Glass Effect Wrapper Component
const GlassEffect: React.FC<GlassEffectProps> = ({
  children,
  className = '',
  style = {},
  href,
  target,
}) => {
  const glassStyle: React.CSSProperties = {
    boxShadow: '0 6px 6px rgba(0, 0, 0, 0.2), 0 0 20px rgba(0, 0, 0, 0.1)',
    transitionTimingFunction: GLASS_EASE,
    ...style,
  };

  const content = (
    <div
      data-slot="glass-effect"
      className={cn(
        'relative flex overflow-hidden font-semibold text-site-text transition-all duration-700',
        href && 'cursor-pointer',
        className,
      )}
      style={glassStyle}
    >
      {/* Glass layers: backdrop refraction → tint → specular rim highlight.
          The refraction (SVG displacement of the backdrop) is applied via the
          .liquid-glass-refract class in globals.css — it must live inside
          backdrop-filter (Chromium-only; other engines keep the plain blur). */}
      <div
        className="liquid-glass-refract absolute inset-0 z-0 overflow-hidden rounded-[inherit]"
        style={{ isolation: 'isolate' }}
      />
      {/* Tint plate + specular rim, re-based on the glass tokens so GlassEffect
          obeys themes / high-contrast / reduced-transparency (§7.1). */}
      <div
        className="absolute inset-0 z-10 rounded-[inherit]"
        style={{ background: 'var(--site-glass-tint-strong)' }}
      />
      <div
        className="absolute inset-0 z-20 overflow-hidden rounded-[inherit]"
        style={{
          boxShadow:
            'inset 2px 2px 1px 0 var(--site-glass-rim), inset -1px -1px 1px 1px var(--site-glass-rim-soft)',
        }}
      />

      {/* Content */}
      <div className="relative z-30">{children}</div>
    </div>
  );

  return href ? (
    <a
      href={href}
      target={target}
      rel={target === '_blank' ? 'noopener noreferrer' : undefined}
      className="block"
    >
      {content}
    </a>
  ) : (
    content
  );
};

// Dock Component. When `href` is set the whole dock is one link, so the icons
// render as plain images (their onClick is ignored) — interactive buttons
// nested inside an <a> are invalid HTML. The icon row deliberately has no
// overflow-hidden: the GlassEffect wrapper already clips at its rounded
// bounds, and its p-3 leaves room for the icons' focus rings and hover zoom.
const GlassDock: React.FC<{ icons: DockIcon[]; href?: string }> = ({ icons, href }) => (
  <GlassEffect href={href} className="rounded-3xl p-3 hover:rounded-4xl hover:p-4">
    <div className="flex items-center justify-center gap-2 rounded-3xl px-0.5 py-0">
      {icons.map((icon) => {
        const img = (
          <img
            src={icon.src}
            alt={href ? icon.alt : ''}
            aria-hidden={href ? undefined : true}
            className="h-16 w-16 rounded-2xl object-cover"
          />
        );
        return href ? (
          <span key={icon.alt} className="rounded-2xl">
            {img}
          </span>
        ) : (
          <button
            key={icon.alt}
            type="button"
            onClick={icon.onClick}
            aria-label={icon.alt}
            className="cursor-pointer rounded-2xl transition-all duration-700 hover:scale-110"
            style={{
              transformOrigin: 'center center',
              transitionTimingFunction: GLASS_EASE,
            }}
          >
            {img}
          </button>
        );
      })}
    </div>
  </GlassEffect>
);

// Button Component
const GlassButton: React.FC<{ children: React.ReactNode; href?: string }> = ({
  children,
  href,
}) => (
  <GlassEffect
    href={href}
    className="overflow-hidden rounded-3xl px-10 py-6 hover:rounded-4xl hover:px-11 hover:py-7"
  >
    <div
      className="transition-all duration-700 hover:scale-95"
      style={{ transitionTimingFunction: GLASS_EASE }}
    >
      {children}
    </div>
  </GlassEffect>
);

// SVG filter the glass layers sample for their refraction (via backdrop-filter
// url(#glass-distortion) in .liquid-glass-refract). Render once per document.
// Simplified from the reference implementation: its feComponentTransfer and
// feSpecularLighting/feComposite passes produced results nothing consumed, so
// only the effective turbulence → blur → displacement chain is kept.
const GlassFilter: React.FC = () => (
  <svg style={{ display: 'none' }} aria-hidden>
    <filter
      id="glass-distortion"
      x="0%"
      y="0%"
      width="100%"
      height="100%"
      filterUnits="objectBoundingBox"
    >
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.001 0.005"
        numOctaves="1"
        seed="17"
        result="turbulence"
      />
      <feGaussianBlur in="turbulence" stdDeviation="3" result="softMap" />
      <feDisplacementMap
        in="SourceGraphic"
        in2="softMap"
        scale="80"
        xChannelSelector="R"
        yChannelSelector="G"
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
  /** Add edge-weighted refraction (hero/chrome only — ration to ≤2 per page). */
  refract?: boolean;
  /**
   * Add the ambient "liquid" sheen — a slow specular that drifts across the pane
   * like light over wet glass. Signature surfaces only (heroes, docks); ration it
   * like `refract`. Give the pane's own content a stacking context so text stays
   * above the sheen (this wrapper's children already render in normal flow above
   * the z-0 sheen layer).
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

export { GlassEffect, GlassDock, GlassButton, GlassFilter, GlassPane };
export type { DockIcon, GlassEffectProps, GlassPaneProps };
