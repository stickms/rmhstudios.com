'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { msToAmbientTick } from '@/lib/jelly/ambient-tick';
import {
  GlobeCursorEngine,
  HOTSPOT_CSS,
  HOTSPOT_SIZE_PX,
  type HoverKind,
} from '@/lib/globe-cursor/engine';
import { acquireGlobeGl, type GlobeGl } from '@/lib/globe-cursor/gl';
import { IDLE_AFTER_MS, jellyBudget, jellyMode, onJellyEnvChange } from '@/lib/jelly/tiers';
import type { GlobeCursorSettings } from '@/lib/globe-cursor/settings';
import { useGlobeCursorStore } from '@/stores/globeCursorStore';

/**
 * The globe cursor itself: one fixed, click-through canvas over the viewport,
 * one set of document-level pointer listeners, one frame.
 *
 * The cursor is input, not decoration — it is the pointer — so it owns its own
 * listeners rather than riding `lib/liquid/runtime.ts`, and it is mounted once
 * per document (by `GlobeCursorRoot`), never per element.
 *
 * ## Latency and paint
 *
 * - **The GPU canvas itself, moved by the compositor.** With no trail and no
 *   sparkles (the defaults) and a WebGL 2 globe, the canvas the globe is
 *   rendered into IS what is on screen (`engine.directCanvas()`): a
 *   sprite-sized layer that follows the pointer with a `translate3d`, a
 *   compositor-only move. Nothing is copied into a 2D canvas — onto a small 2D
 *   canvas that copy is a GPU readback, measured at 5–7 ms a frame in Chromium
 *   — and no full-viewport layer is repainted or, under a blend mode,
 *   re-blended. The halo is a gradient element and the hotspot a dot element,
 *   both moved the same way, and the silhouette glow is a CSS `drop-shadow` on
 *   the globe's layer (GPU in every engine) instead of a canvas `shadowBlur` (a
 *   per-frame CPU blur in WebKit and Gecko). A trail or sparkles fly far from
 *   the globe, and the CPU fallback has no GPU canvas, so either keeps the
 *   full-viewport 2D canvas.
 * - **Centred on the pointer, always.** The globe is the cursor, so it is drawn
 *   exactly at the real pointer (`PointerEvent.clientX/Y`) — not at a predicted
 *   position, which overshoots on a stop or a turn and leaves the globe off the
 *   mouse — and over text fields too, where it shrinks and dims under the OS
 *   I-beam instead of sitting beside it. The follower spring is off by default
 *   (`lag` 0), so at rest and in motion the globe's centre is the pointer.
 *
 * ## When the frame runs
 *
 * Every vsync only while something the hand did is still settling — the pointer
 * moving, a spring, the fade, sparkles, the trail (`engine.busy()`).
 *
 * The owner asked for a globe that everts constantly, and it does, but the
 * eversion is ambient motion, so with the pointer resting and everything settled
 * it runs on the jelly ambient clock rather than on every vsync: a timer to the
 * next tick of the shared grid (`lib/jelly/ambient-tick.ts`) at the tier's
 * engaged rate for `IDLE_AFTER_MS` after the last input, then the idle floor —
 * the same ticks the docked globe draws on, so the two land in one frame
 * (R7: ≤ 31 frames/s at rest).
 *
 * Under jellyMotion `still` (WCAG 2.2.2), the degraded tiers, a game in play or a
 * hidden tab (`jellyMode().ambient` false) the eversion and spin hold still and,
 * once the cursor has come to rest under a still pointer, NO frame is scheduled
 * at all. It also stops when the pointer leaves the window, and under reduced
 * motion, where the globe is drawn still (one frame per pointer event). Unmount
 * cancels it.
 */

const STYLE_ID = 'rmh-globe-cursor-style';
/** The fixed, click-through, compositor-moved layer every direct-mode element is. */
const LAYER_CSS =
  'position:fixed;left:0;top:0;pointer-events:none;z-index:var(--z-cursor);will-change:transform,opacity;';
const HTML_CLASS = 'rmh-globe-cursor';

