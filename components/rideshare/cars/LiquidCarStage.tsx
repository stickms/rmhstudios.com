'use client';

/**
 * The stage — the React side of the liquid car.
 *
 * It owns four things and nothing else: the canvas, the frame loop, the gesture,
 * and the ink. Everything about how a vehicle actually looks lives in
 * `liquid-car-scene.ts`; everything about what a vehicle IS lives in
 * `lib/rideshare/cars.ts`.
 *
 * ## The loop starts on demand and stops on its own
 *
 * `kick()` schedules a frame; the scene's `frame()` says whether it wants
 * another. Drag, release, poke, a body swap, a resize and a theme change each
 * kick it, and it winds itself down the moment the throw settles and the last
 * ripple dies. A page with this component on it and nobody touching it runs no
 * rAF at all — the §16.4 idle-at-rest rule that the site's shared motion tier
 * lives by, applied to a canvas. (Off-screen it does not even do that: an
 * IntersectionObserver stops the loop, and a tab in the background never gets a
 * frame from the browser in the first place.)
 *
 * ## Reaching it without a pointer
 *
 * The canvas is a picture as far as assistive tech is concerned, and the drag is
 * a pointer affordance layered on top of it. So the turn is ALSO three real
 * buttons underneath — turn left, turn right, reset — rather than key handlers
 * bolted onto a `div` with `role="application"`. A keyboard user gets the same
 * control through a control they can find, and a screen reader gets a described
 * image plus three labelled buttons instead of an interactive black box.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, RotateCw, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { VelocityTracker } from '@/lib/fluid';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { probeGpu } from '@/lib/render/probe';
import { TIER_QUALITY, detectTier } from '@/lib/render/tier';
import type { CarBodySpec } from '@/lib/rideshare/cars';
import { LiquidCarScene, type CarPaint } from './liquid-car-scene';
import { CarSilhouette } from './CarSilhouette';
import './cars.css';

interface LiquidCarStageProps {
  spec: CarBodySpec;
  /** The vehicle's name, for the canvas's accessible description. */
  name: string;
  /** One sentence describing what is on the stage, already translated. */
  description: string;
}

/** How far a pointer may travel and still count as a poke rather than a drag. */
const POKE_SLOP = 6;
/** One press of a turn button, in radians. An eighth of a turn. */
const NUDGE = Math.PI / 4;

