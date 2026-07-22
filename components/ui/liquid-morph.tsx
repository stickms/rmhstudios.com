'use client';

/**
 * useLiquidMorph — the §5.47 "true liquid morphing" polish shared by every glass
 * control whose active capsule FLOWS between slots (LiquidTabs, the sidebar nav
 * capsule, and any future dock pill).
 *
 * Two composable mechanisms layered over the existing `layoutId` spring (which
 * stays the skeleton and the reduced-motion / perf fallback):
 *
 *  1. Velocity squash & stretch — the capsule's scale is a function of its own
 *     motion: `scaleX = 1 + min(|vx|·k, 0.35)`, `scaleY = 1/scaleX` (volume
 *     conservation), transform-origin at the trailing edge. Returned as
 *     `squashStyle` for the caller to apply to the capsule's MATERIAL child (an
 *     inner span, so it never fights framer-motion's `layoutId` projection on the
 *     outer element).
 *
 *  2. Gooey metaball merge — an absolutely-positioned, capsule-only underlay
 *     (`.lg-goo`, `filter: url(#glass-goo)`) holding a mirror blob that tracks the
 *     capsule and a trail droplet on a ~½-stiffness spring. Blur + alpha-threshold
 *     fuse them into a stretching teardrop that pinches off and reabsorbs. Returned
 *     as `underlay`; the caller renders it INSIDE the control's `position:relative`
 *     container, behind the labels.
 *
 * Structure rules (hard): the goo never wraps labels/icons (thresholding destroys
 * glyph edges — they live above at z ≥ 1) and never wraps a backdrop-filter
 * element (nesting a backdrop sampler in a filtered subtree re-rasterizes it — the
 * blobs are plain accent fill). A single `useAnimationFrame` samples the real
 * capsule's live projected box (relative to the underlay, so it is scroll-safe),
 * feeding both the squash velocity and the goo mirror — no second listener.
 *
 * Gates: `reduced` (from useReducedMotion) → nothing mounts, the plain `layoutId`
 * spring remains. perf-lite / high-contrast strip `.lg-goo` in CSS (plain spring
 * slide remains). The goo blobs use a near-opaque accent fill because the goo
 * matrix alpha-thresholds — translucent fills would be cut entirely; final
 * subtlety comes from the speed-gated underlay opacity (0 at rest).
 */

import { useRef, type RefObject } from 'react';
import {
  m as motion,
  useMotionValue,
  useVelocity,
  useTransform,
  useSpring,
  useAnimationFrame,
  type MotionStyle,
} from 'framer-motion';
import { useLiquidActive, useLiquidBody, useLiquidGroup } from '@/hooks/useLiquidBody';

const STRETCH_K = 0.0004; // |velocity px/s| → stretch factor (§5.47 sketch)
const STRETCH_MAX = 0.5; // §15.3: volume-conserving cap raised to 0.5 for tab-scale jumps
// §15.3: trail droplet spring ≈ ⅓ the snappy capsule stiffness (SPRING.snappy =
// 500) so it lags the capsule noticeably — the goo reads the lag as a longer,
// clearly-visible stretching tail (½-stiffness was too tight to see mid-switch).
const TRAIL_SPRING = { stiffness: 165, damping: 26, mass: 1 } as const;
const OPACITY_AT = 600; // §15.3: reach the opacity cap sooner so the teardrop is
const OPACITY_CAP = 0.7; //  seen for most of the motion, not glimpsed at peak speed
const DROP_FACTOR = 0.7; // §15.3: droplet ≈ 70% of the capsule's short side (height)

interface LiquidMorphOptions {
  /** Ref to the OUTER `layoutId` capsule element (the projected box we sample). */
  capsuleRef: RefObject<HTMLElement | null>;
  /** Motion axis of the control: horizontal tab strips = 'x', vertical nav = 'y'. */
  axis: 'x' | 'y';
  /** From useReducedMotion — when true nothing mounts (plain spring fallback). */
  reduced: boolean;
}

interface LiquidMorphResult {
  /** Apply to the capsule's inner MATERIAL span (not the layoutId element). */
  squashStyle: MotionStyle;
  /** Render inside the control's `position:relative` container, behind labels. */
  underlay: React.ReactNode;
}

