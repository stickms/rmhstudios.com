'use client';

/**
 * useLiquidMorph — the §5.47 "true liquid morphing" polish shared by every glass
 * control whose active capsule FLOWS between slots (LiquidTabs, the sidebar nav
 * capsule, and any future dock pill).
 *
 * Two composable mechanisms layered over the existing `layoutId` spring (which
 * stays the skeleton and the reduced-motion / perf fallback):
 *
 * 1. Velocity squash & stretch — the capsule's scale is a function of its own
 * motion: `scaleX = 1 + min(|vx|·k, 0.35)`, `scaleY = 1/scaleX` (volume
 * conservation), transform-origin at the trailing edge. Returned as
 * `squashStyle` for the caller to apply to the capsule's MATERIAL child (an
 * inner span, so it never fights framer-motion's `layoutId` projection on the
 * outer element).
 *
 * 2. Gooey metaball merge — an absolutely-positioned, capsule-only underlay
 * (`.lg-goo`, `filter: url(#glass-goo)`) holding a mirror blob that tracks the
 * capsule and a trail droplet on a ~½-stiffness spring. Blur + alpha-threshold
 * fuse them into a stretching teardrop that pinches off and reabsorbs. Returned
 * as `underlay`; the caller renders it INSIDE the control's `position:relative`
 * container, behind the labels.
 *
 * Structure rules (hard): the goo never wraps labels/icons (thresholding destroys
 * glyph edges — they live above at z ≥ 1) and never wraps a 
 * element (nesting a backdrop sampler in a filtered subtree re-rasterizes it — the
 * blobs are plain accent fill). A single idle-at-rest rAF (§16.4) samples the real
 * capsule's live projected box (relative to the underlay, so it is scroll-safe),
 * feeding both the squash velocity and the goo mirror — no second listener. It runs
 * ONLY while the capsule is moving (a `layoutId` transition, woken by `activeKey`)
 * and stops after it settles, so nothing reads layout at rest.
 *
 * Gates: `reduced` (from useReducedMotion) → nothing mounts, the plain `layoutId`
 * spring remains. perf-lite / high-contrast strip `.lg-goo` in CSS (plain spring
 * slide remains). The goo blobs use a near-opaque accent fill because the goo
 * matrix alpha-thresholds — translucent fills would be cut entirely; final
 * subtlety comes from the speed-gated underlay opacity (0 at rest).
 */

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import {
 m as motion,
 useMotionValue,
 useVelocity,
 useTransform,
 useSpring,
 type MotionStyle,
} from 'framer-motion';
import { useLiquidActive, useLiquidBody, useLiquidGroup } from '@/hooks/useLiquidBody';
import { computeDroplet } from '@/lib/liquid-gl/droplet';

const STRETCH_K = 0.0004; // |velocity px/s| → stretch factor (§5.47 sketch)
const STRETCH_MAX = 0.5; // §15.3: volume-conserving cap raised to 0.5 for tab-scale jumps
// §15.3: trail droplet spring is deliberately softer than the shared snappy
// capsule spring so it lags noticeably — the goo reads the lag as a longer,
// clearly-visible stretching tail (a tighter spring was too subtle mid-switch).
// §17.3 spring rest: explicit rest thresholds (px units) so the trail spring can
// never oscillate below visibility forever — it lands and the idle sampler stops.
const TRAIL_SPRING = {
 stiffness: 165,
 damping: 26,
 mass: 1,
 restDelta: 0.1,
 restSpeed: 0.1,
} as const;
const OPACITY_AT = 600; // §15.3: reach the opacity cap sooner so the teardrop is
const OPACITY_CAP = 0.7; // seen for most of the motion, not glimpsed at peak speed

// §16.4 idle-at-rest. The capsule only MOVES during a `layoutId` transition (a new
// tab/route becomes active). Between those, its projected box is static — so the
// sampler must not read layout every frame forever (the navigation-freeze
// regression: 4 mounted strips each forcing 2 getBoundingClientRect/frame at rest).
// The rAF samples only while the box is changing; once it is stable for this many
// frames it stops entirely (zero layout reads at rest) and is re-woken on the next
// `activeKey`/resize/GL-toggle change.
const SETTLE_FRAMES = 6;
const MOVE_EPS = 0.05; // px — below this per-axis delta the capsule is at rest
// Hold the renderer out of its 30fps idle tier briefly after the latest scroll
// input/event. Wheel and touch input can move an elastically overscrolled layer
// without changing scrollTop (and therefore without emitting `scroll`), so they
// must keep viewport-space shader bodies anchored through the boundary bounce.
const SCROLL_ACTIVE_MS = 180;
const ELASTIC_SETTLE_MS = 360;
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

