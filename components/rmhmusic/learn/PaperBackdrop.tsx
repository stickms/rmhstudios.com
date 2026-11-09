'use client';

/**
 * PaperBackdrop — the band of staff paper behind RMH Music, with notes drifting along it and the
 * note a learner plays popping onto a staff at its pitch.
 *
 * The staves are CSS (`.rmm-backdrop` in rmhmusic.css): they paint with the page, before any
 * script, and never change. This canvas, transparent and over them, draws only the marks the
 * pure renderer in `lib/rmhmusic/learn/backdrop/scene.ts` lays out — so its first frame adds
 * notes and changes no colour, and with no canvas (no script, no 2D context) the paper is the
 * same paper. The buffer is fixed per layout (resized only when the band's box changes, never
 * per frame), at no more than 1.5 device pixels per CSS pixel.
 *
 * Loop bounds (lib/__tests__/raf-loop-allowlist.test.ts), as Kowloon's MenuBackdrop: a frame is
 * requested only while the component is mounted AND the tab is visible AND the band is on
 * screen AND Jelly motion is not Still (the site's ambient-motion setting, WCAG 2.2.2: the one site
 * control this route still honours; the route itself is native-material, with none of the jelly
 * material). Unmount cancels it; a hidden tab cancels it and
 * `visibilitychange` restarts it; scrolling the band out of view stops it (IntersectionObserver)
 * and back in restarts it; `data-jelly-motion="still"` draws one frame and stops, and switching
 * back restarts the loop. It runs at 30 fps, 15 fps on handhelds and low-end devices.
 *
 * Played notes come from the input hub through a plain subscription held in the effect — no
 * React state, so playing re-renders nothing. Colours are read from the CSS tokens once per
 * mode change, never per frame.
 */

import { useEffect, useRef, useState } from 'react';
import { jellyMotionLevel, jellyTier } from '@/lib/jelly/tiers';
import { isLowEndCapability } from '@/lib/low-end';
import {
  MAX_POPS,
  POP_IN,
  createScene,
  drawScene,
  popNote,
  stepScene,
  type Palette,
  type Scene,
} from '@/lib/rmhmusic/learn/backdrop/scene';
import type { InputHub } from '@/lib/rmhmusic/learn/input/hub';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { subscribeMode } from '../useRmhMusicMode';

const FRAME_MS = 1000 / 30;
const FRAME_MS_LOW = 1000 / 15;
/** Device pixels per CSS pixel, at most (a faint backdrop does not need a retina buffer). */
const MAX_SCALE = 1.5;
/** And never more than this many pixels in the buffer. */
const MAX_PIXELS = 2_400_000;

export function PaperBackdrop() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let scene: Scene | null = null;
    let raf = 0;
    let last = 0;
    let painted = false;
    let onScreen = true;
    let seed = 1;
    const palette: Palette = { note: '', pop: '' };

    const readPalette = () => {
      const css = getComputedStyle(host);
      palette.note = css.getPropertyValue('--rmm-note').trim() || 'transparent';
      palette.pop = css.getPropertyValue('--rmm-pop').trim() || palette.note;
    };

    const paint = () => {
      if (!scene) return;
      drawScene(scene, ctx, palette);
      if (!painted) {
        painted = true;
        setReady(true);
      }
    };

    const still = () => jellyMotionLevel() === 'still';

    const layout = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w <= 0 || h <= 0) return;
      if (scene && scene.width === w && scene.height === h) return;
      const dpr = typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1;
      const scale = Math.max(0.5, Math.min(dpr, MAX_SCALE, Math.sqrt(MAX_PIXELS / (w * h))));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      scene = createScene(w, h, seed++);
      // A layout change while still (or before the loop's first frame): redraw at the new size.
      paint();
    };

    const frame = (now: number) => {
      raf = 0;
      if (document.hidden || !onScreen || !scene) return;
      if (still()) {
        paint();
        return;
      }
      const tier = jellyTier();
      const interval = tier === 'handheld' || isLowEndCapability() ? FRAME_MS_LOW : FRAME_MS;
      if (last === 0) last = now;
      if (now - last >= interval) {
        stepScene(scene, (now - last) / 1000);
        last = now;
        paint();
      }
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (raf === 0 && !document.hidden && onScreen) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    const stop = () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
    };
    const restart = () => {
      stop();
      start();
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    // A played note. While still, it is drawn where it lands and stays (only the latest one).
    const onNote = (midi: number) => {
      if (!scene) return;
      if (still()) {
        for (let i = 0; i < MAX_POPS; i++) scene.pops[i].alive = false;
        popNote(scene, midi);
        const slot = (scene.nextPop + MAX_POPS - 1) % MAX_POPS;
        scene.pops[slot].age = POP_IN;
        paint();
      } else {
        popNote(scene, midi);
      }
    };
    let hub: InputHub | null = null;
    let offNotes: (() => void) | null = null;
    const bindHub = (next: InputHub | null) => {
      if (next === hub) return;
      offNotes?.();
      hub = next;
      offNotes = hub ? hub.subscribe((e) => e.type === 'on' && onNote(e.midi)) : null;
    };
    bindHub(useLearnStore.getState().hub);
    const offStore = useLearnStore.subscribe((s) => bindHub(s.hub));

    readPalette();
    const offMode = subscribeMode(() => {
      readPalette();
      paint();
    });

    layout();
    start();
    document.addEventListener('visibilitychange', onVisibility);
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(layout) : null;
    resize?.observe(canvas);
    const motion = typeof MutationObserver !== 'undefined' ? new MutationObserver(restart) : null;
    motion?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-jelly-motion'],
    });
    const seen =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([entry]) => {
            onScreen = entry?.isIntersecting ?? true;
            if (onScreen) start();
            else stop();
          })
        : null;
    seen?.observe(host);

    return () => {
      stop();
      resize?.disconnect();
      motion?.disconnect();
      seen?.disconnect();
      offStore();
      offNotes?.();
      offMode();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div ref={hostRef} className="rmm-backdrop" aria-hidden="true">
      <canvas
        ref={canvasRef}
        className="rmm-backdrop__canvas"
        data-ready={ready ? 'true' : undefined}
      />
    </div>
  );
}
