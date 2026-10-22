'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { GlobeCursorEngine, type HoverKind } from '@/lib/globe-cursor/engine';
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
 * ## When the frame runs
 *
 * The owner asked for a globe that everts constantly, so while the pointer is
 * over the page the frame runs every vsync. It stops — no frame scheduled at
 * all — when the pointer leaves the window, when the tab is hidden (the browser
 * pauses it), once fades/sparkles/trail have settled, and under reduced motion,
 * where the globe is drawn still (one frame per pointer event) instead of
 * animating. Unmount cancels it.
 */

const STYLE_ID = 'rmh-globe-cursor-style';
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

  // Settings → engine + stylesheet.
  useEffect(() => {
    settingsRef.current = settings;
    engineRef.current?.setSettings(settings);
    const canvas = canvasRef.current;
    if (canvas) canvas.style.mixBlendMode = settings.blend;
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const html = document.documentElement;

    let engine: GlobeCursorEngine;
    try {
      engine = new GlobeCursorEngine(settingsRef.current);
    } catch {
      return;
    }
    engineRef.current = engine;
    engine.setReduced(reducedRef.current);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      engine.setDpr(dpr);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      dirty = null; // resizing cleared the canvas
      kick();
    };

    let raf = 0;
    let last = 0;
    let dirty: { x: number; y: number; w: number; h: number } | null = null;
    let lastHover: HoverKind | 'native' = 'none';

    const frame = (now: number) => {
      raf = 0;
      const dt = last ? (now - last) / 1000 : 1 / 60;
      last = now;
      engine.step(dt);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // Clear only what the last frame painted: the globe covers a few hundred
      // pixels of a full-viewport canvas, and a full clear is a full raster.
      if (dirty) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        ctx.clearRect(
          Math.floor(dirty.x * dpr) - 2,
          Math.floor(dirty.y * dpr) - 2,
          Math.ceil(dirty.w * dpr) + 4,
          Math.ceil(dirty.h * dpr) + 4,
        );
      }
      dirty = engine.draw(ctx);
      // Reduced motion draws one still frame per event; otherwise keep going while anything moves.
      if (!reducedRef.current && engine.busy()) raf = requestAnimationFrame(frame);
      else last = 0;
    };
    function kick() {
      if (!raf) raf = requestAnimationFrame(frame);
    }
    kickRef.current = kick;

    const setNativeHidden = (hidden: boolean) => {
      html.classList.toggle(HTML_CLASS, hidden && settingsRef.current.hideNative);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') {
        engine.leave();
        setNativeHidden(false);
        kick();
        return;
      }
      if (lastHover === 'native') {
        engine.leave();
      } else {
        engine.move(e.clientX, e.clientY);
        setNativeHidden(true);
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
      kickRef.current = () => {};
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
  }, []);

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