export function useLiquidMorph({ capsuleRef, axis, reduced }: LiquidMorphOptions): LiquidMorphResult {
  const underlayRef = useRef<HTMLSpanElement>(null);

  // §16.1: when a GL tier is live the SHADER draws the metaball merge (capsule +
  // trail droplet as SDF bodies with smooth-min), so we register those bodies and
  // skip the `.lg-goo` SVG underlay entirely. The underlay span still mounts as an
  // invisible coordinate anchor (opacity 0, no filter, no blobs) so the sampler
  // can read the capsule's viewport box + the droplet's underlay-space position.
  const glActive = useLiquidActive();
  const group = useLiquidGroup();
  const capBody = useLiquidBody({ kind: 'capsule', group });
  const dropBody = useLiquidBody({ kind: 'droplet', group });

  // Live projected box of the real capsule, in the underlay's own coordinate
  // space (scroll-safe — both are in the same DOM/scroll context).
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const mw = useMotionValue(0);
  const mh = useMotionValue(0);

  const along = axis === 'x' ? mx : my;
  const v = useVelocity(along);
  const stretch = useTransform(v, (val) => 1 + Math.min(Math.abs(val) * STRETCH_K, STRETCH_MAX));
  const squash = useTransform(stretch, (s) => 1 / s);
  const origin = useTransform(v, (val) =>
    axis === 'x'
      ? val >= 0
        ? 'left center'
        : 'right center'
      : val >= 0
        ? 'center top'
        : 'center bottom',
  );

  // Goo geometry: mirror tracks the capsule; droplet lags on the soft spring.
  const cx = useTransform([mx, mw], ([x, w]) => (x as number) + (w as number) / 2);
  const cy = useTransform([my, mh], ([y, h]) => (y as number) + (h as number) / 2);
  const dropCx = useSpring(cx, TRAIL_SPRING);
  const dropCy = useSpring(cy, TRAIL_SPRING);
  const short = useTransform([mw, mh], ([w, h]) => Math.min(w as number, h as number));
  const dropD = useTransform(short, (s) => s * DROP_FACTOR);
  const dropX = useTransform([dropCx, dropD], ([x, d]) => (x as number) - (d as number) / 2);
  const dropY = useTransform([dropCy, dropD], ([y, d]) => (y as number) - (d as number) / 2);
  const gooOpacity = useTransform(v, (val) => Math.min(Math.abs(val) / OPACITY_AT, OPACITY_CAP));

  // One sampler for both the squash motion values AND (when GL is live) the shader
  // bodies. The capsule box `c` is already viewport-space; the droplet is anchored
  // via the underlay origin `u` + its spring position — no extra layout reads.
  useAnimationFrame(() => {
    if (reduced) return;
    // §5.47 gate: perf-lite / high-contrast get a PLAIN spring slide — freezing
    // the sampled position keeps velocity at 0 (no squash), and CSS also hides
    // `.lg-goo`. Read reactively so a runtime settings change takes effect.
    const de = document.documentElement;
    if (de.classList.contains('perf-lite') || de.classList.contains('style-high-contrast')) return;
    const cap = capsuleRef.current;
    const under = underlayRef.current;
    if (!cap || !under) return;
    const c = cap.getBoundingClientRect();
    const u = under.getBoundingClientRect();
    mx.set(c.left - u.left);
    my.set(c.top - u.top);
    mw.set(c.width);
    mh.set(c.height);

    if (glActive) {
      const moving = Math.abs(v.get()) > 40;
      capBody.set({
        cx: c.left + c.width / 2,
        cy: c.top + c.height / 2,
        hw: c.width / 2,
        hh: c.height / 2,
        radius: Math.min(c.width, c.height) / 2,
        active: moving,
      });
      const dd = dropD.get();
      dropBody.set({
        cx: u.left + dropCx.get(),
        cy: u.top + dropCy.get(),
        hw: dd / 2,
        hh: dd / 2,
        radius: dd / 2,
        active: moving,
      });
    }
  });

  const squashStyle: MotionStyle = reduced
    ? {}
    : axis === 'x'
      ? { scaleX: stretch, scaleY: squash, transformOrigin: origin }
      : { scaleY: stretch, scaleX: squash, transformOrigin: origin };

  // With GL live, render an invisible anchor span (no goo, no blobs); otherwise
  // the full `.lg-goo` metaball underlay (the CSS/SVG fallback tier, unchanged).
  const showGoo = !reduced && !glActive;
  const underlay = reduced ? null : (
    <motion.span
      ref={underlayRef}
      aria-hidden
      className={showGoo ? 'lg-goo absolute inset-0 z-0 overflow-hidden' : 'absolute inset-0 z-0'}
      style={showGoo ? { opacity: gooOpacity } : { opacity: 0, pointerEvents: 'none' }}
    >
      {showGoo && (
        <>
          {/* mirror — sits directly under the real capsule (near-opaque accent so
              the goo alpha-threshold keeps it); hidden at rest via the opacity. */}
          <motion.span
            className="absolute top-0 left-0 rounded-full bg-site-accent"
            style={{ x: mx, y: my, width: mw, height: mh }}
          />
          {/* trail droplet — lagging blob the goo fuses with the mirror into a tail. */}
          <motion.span
            className="absolute top-0 left-0 rounded-full bg-site-accent"
            style={{ x: dropX, y: dropY, width: dropD, height: dropD }}
          />
        </>
      )}
    </motion.span>
  );

  return { squashStyle, underlay };
}