const INTERACTIVE =
  'a[href], button, [role="button"], [role="link"], [role="menuitem"], [role="option"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="slider"], label, summary, select, input[type="checkbox"], input[type="radio"], input[type="range"], input[type="color"], input[type="button"], input[type="submit"], [data-cursor="pointer"]';
const TEXT_FIELD =
  'textarea, [contenteditable]:not([contenteditable="false"]), input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="password"], input[type="tel"], input[type="number"]';
const NATIVE_ZONE = '[data-globe-cursor="off"]';

/** The stylesheet that hides the system cursor, minus the zones that keep it. */
function cursorCss(s: GlobeCursorSettings): string {
  const keep = [NATIVE_ZONE, `${NATIVE_ZONE} *`];
  if (s.honourCanvas) keep.push('canvas');
  if (s.nativeOverText) keep.push(TEXT_FIELD);
  return `html.${HTML_CLASS}, html.${HTML_CLASS} *:not(${keep.join(', ')}) { cursor: none !important; }`;
}

/** Whether everything the cursor paints stays near the globe (no trail, no sparkles): direct mode can draw it. */
const isLocal = (s: GlobeCursorSettings) => s.trail === 0 && !s.sparkles;

/** A direct-mode layer element with its last-written styles, so a frame writes only what changed. */
class Layer<E extends HTMLElement> {
  private last: Record<string, string> = {};
  constructor(readonly el: E) {
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = LAYER_CSS;
  }
  set(
    prop: 'transform' | 'opacity' | 'width' | 'height' | 'filter' | 'background' | 'mixBlendMode',
    v: string,
  ) {
    if (this.last[prop] === v) return;
    this.last[prop] = v;
    this.el.style[prop] = v;
  }
}

function classify(target: EventTarget | null, s: GlobeCursorSettings): HoverKind | 'native' {
  if (!(target instanceof Element)) return 'none';
  if (target.closest(NATIVE_ZONE)) return 'native';
  if (s.honourCanvas && target instanceof HTMLCanvasElement) return 'native';
  if (target.closest(TEXT_FIELD)) return 'text';
  if (target.closest(INTERACTIVE)) return 'interactive';
  return 'none';
}