type ProjectionWakeSubscriber = (settleMs: number) => void;
const projectionWakeSubscribers = new Set<ProjectionWakeSubscriber>();
let projectionWakeCleanup: (() => void) | null = null;

function emitProjectionWake(settleMs: number): void {
 for (const subscriber of projectionWakeSubscribers) subscriber(settleMs);
}

/**
 * One shared scroll/viewport signal for every liquid capsule. Several tab strips
 * and both navigation rails can be mounted together; attaching the same global
 * listener set per instance multiplies main-thread work during scroll. A shared
 * fan-out keeps a single browser listener while each live capsule still samples
 * its own projected box before paint and renders at the display's native rAF.
 */
function ensureProjectionWakeListeners(): void {
 if (projectionWakeCleanup || typeof window === 'undefined') return;

 const onScroll = () => emitProjectionWake(SCROLL_ACTIVE_MS);
 const onElasticInput = () => emitProjectionWake(ELASTIC_SETTLE_MS);
 const onViewportChange = () => emitProjectionWake(ELASTIC_SETTLE_MS);
 const onVisibility = () => {
 if (document.visibilityState === 'visible') emitProjectionWake(ELASTIC_SETTLE_MS);
 };

 window.addEventListener('scroll', onScroll, { passive: true, capture: true });
 window.addEventListener('wheel', onElasticInput, { passive: true, capture: true });
 window.addEventListener('touchmove', onScroll, { passive: true, capture: true });
 window.addEventListener('touchend', onElasticInput, { passive: true, capture: true });
 window.addEventListener('touchcancel', onElasticInput, { passive: true, capture: true });
 window.addEventListener('resize', onViewportChange, { passive: true });
 window.visualViewport?.addEventListener('scroll', onScroll);
 window.visualViewport?.addEventListener('resize', onViewportChange);
 document.addEventListener('visibilitychange', onVisibility);
 window.addEventListener('pageshow', onViewportChange);

 let layoutObserver: PerformanceObserver | null = null;
 if (typeof PerformanceObserver !== 'undefined') {
 try {
 layoutObserver = new PerformanceObserver(onScroll);
 layoutObserver.observe({ type: 'layout-shift' });
 } catch {
 layoutObserver = null;
 }
 }

 projectionWakeCleanup = () => {
 window.removeEventListener('scroll', onScroll, { capture: true });
 window.removeEventListener('wheel', onElasticInput, { capture: true });
 window.removeEventListener('touchmove', onScroll, { capture: true });
 window.removeEventListener('touchend', onElasticInput, { capture: true });
 window.removeEventListener('touchcancel', onElasticInput, { capture: true });
 window.removeEventListener('resize', onViewportChange);
 window.visualViewport?.removeEventListener('scroll', onScroll);
 window.visualViewport?.removeEventListener('resize', onViewportChange);
 document.removeEventListener('visibilitychange', onVisibility);
 window.removeEventListener('pageshow', onViewportChange);
 layoutObserver?.disconnect();
 projectionWakeCleanup = null;
 };
}

function subscribeProjectionWake(subscriber: ProjectionWakeSubscriber): () => void {
 projectionWakeSubscribers.add(subscriber);
 ensureProjectionWakeListeners();
 return () => {
 projectionWakeSubscribers.delete(subscriber);
 if (projectionWakeSubscribers.size === 0) projectionWakeCleanup?.();
 };
}

interface LiquidMorphOptions {
 /** Ref to the OUTER `layoutId` capsule element (the projected box we sample). */
 capsuleRef: RefObject<HTMLElement | null>;
 /** Motion axis of the control: horizontal tab strips = 'x', vertical nav = 'y'. */
 axis: 'x' | 'y';
 /** From useReducedMotion — when true nothing mounts (plain spring fallback). */
 reduced: boolean;
 /**
 * The active-selection key (tab value / active route). The sampler wakes on its
 * change — the ONLY time the capsule morphs to a new slot — and idles a few
 * frames after the transition settles, so nothing reads layout at rest (§16.4).
 * Omit to fall back to waking on every render.
 */
 activeKey?: string | number;
 /**
 * Whether to render/register the lagging metaball. Tab pills disable this so
 * their active shape stays cohesive; navigation capsules may keep the trail.
 */
 trail?: boolean;
}

