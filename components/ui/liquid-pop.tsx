'use client';

/**
 * useLiquidPop — the §15.6 "liquid pop" metaball open/close for floating UI
 * (popovers, menus, dropdowns). A panel morphs out of its trigger like a droplet
 * budding off, and reabsorbs on close.
 *
 * Two-act structure (the §5.47 hard constraint: a `backdrop-filter` element must
 * NEVER sit inside a `filter: url(#glass-goo)` subtree — it re-rasterizes and
 * breaks backdrop sampling; `.glass-overlay` panels blur their backdrop, so the
 * panel itself can never be goo-filtered):
 *
 *  1. Act 1 — the bud (goo, ~200ms): a portal-rendered, fixed, goo-filtered
 *     underlay (`.lg-goo`, `contain: layout paint`) holds two SOLID tint blobs
 *     (color-mix of `--site-glass-tint-strong` over `--site-surface-opaque` — NO
 *     backdrop blur): a disc anchored on the trigger and a rounded-rect growing
 *     from the trigger toward the panel's final rect. Blur+threshold fuses them
 *     so the panel visibly buds out of the trigger with a liquid neck that pinches
 *     off as separation completes.
 *  2. Act 2 — the settle (glass, overlapping last frames): the REAL
 *     `.glass-overlay` panel crossfades in on top (its opacity is driven 0→1 from
 *     the same progress value while the blob layer fades out), then the underlay
 *     unmounts. Content (menu items/text) rides the real panel only — never goo.
 *
 * Close plays the acts in reverse, faster (~130ms) — the blob reabsorbs into the
 * trigger. On close the consumer typically unmounts the panel instantly, so the
 * reabsorb runs against the LAST-KNOWN panel rect (cached on open).
 *
 * Contract: `useLiquidPop({ triggerRef, panelRef, open })` → `{ underlay }`. The
 * consumer keeps its existing open state, trigger button, and `.glass-overlay`
 * panel; it only wires the two refs and renders `{underlay}` anywhere (it is a
 * body portal, position-independent). The hook drives the panel's opacity via its
 * ref — no per-adopter opacity plumbing.
 *
 * Gates: reduced motion → instant (no goo, no fade — panel appears at full opacity
 * via the consumer's own mount). perf-lite → skip Act 1, keep a plain fade (no
 * goo). high-contrast → instant opaque. Rapid open/close toggling reverses the
 * single progress value in place (framer interruption) and a generation counter +
 * a single `active` flag guarantee exactly one underlay ever exists — no orphans.
 * The underlay carries `contain: layout paint` and mounts ONLY while animating.
 */

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { m as motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { EASE } from '@/lib/motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useLiquidActive, useLiquidBody, useLiquidGroup } from '@/hooks/useLiquidBody';

// SSR-safe layout effect (avoids the useLayoutEffect-on-server warning). The DOM
// work only ever runs on the client (open starts false during SSR anyway).
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// Solid, accentless tint — the raised-glass fill, flattened over the opaque
// surface so it carries NO alpha translucency that would need a backdrop blur.
// The goo alpha-threshold snaps the resulting ~0.6+ alpha to fully opaque and
// pinches the blurred overlap into a neck (exactly like the liquid-morph blobs).
const BLOB_TINT =
  'color-mix(in srgb, var(--site-glass-tint-strong) 45%, var(--site-surface-opaque))';

const OPEN_S = 0.22;
const CLOSE_S = 0.13;

// Geometry easing for the bud. A gentle symmetric curve (not the front-loaded
// EASE.emphasized) so `progress` doesn't snap to the panel rect in the first few
// frames — the droplet lingers near the trigger early, keeping the liquid neck
// visible, then settles. Act 2 (the panel crossfade) only begins past PANEL_GATE.
const BUD_EASE: [number, number, number, number] = [0.45, 0.05, 0.2, 1];
const PANEL_GATE = 0.58; // progress at which the real panel starts fading in

type Rect = { left: number; top: number; width: number; height: number };
type Mode = 'instant' | 'perf' | 'full';

function readRect(el: HTMLElement | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function resolveMode(reduced: boolean): Mode {
  if (reduced) return 'instant';
  if (typeof document === 'undefined') return 'full';
  const cl = document.documentElement.classList;
  if (cl.contains('style-high-contrast')) return 'instant';
  if (cl.contains('perf-lite')) return 'perf';
  return 'full';
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface LiquidPopOptions {
  /** The trigger button the panel buds out of. */
  triggerRef: RefObject<HTMLElement | null>;
  /** The floating `.glass-overlay` panel (mounted while `open`). */
  panelRef: RefObject<HTMLElement | null>;
  /** The consumer's open state. */
  open: boolean;
  /**
   * Stacking level of the goo underlay. Default 60 — under the fading-in panel so
   * the crossfade reads correctly. Raise for panels portaled above z-60.
   */
  z?: number;
}

export interface LiquidPopResult {
  /** Portal node — render it anywhere inside the consumer (body portal). */
  underlay: React.ReactNode;
}

export function useLiquidPop({ triggerRef, panelRef, open, z = 60 }: LiquidPopOptions): LiquidPopResult {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(false);

  // §16.1: when a GL tier is live the SHADER renders the bud (a growing SDF
  // rounded-rect) smooth-min merged with the trigger disc, so we register those
  // two bodies while the pop animates and skip the `.lg-goo` portal below. Their
  // geometry comes from the same cached-rect motion values (zero layout reads).
  const glActive = useLiquidActive();
  const group = useLiquidGroup();
  const budBody = useLiquidBody({ kind: 'bud', group, enabled: glActive && active });
  const discBody = useLiquidBody({ kind: 'droplet', group, enabled: glActive && active });

  // One progress value (0 = fully at trigger, 1 = fully at panel) drives all
  // geometry AND the panel crossfade. One blob-layer opacity value. Reusing a
  // single set of motion values (never per-toggle instances) is what makes the
  // rapid-toggle path orphan-free.
  const progress = useMotionValue(0);
  const blobOp = useMotionValue(0);
  const discScale = useMotionValue(1);

  const trigRect = useRef<Rect | null>(null);
  const panelRect = useRef<Rect | null>(null);
  const radius = useRef(16);
  const modeRef = useRef<Mode>('full');
  const genRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevOpen = useRef(false);

  // Panel crossfade: opacity follows progress. Full mode delays the fade to the
  // back half (so Act 1's bud is seen alone first); perf mode is a plain fade.
  useEffect(() => {
    const unsub = progress.on('change', (v) => {
      const panel = panelRef.current;
      if (!panel || modeRef.current === 'instant') return;
      const o =
        modeRef.current === 'full'
          ? Math.max(0, Math.min(1, (v - PANEL_GATE) / (1 - PANEL_GATE)))
          : v;
      panel.style.opacity = String(o);
    });
    return unsub;
  }, [progress, panelRef]);

  useIsoLayoutEffect(() => {
    if (open === prevOpen.current) return;
    prevOpen.current = open;

    const mode = resolveMode(reduced);
    modeRef.current = mode;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const gen = ++genRef.current;
    const panel = panelRef.current;

    if (open) {
      // Panel is committed this render; read its rect before paint so the goo
      // targets the real box and the opacity-0 is set with no flash.
      trigRect.current = readRect(triggerRef.current) ?? trigRect.current;
      panelRect.current = readRect(panel) ?? panelRect.current;
      if (panel) {
        const br = parseFloat(getComputedStyle(panel).borderTopLeftRadius);
        if (!Number.isNaN(br)) radius.current = br;
      }

      if (mode === 'instant') {
        if (panel) panel.style.opacity = '';
        setActive(false);
        return;
      }

      if (mode === 'perf') {
        // Skip Act 1 (no goo); keep a plain fade.
        if (panel) panel.style.opacity = '0';
        progress.set(0);
        animate(progress, 1, { duration: 0.14, ease: EASE.standard });
        timerRef.current = setTimeout(() => {
          if (gen !== genRef.current) return;
          if (panelRef.current) panelRef.current.style.opacity = '';
        }, 160);
        return;
      }

      // Full mode — two-act morph.
      if (!trigRect.current || !panelRect.current) {
        if (panel) panel.style.opacity = '';
        return;
      }
      if (panel) panel.style.opacity = '0';
      progress.set(0);
      discScale.set(1);
      blobOp.set(0);
      setActive(true);
      animate(progress, 1, { duration: OPEN_S, ease: BUD_EASE });
      animate(blobOp, [0, 1, 1, 0], { duration: OPEN_S, times: [0, 0.12, 0.72, 1], ease: 'easeInOut' });
      // Disc shrinks in the back half so the neck pinches off as the panel lands.
      animate(discScale, [1, 1, 0.32], { duration: OPEN_S, times: [0, 0.6, 1], ease: 'easeIn' });
      timerRef.current = setTimeout(() => {
        if (gen !== genRef.current) return;
        if (panelRef.current) panelRef.current.style.opacity = '';
        setActive(false);
      }, OPEN_S * 1000 + 30);
      return;
    }

    // Closing — reabsorb the bud into the trigger against the cached rects.
    if (mode === 'full' && trigRect.current && panelRect.current) {
      progress.set(1);
      discScale.set(0.32);
      blobOp.set(0);
      setActive(true);
      animate(progress, 0, { duration: CLOSE_S, ease: [0.4, 0, 1, 1] });
      animate(blobOp, [0, 1, 1, 0], { duration: CLOSE_S, times: [0, 0.22, 0.62, 1], ease: 'easeInOut' });
      animate(discScale, [0.32, 1], { duration: CLOSE_S, ease: 'easeOut' });
      timerRef.current = setTimeout(() => {
        if (gen !== genRef.current) return;
        setActive(false);
      }, CLOSE_S * 1000 + 30);
    } else {
      setActive(false);
    }
  }, [open, reduced, triggerRef, panelRef, progress, blobOp, discScale]);

  // Unmount cleanup — kill the timer and invalidate the generation so a pending
  // completion never resurrects an underlay after the consumer is gone.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      genRef.current++;
    },
    [],
  );

  // Growing rounded-rect: center travels trigger→panel, size grows start→panel.
  const growW = useTransform(progress, (p) => {
    const tr = trigRect.current;
    const pr = panelRect.current;
    if (!tr || !pr) return 0;
    return lerp(Math.min(tr.width, 72), pr.width, p);
  });
  const growH = useTransform(progress, (p) => {
    const tr = trigRect.current;
    const pr = panelRect.current;
    if (!tr || !pr) return 0;
    return lerp(Math.min(tr.height, 44), pr.height, p);
  });
  const growLeft = useTransform([progress, growW], ([p, w]) => {
    const tr = trigRect.current;
    const pr = panelRect.current;
    if (!tr || !pr) return 0;
    const tcx = tr.left + tr.width / 2;
    const pcx = pr.left + pr.width / 2;
    return lerp(tcx, pcx, p as number) - (w as number) / 2;
  });
  const growTop = useTransform([progress, growH], ([p, h]) => {
    const tr = trigRect.current;
    const pr = panelRect.current;
    if (!tr || !pr) return 0;
    const tcy = tr.top + tr.height / 2;
    const pcy = pr.top + pr.height / 2;
    return lerp(tcy, pcy, p as number) - (h as number) / 2;
  });
  const growRadius = useTransform(progress, (p) => lerp(22, radius.current, p));

  // Trigger-anchored droplet disc.
  const discSize = useTransform(discScale, (s) => {
    const tr = trigRect.current;
    if (!tr) return 0;
    const base = Math.min(Math.max(Math.min(tr.width, tr.height), 22), 42);
    return base * (s as number);
  });
  const discLeft = useTransform(discSize, (d) => {
    const tr = trigRect.current;
    if (!tr) return 0;
    return tr.left + tr.width / 2 - (d as number) / 2;
  });
  const discTop = useTransform(discSize, (d) => {
    const tr = trigRect.current;
    if (!tr) return 0;
    return tr.top + tr.height / 2 - (d as number) / 2;
  });

  // Feed the shader bodies from the cached-rect-derived motion values (viewport
  // px). Bud = the growing rounded-rect; disc = the trigger-anchored droplet. No
  // layout reads (trigRect/panelRect are cached at open) and none in the GL loop.
  //
  // §16.4 idle-at-rest: a self-driven rAF that runs ONLY while the pop is animating
  // (`active`) AND a GL tier is live — replacing a keepAlive useAnimationFrame that
  // ticked every frame for the pop's whole mounted lifetime (e.g. an always-mounted
  // sidebar user menu). When GL is off, or the pop is closed, no rAF runs at all.
  useEffect(() => {
    if (!glActive || !active) return;
    let raf = requestAnimationFrame(function loop() {
      if (trigRect.current && panelRect.current) {
        const w = growW.get();
        const h = growH.get();
        const left = growLeft.get();
        const top = growTop.get();
        budBody.set({
          cx: left + w / 2,
          cy: top + h / 2,
          hw: w / 2,
          hh: h / 2,
          radius: growRadius.get(),
          active: true,
        });
        const ds = discSize.get();
        discBody.set({
          cx: discLeft.get() + ds / 2,
          cy: discTop.get() + ds / 2,
          hw: ds / 2,
          hh: ds / 2,
          radius: ds / 2,
          active: true,
        });
      }
      raf = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(raf);
  }, [
    active,
    glActive,
    budBody,
    discBody,
    growW,
    growH,
    growLeft,
    growTop,
    growRadius,
    discSize,
    discLeft,
    discTop,
  ]);

  const underlay =
    active && !glActive && typeof document !== 'undefined'
      ? createPortal(
          <motion.div
            aria-hidden
            className="lg-goo"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: z,
              pointerEvents: 'none',
              opacity: blobOp,
              // §16.3.6 will-change discipline: the layer animates opacity, so hint
              // it — and this is disciplined because the underlay is mounted ONLY
              // while `active` (it unmounts the moment the morph settles), so the
              // hint is never left on a static element. Geometry is read once at
              // open (cached in trigRect/panelRect refs) — the per-frame transforms
              // read no layout, so the only mid-morph cost is the goo-filter raster
              // (M1's shader bud replaces it).
              willChange: 'opacity',
            }}
          >
            <motion.span
              style={{
                position: 'absolute',
                left: growLeft,
                top: growTop,
                width: growW,
                height: growH,
                borderRadius: growRadius,
                background: BLOB_TINT,
              }}
            />
            <motion.span
              style={{
                position: 'absolute',
                left: discLeft,
                top: discTop,
                width: discSize,
                height: discSize,
                borderRadius: '50%',
                background: BLOB_TINT,
              }}
            />
          </motion.div>,
          document.body,
        )
      : null;

  return { underlay };
}