export default function GlobeCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settings = useGlobeCursorStore((s) => s.settings);
  const reduced = useReducedMotion();
  const engineRef = useRef<GlobeCursorEngine | null>(null);
  const settingsRef = useRef(settings);
  const reducedRef = useRef(reduced);
  const kickRef = useRef<() => void>(() => {});
  /** Re-lay the canvas out for the current settings (small moving box vs full viewport). */
  const layoutRef = useRef<() => void>(() => {});
  /**
   * The GPU surface, built in the background (`acquireGlobeGl`): `undefined` while it builds, then the surface or null
   * (the CPU path). The cursor boots only once it is known, so a page never stalls a frame on the shader compile, and
   * until then the system cursor is the cursor. A later mount gets the same, already-built context back at once.
   */
  const [gpu, setGpu] = useState<GlobeGl | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void acquireGlobeGl().then((g) => {
      if (live) setGpu(g);
    });
    return () => {
      live = false;
    };
  }, []);

  // Settings → engine + stylesheet.
  useEffect(() => {
    settingsRef.current = settings;
    engineRef.current?.setSettings(settings);
    const canvas = canvasRef.current;
    if (canvas) canvas.style.mixBlendMode = settings.blend;
    // Re-lay out (direct vs full-viewport), which also carries the blend mode to the direct layers.
    layoutRef.current();
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (settings.hideNative) {
      if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        document.head.appendChild(style);
      }
      style.textContent = cursorCss(settings);
    } else {
      style?.remove();
      document.documentElement.classList.remove(HTML_CLASS);
    }
    kickRef.current();
  }, [settings]);

  useEffect(() => {
    reducedRef.current = reduced;
    engineRef.current?.setReduced(reduced);
    kickRef.current();
  }, [reduced]);

  useEffect(() => {
    if (gpu === undefined) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const html = document.documentElement;

    let engine: GlobeCursorEngine;
    try {
      engine = new GlobeCursorEngine(settingsRef.current, gpu);
    } catch {
      return;
    }
    engineRef.current = engine;
    engine.setReduced(reducedRef.current);

    // Direct mode: the engine's GPU canvas, a halo and a hotspot dot are on screen, each moved with a transform, and
    // the 2D canvas is parked. Otherwise the 2D canvas covers the viewport and the engine draws everything into it.
    let direct = false;
    let globe: Layer<HTMLCanvasElement> | null = null;
    const halo = new Layer(document.createElement('div'));
    const dot = new Layer(document.createElement('div'));
    dot.set('width', `${HOTSPOT_SIZE_PX}px`);
    dot.set('height', `${HOTSPOT_SIZE_PX}px`);
    dot.set('background', HOTSPOT_CSS);
    const layers = () => (globe ? [halo, globe, dot] : [halo, dot]);
    const unmountLayers = () => {
      for (const l of layers()) l.el.remove();
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      engine.setDpr(dpr);
      const surface = isLocal(settingsRef.current) ? engine.directCanvas() : null;
      direct = !!surface;
      if (direct && surface) {
        if (globe?.el !== surface) globe = new Layer(surface);
        canvas.style.display = 'none';
        canvas.width = canvas.height = 0;
        // Halo under the globe, dot over it; all just after the parked 2D canvas, in the same portal.
        canvas.after(halo.el, globe.el, dot.el);
        for (const l of layers()) l.set('mixBlendMode', settingsRef.current.blend);
      } else {
        unmountLayers();
        canvas.style.display = '';
        canvas.width = Math.round(window.innerWidth * dpr);
        canvas.height = Math.round(window.innerHeight * dpr);
      }
      dirty = null; // resizing cleared the canvas
      kick();
    };
    layoutRef.current = resize;

    /** One direct-mode frame: render the globe on the GPU, then move three layers. False if the GPU path is gone. */
    const drawDirect = (): boolean => {
      const f = engine.frameDirect();
      if (!f || !globe) return false;
      if (!f.visible) {
        for (const l of layers()) l.set('opacity', '0');
        return true;
      }
      globe.set('width', `${f.size}px`);
      globe.set('height', `${f.size}px`);
      globe.set('transform', `translate3d(${f.x}px, ${f.y}px, 0)`);
      globe.set('opacity', f.opacity.toFixed(3));
      globe.set('filter', engine.glowFilter());
      if (f.halo) {
        const r = Math.ceil(f.halo.r * 2) / 2;
        halo.set('width', `${2 * r}px`);
        halo.set('height', `${2 * r}px`);
        halo.set(
          'background',
          `radial-gradient(circle closest-side, ${f.halo.color} ${(f.halo.inner * 100).toFixed(1)}%, ${f.halo.clear} 100%)`,
        );
        halo.set('transform', `translate3d(${f.halo.x - r}px, ${f.halo.y - r}px, 0)`);
        halo.set('opacity', f.halo.opacity.toFixed(3));
      } else {
        halo.set('opacity', '0');
      }
      if (f.hotspot) {
        const h = HOTSPOT_SIZE_PX / 2;
        dot.set('transform', `translate3d(${f.hotspot.x - h}px, ${f.hotspot.y - h}px, 0)`);
        dot.set('opacity', f.hotspot.opacity.toFixed(3));
      } else {
        dot.set('opacity', '0');
      }
      return true;
    };

    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | 0 = 0;
    let last = 0;
    let lastInput = performance.now();
    let dirty: { x: number; y: number; w: number; h: number } | null = null;
    let lastHover: HoverKind | 'native' = 'none';

    // The jelly policy, re-read only when it changes (never per frame): may the eversion run on its own, and at what
    // ambient rates.
    let engagedHz = 0;
    let idleHz = 0;
    const readEnv = () => {
      const ambient = jellyMode().ambient;
      const budget = jellyBudget();
      engine.setAmbient(ambient);
      engagedHz = ambient ? budget.clockHz : 0;
      idleHz = ambient ? budget.idleClockHz : 0;
      kick();
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = last ? (now - last) / 1000 : 1 / 60;
      last = now;
      engine.step(dt);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // The GPU context can be lost under us: fall back to the 2D canvas for good.
      if (direct && !drawDirect()) resize();
      if (!direct) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        // Clear only what the last frame painted: the globe covers a few hundred
        // pixels of a full-viewport canvas, and a full clear is a full raster.
        if (dirty) {
          ctx.clearRect(
            Math.floor(dirty.x * dpr) - 2,
            Math.floor(dirty.y * dpr) - 2,
            Math.ceil(dirty.w * dpr) + 4,
            Math.ceil(dirty.h * dpr) + 4,
          );
        }
        dirty = engine.draw(ctx);
      }
      syncNative();
      // Reduced motion draws one still frame per event. Otherwise: every vsync while anything settles, the ambient
      // tick while only the eversion runs, and nothing at all once it rests (ambient motion off, or no pointer).
      if (reducedRef.current) {
        last = 0;
        return;
      }
      if (engine.busy()) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const at = performance.now();
      const hz = engine.everting() ? (at - lastInput < IDLE_AFTER_MS ? engagedHz : idleHz) : 0;
      const wait = msToAmbientTick(at, hz);
      if (wait === Infinity) {
        last = 0;
        return;
      }
      // `last` is kept: the eversion advances by the real time between ticks.
      timer = setTimeout(() => {
        timer = 0;
        if (!raf) raf = requestAnimationFrame(frame);
      }, wait);
    };
    function kick() {
      if (raf) return;
      if (timer) {
        clearTimeout(timer);
        timer = 0;
      }
      raf = requestAnimationFrame(frame);
    }
    kickRef.current = kick;

    // The system cursor goes only once the globe covers the pointer (`coversPointer`: grown in, faded up), and comes
    // back the moment it does not. Re-checked every frame, written only when it changes.
    let nativeHidden = false;
    const syncNative = () => {
      const hidden = engine.coversPointer() && settingsRef.current.hideNative;
      if (hidden === nativeHidden && html.classList.contains(HTML_CLASS) === hidden) return;
      nativeHidden = hidden;
      html.classList.toggle(HTML_CLASS, hidden);
    };

    const onMove = (e: PointerEvent) => {
      lastInput = performance.now();
      if (e.pointerType !== 'mouse') {
        engine.leave();
        syncNative();
        kick();
        return;
      }
      if (lastHover === 'native') {
        engine.leave();
      } else {
        engine.move(e.clientX, e.clientY);
      }
      kick();
    };
    const onOver = (e: PointerEvent) => {
      const kind = classify(e.target, settingsRef.current);
      lastHover = kind;
      if (kind === 'native') engine.leave();
      else engine.setHover(kind);
      kick();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      lastInput = performance.now();
      engine.down();
      kick();
    };
    const onUp = () => {
      engine.up();
      kick();
    };
    const onLeave = (e: MouseEvent) => {
      if (e.relatedTarget === null) {
        engine.leave();
        engine.up();
        kick();
      }
    };
    const onBlur = () => {
      engine.leave();
      engine.up();
      kick();
    };

    resize();
    readEnv();
    const stopEnv = onJellyEnvChange(readEnv);
    window.addEventListener('resize', resize);
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerover', onOver, { passive: true });
    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('pointercancel', onUp, { passive: true });
    document.addEventListener('mouseout', onLeave, { passive: true });
    window.addEventListener('blur', onBlur);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      stopEnv();
      kickRef.current = () => {};
      layoutRef.current = () => {};
      unmountLayers();
      engine.dispose();
      engineRef.current = null;
      window.removeEventListener('resize', resize);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      document.removeEventListener('mouseout', onLeave);
      window.removeEventListener('blur', onBlur);
      html.classList.remove(HTML_CLASS);
      document.getElementById(STYLE_ID)?.remove();
    };
  }, [gpu]);

  // Portalled: the cursor must sit above the shell's chrome, never inside `.radial-frame`.
  return createPortal(
    <canvas
      ref={canvasRef}
      aria-hidden
      data-globe-cursor-canvas=""
      className="pointer-events-none fixed inset-0 z-[var(--z-cursor)] h-full w-full"
    />,
    document.body,
  );
}