interface LiquidMorphResult {
 /** Apply to the capsule's inner MATERIAL span (not the layoutId element). */
 squashStyle: MotionStyle;
 /** Render inside the control's `position:relative` container, behind labels. */
 underlay: React.ReactNode;
}

export function useLiquidMorph({
 capsuleRef,
 axis,
 reduced,
 activeKey,
 trail = true,
}: LiquidMorphOptions): LiquidMorphResult {
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

 // Goo geometry: mirror tracks the capsule; droplet lags on the soft spring, but
 // its rendered centre + size are then CLAMPED and TAPERED (§17.1) so its edge can
 // never trail the capsule further than a gap the CSS goo (~18px) and the GL smin
 // (k≈26px) can both bridge — no free-floating ball on a fast, wide jump. Derived
 // at the coordinate source, so the CSS blobs below AND the GL bodies fed from
 // dropCx/dropCy/dropD inherit the same cohesive teardrop.
 const cx = useTransform([mx, mw], ([x, w]) => (x as number) + (w as number) / 2);
 const cy = useTransform([my, mh], ([y, h]) => (y as number) + (h as number) / 2);
 const dropCxRaw = useSpring(cx, TRAIL_SPRING);
 const dropCyRaw = useSpring(cy, TRAIL_SPRING);
 const dropState = useTransform(
 [cx, cy, dropCxRaw, dropCyRaw, mw, mh],
 ([cxv, cyv, rx, ry, w, h]) =>
 computeDroplet(
 cxv as number,
 cyv as number,
 rx as number,
 ry as number,
 w as number,
 h as number,
 ),
 );
 const dropCx = useTransform(dropState, (s) => s.cx);
 const dropCy = useTransform(dropState, (s) => s.cy);
 const dropD = useTransform(dropState, (s) => s.d);
 const dropX = useTransform([dropCx, dropD], ([x, d]) => (x as number) - (d as number) / 2);
 const dropY = useTransform([dropCy, dropD], ([y, d]) => (y as number) - (d as number) / 2);
 const gooOpacity = useTransform(v, (val) => Math.min(Math.abs(val) / OPACITY_AT, OPACITY_CAP));

 // §16.4 idle-at-rest sampler. One sampler for both the squash motion values AND
 // (when GL is live) the shader bodies. The capsule box `c` is already
 // viewport-space; the droplet is anchored via the underlay origin `u` + its
 // spring position — no extra layout reads.
 //
 // `sampleRef` holds the latest closure (motion values / GL bodies refresh each
 // render) so the stable rAF loop always runs current logic; it returns whether
 // the capsule (or its lagging droplet spring) is still moving. When it settles,
 // the loop stops — no rAF, no getBoundingClientRect — until `kickRef` re-arms it
 // on the next activeKey / GL-toggle / resize change. Velocity → 0 (and squash →
 // 1) at rest via framer's own self-terminating useVelocity frames, so the
 // visual rest state is unchanged.
 const rafRef = useRef(0);
 const settleRef = useRef(0);
 const prevBox = useRef({ x: 0, y: 0, w: 0, h: 0 });
 const scrollActiveUntil = useRef(0);
 const kickRef = useRef<() => void>(() => {});

 const sampleRef = useRef<() => boolean>(() => false);
 sampleRef.current = () => {
 // §5.47 gate: reduced / perf-lite / high-contrast get a PLAIN spring slide —
 // no squash, no goo — so sample nothing and let the loop idle. Read reactively
 // so a runtime settings change takes effect on the next kick.
 const de = document.documentElement;
 if (
 reduced ||
 de.classList.contains('perf-lite') ||
 de.classList.contains('style-high-contrast')
 )
 return false;
 const cap = capsuleRef.current;
 const under = underlayRef.current;
 if (!cap || !under) return false;
 const c = cap.getBoundingClientRect();
 const u = under.getBoundingClientRect();
 const nx = c.left - u.left;
 const ny = c.top - u.top;
 mx.set(nx);
 my.set(ny);
 mw.set(c.width);
 mh.set(c.height);

 if (glActive) {
 const moving = Math.abs(v.get()) > 40;
 const scrolling = performance.now() < scrollActiveUntil.current;
 capBody.set({
 cx: c.left + c.width / 2,
 cy: c.top + c.height / 2,
 hw: c.width / 2,
 hh: c.height / 2,
 radius: Math.min(c.width, c.height) / 2,
 active: moving || scrolling,
 });
 const dd = dropD.get();
 if (trail) {
 dropBody.set({
 cx: u.left + dropCx.get(),
 cy: u.top + dropCy.get(),
 hw: dd / 2,
 hh: dd / 2,
 radius: dd / 2,
 active: moving || scrolling,
 });
 } else {
 dropBody.set({ cx: 0, cy: 0, hw: 0, hh: 0, radius: 0, active: false });
 }
 }

 // Still-moving check: the projected box changed, OR the trailing droplet spring
 // hasn't caught the capsule centre yet (keep sampling so the goo tail resolves).
 const p = prevBox.current;
 const moved =
 Math.abs(nx - p.x) > MOVE_EPS ||
 Math.abs(ny - p.y) > MOVE_EPS ||
 Math.abs(c.width - p.w) > MOVE_EPS ||
 Math.abs(c.height - p.h) > MOVE_EPS;
 p.x = nx;
 p.y = ny;
 p.w = c.width;
 p.h = c.height;
 const dropSettled =
 !trail ||
 (Math.abs(dropCx.get() - cx.get()) <= MOVE_EPS &&
 Math.abs(dropCy.get() - cy.get()) <= MOVE_EPS);
 return moved || !dropSettled || performance.now() < scrollActiveUntil.current;
 };

 useEffect(() => {
 const loop = () => {
 if (sampleRef.current()) {
 settleRef.current = 0;
 } else if (++settleRef.current >= SETTLE_FRAMES) {
 rafRef.current = 0; // settled → fully idle (no rAF, no layout reads)
 return;
 }
 rafRef.current = requestAnimationFrame(loop);
 };
 const kick = () => {
 settleRef.current = 0;
 if (!rafRef.current) rafRef.current = requestAnimationFrame(loop);
 };
 kickRef.current = kick;
 kick(); // sample the initial rest position once, then idle
 const onScrollActivity = (settleMs = SCROLL_ACTIVE_MS) => {
 scrollActiveUntil.current = performance.now() + settleMs;
 // Scroll is delivered before paint. Sample immediately so the renderer's
 // next rAF sees current viewport coordinates rather than drawing one stale
 // frame and visibly chasing the DOM at 60/120Hz.
 sampleRef.current();
 kick();
 };
 const unsubscribeProjectionWake = subscribeProjectionWake(onScrollActivity);
 // §17.4 scroll anchoring: the GL body is drawn in VIEWPORT coords, so a scroll
 // moves the capsule element but leaves the (idle) shader drawing its glass at the
 // stale screen position — the owner's "shadow follows the screen" report. Scroll
 // is therefore a WAKE signal, same class as resize/activeKey: it re-arms the
 // sampler, which re-reads the capsule's viewport box and re-anchors the GL body,
 // then idles again after SETTLE_FRAMES (§16.4 zero-reads-at-rest preserved).
 // `capture` catches scrolls in nested/inner containers too. Wheel/touchmove are
 // also wake signals because a scroller already at its boundary may rubber-band
 // visually without changing scrollTop or firing `scroll`. touchend keeps the
 // sampler alive through the short elastic snap-back. The squash path stays inert
 // because mx/my are underlay-relative (both scroll together → no velocity).
 return () => {
 if (rafRef.current) cancelAnimationFrame(rafRef.current);
 rafRef.current = 0;
 unsubscribeProjectionWake();
 };
 // Stable loop; `sampleRef.current` is refreshed each render so it stays current.
 }, []);

 // Wake the sampler when the active selection changes (the capsule morphs to a new
 // slot), when the GL tier toggles (bodies must (de)register + re-anchor), or when
 // reduced-motion flips. It idles again a few frames after the transition settles.
 useIsoLayoutEffect(() => {
 // Update the registry during the same commit as the DOM capsule. This avoids
 // a stale shader/shadow frame before the rAF sampler follows the projection.
 sampleRef.current();
 kickRef.current();
 }, [activeKey, glActive, reduced]);

 const squashStyle: MotionStyle = reduced
 ? {}
 : axis === 'x'
 ? { scaleX: stretch, scaleY: squash, transformOrigin: origin }
 : { scaleY: stretch, scaleX: squash, transformOrigin: origin };

 // With GL live, render an invisible anchor span (no goo, no blobs); otherwise
 // the full `.lg-goo` metaball underlay (the CSS/SVG fallback tier, unchanged).
 const showGoo = trail && !reduced && !glActive;
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