export function LiquidCarStage({ spec, name, description }: LiquidCarStageProps) {
  const { t } = useTranslation('c-rideshare');
  const reduced = useReducedMotion();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<LiquidCarScene | null>(null);
  const frameRef = useRef(0);
  const visibleRef = useRef(true);
  const [failed, setFailed] = useState(false);

  // The scene is created once and lives across body swaps, so the two effects
  // below can run in either order: whichever gets there first puts the current
  // vehicle on the stage, and `applied` stops the other from rebuilding it.
  const specRef = useRef(spec);
  specRef.current = spec;
  const appliedRef = useRef<CarBodySpec | null>(null);

  /** Ask for a frame. A no-op while one is already pending or the stage is away. */
  const kick = useCallback(() => {
    if (frameRef.current || !visibleRef.current || !sceneRef.current) return;
    const step = (now: number) => {
      frameRef.current = 0;
      const scene = sceneRef.current;
      if (!scene || !visibleRef.current) return;
      if (scene.frame(now)) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
  }, []);

  /* ── The scene ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const gpu = probeGpu();
    if (gpu.backend === 'none') {
      setFailed(true);
      return;
    }

    // The tier is asked for two numbers only — a device-pixel ceiling and
    // whether to multisample — so `reducedMotion` is deliberately NOT passed to
    // it. There it means "cut the effects", which would drop this stage to a 1x
    // buffer; but under reduced motion this canvas is a still picture, and a
    // still picture at 1x on a 3x phone is just a blurry picture. The motion is
    // cut where motion lives, inside the scene.
    const tier = detectTier({
      gpuTier: gpu.gpuTier,
      isMobile: window.matchMedia('(pointer: coarse)').matches,
      devicePixelRatio: window.devicePixelRatio || 1,
    });
    const quality = TIER_QUALITY[tier];

    let scene: LiquidCarScene;
    try {
      scene = new LiquidCarScene({
        canvas,
        maxDpr: quality.dpr[1],
        antialias: quality.antialias,
        reducedMotion: reduced,
        onContextLost: () => setFailed(true),
      });
    } catch {
      // A browser can advertise WebGL and still refuse a context (a blocklisted
      // driver, too many live contexts). The silhouette is a complete fallback,
      // so this is a downgrade rather than an error to report.
      setFailed(true);
      return;
    }
    sceneRef.current = scene;
    scene.setPaint(readPaint(host));
    appliedRef.current = specRef.current;
    scene.setBody(specRef.current);

    const resize = new ResizeObserver(([entry]) => {
      const box = entry.contentRect;
      scene.resize(box.width, box.height);
      kick();
    });
    resize.observe(host);

    // Off-screen the loop stops entirely rather than rendering a canvas nobody
    // can see — the cheapest possible answer to "what does this cost while the
    // visitor is reading the rest of the page".
    const seen = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry.isIntersecting;
      if (entry.isIntersecting) kick();
    });
    seen.observe(host);

    // Themes land on <html> as a class (and user themes as inline custom
    // properties), so one observer catches every way the palette can change —
    // the built-in themes, an accent preset, a marketplace theme, high contrast
    // — without this component having to know that any of them exist.
    const repaint = new MutationObserver(() => {
      sceneRef.current?.setPaint(readPaint(host));
      kick();
    });
    repaint.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    return () => {
      resize.disconnect();
      seen.disconnect();
      repaint.disconnect();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      sceneRef.current = null;
      appliedRef.current = null;
      scene.dispose();
    };
  }, [kick, reduced]);

  /* ── The body on the stage ─────────────────────────────────────────────── */

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (appliedRef.current !== spec) {
      appliedRef.current = spec;
      scene.setBody(spec);
    }
    kick();
  }, [spec, kick]);

  /* ── The gesture ───────────────────────────────────────────────────────── */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || failed) return;

    const velocityX = new VelocityTracker();
    const velocityY = new VelocityTracker();
    let pointer: number | null = null;
    let lastX = 0;
    let lastY = 0;
    let travelled = 0;

    const down = (event: PointerEvent) => {
      const scene = sceneRef.current;
      if (!scene || pointer !== null) return;
      pointer = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      travelled = 0;
      velocityX.reset();
      velocityY.reset();
      velocityX.add(event.clientX, event.timeStamp);
      velocityY.add(event.clientY, event.timeStamp);
      canvas.setPointerCapture(event.pointerId);
      scene.grab();
      kick();
    };

    const move = (event: PointerEvent) => {
      const scene = sceneRef.current;
      if (!scene || event.pointerId !== pointer) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      travelled += Math.hypot(dx, dy);
      velocityX.add(event.clientX, event.timeStamp);
      velocityY.add(event.clientY, event.timeStamp);
      scene.drag(dx, dy);
      kick();
    };

    const up = (event: PointerEvent) => {
      const scene = sceneRef.current;
      if (!scene || event.pointerId !== pointer) return;
      pointer = null;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      // A press that never really moved is a POKE, not a throw of zero speed —
      // otherwise every tap ends in a settle spring that has nothing to settle.
      if (travelled <= POKE_SLOP) {
        const rect = canvas.getBoundingClientRect();
        scene.poke(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -(((event.clientY - rect.top) / rect.height) * 2 - 1),
        );
        scene.release(0, 0);
      } else {
        scene.release(velocityX.get(), velocityY.get());
      }
      kick();
    };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    };
  }, [failed, kick]);

  const turn = useCallback(
    (radians: number) => {
      sceneRef.current?.nudge(radians, 0);
      kick();
    },
    [kick],
  );

  const home = useCallback(() => {
    sceneRef.current?.home();
    kick();
  }, [kick]);

  // Three hints, because there are three things this stage can be: a live
  // turntable, a live turntable that has been asked not to animate, and a flat
  // drawing on a machine with no WebGL. Telling the third one to drag would be
  // an instruction it cannot follow.
  const hint = failed
    ? t('cars-hint-static', {
        defaultValue: 'Your browser can’t show the 3D model, so here is the side elevation.',
      })
    : reduced
      ? t('cars-hint-reduced', { defaultValue: 'Drag the stage to turn it.' })
      : t('cars-hint', { defaultValue: 'Drag to turn it · tap it to make it ripple' });

  return (
    <div className="flex flex-col gap-3">
      <div ref={hostRef} className="rmhcar-stage glass-pane glass-bevel-sm rounded-site">
        {failed ? (
          // No GPU, or the context went away. The silhouette is the same body,
          // drawn from the same sections — a smaller thing to see, not a
          // different one, and never an empty box with an apology in it.
          <CarSilhouette
            spec={spec}
            frame="body"
            title={description}
            className="size-full p-6 text-site-text"
          />
        ) : (
          <canvas ref={canvasRef} role="img" aria-label={description} />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
        <p className="text-xs text-site-text-dim">{hint}</p>
        {!failed && (
          <div className="flex items-center gap-1">
            {/* The near face of the body follows the button: a positive turn
                about the turntable's axis sweeps what you are looking at toward
                screen-right, so THAT is the right-hand button. */}
            <StageButton
              onClick={() => turn(-NUDGE)}
              label={t('cars-turn-left', { defaultValue: 'Turn {{name}} left', name })}
              icon={RotateCcw}
            />
            <StageButton
              onClick={home}
              label={t('cars-reset-view', { defaultValue: 'Reset the view' })}
              icon={Undo2}
            />
            <StageButton
              onClick={() => turn(NUDGE)}
              label={t('cars-turn-right', { defaultValue: 'Turn {{name}} right', name })}
              icon={RotateCw}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function StageButton({
  onClick,
  label,
  icon: Icon,
}: {
  onClick: () => void;
  label: string;
  icon: typeof RotateCw;
}) {
  return (
    <Button variant="ghost" size="icon-sm" onClick={onClick} title={label} aria-label={label}>
      <Icon className="size-4" aria-hidden />
    </Button>
  );
}

/* ── Ink ─────────────────────────────────────────────────────────────────────
   The renderer names no colours (see `CarPaint`), so they are read off the stage
   element's own computed style and handed over. Two things make that awkward
   enough to be worth explaining:

   1. A custom property's computed value is whatever the theme wrote — `#f5f5f7`,
      `rgba(...)`, an `oklch()`, or a `color-mix()` an engine has not resolved.
      `THREE.Color.setStyle` understands the first two and silently falls back to
      white on the rest, which is how a themed scene ends up rendered in white.
      So each value goes through the browser's OWN parser first: a 2D context's
      `fillStyle` accepts any colour the engine can parse and hands back a
      normalised `#rrggbb`/`rgba()`, and rejects what it cannot by leaving the
      previous value in place — which is also how {@link resolveColor} detects a
      value it must not pass on.
   2. The cage alphas are numbers, not colours (cars.css), precisely so this
      round trip is not needed for them. */

let colourProbe: CanvasRenderingContext2D | null | undefined;

/** A CSS colour the renderer can take, or `null` if the engine cannot parse it. */
function resolveColor(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (colourProbe === undefined) {
    colourProbe = document.createElement('canvas').getContext('2d');
  }
  if (!colourProbe) return null;
  // Set from two different starting points: an unparseable value leaves each
  // one where it was, so the two answers disagree and the value is rejected.
  colourProbe.fillStyle = '#000000';
  colourProbe.fillStyle = raw;
  const fromBlack = colourProbe.fillStyle;
  colourProbe.fillStyle = '#ffffff';
  colourProbe.fillStyle = raw;
  return colourProbe.fillStyle === fromBlack ? String(fromBlack) : null;
}

function readPaint(host: HTMLElement): CarPaint {
  const cs = getComputedStyle(host);
  // The element's own resolved `color` is the last resort, and a good one: it is
  // `--site-text` by inheritance on every theme, already normalised by the
  // engine, and it can never be missing.
  const fallback = resolveColor(cs.color) ?? '#808080';
  const token = (name: string) => resolveColor(cs.getPropertyValue(name)) ?? fallback;
  const alpha = (name: string, dflt: number) => {
    const parsed = parseFloat(cs.getPropertyValue(name));
    return Number.isFinite(parsed) ? parsed : dflt;
  };
  return {
    ink: token('--site-text'),
    accent: token('--site-accent'),
    minor: alpha('--rmhcar-cage-minor', 0.28),
    parallel: alpha('--rmhcar-cage-parallel', 0.2),
    major: alpha('--rmhcar-cage-major', 0.52),
  };
}
