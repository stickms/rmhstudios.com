'use client';

/**
 * The stage — the React side of the figure.
 *
 * The same four responsibilities the car turntable has, for the same reasons:
 * the canvas, the frame loop, the gesture, and the ink. Everything about how a
 * person and their clothes look lives in `fashion-scene.ts`; everything about
 * what a garment IS lives in `lib/fashion/`.
 *
 * ## The loop starts on demand and stops on its own
 *
 * `kick()` schedules a frame; the scene's `frame()` says whether it wants
 * another, and stops the moment the throw has settled, the sway has died and
 * the last ripple has expired. Dressing, dyeing, resizing, a drag, a poke and a
 * theme change each kick it. A page with a dressed figure on it and nobody
 * touching it runs no rAF at all (§16.4), and an IntersectionObserver stops it
 * off-screen on top of that.
 *
 * ## Reaching it without a pointer
 *
 * The canvas is a picture as far as assistive tech is concerned. The turn is
 * therefore also three real buttons, not key handlers bolted onto a div with
 * `role="application"` — and the wardrobe itself is ordinary buttons, so the
 * whole service is operable without ever touching the 3D at all.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, RotateCw, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { VelocityTracker } from '@/lib/fluid';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { probeGpu } from '@/lib/render/probe';
import { TIER_QUALITY, detectTier } from '@/lib/render/tier';
import { readAlpha, readToken, resolveColor } from '@/lib/render/glass-cage';
import { SWATCHES, swatchVar, type SwatchId } from '@/lib/fashion/palette';
import type { Outfit } from '@/lib/fashion/wardrobe';
import { FashionScene, type FashionPaint } from './fashion-scene';
import './fashion.css';

interface FashionStageProps {
  outfit: Outfit;
  /** One sentence describing what is on the stage, already translated. */
  description: string;
}

/** How far a pointer may travel and still count as a poke rather than a drag. */
const POKE_SLOP = 6;
/** One press of a turn button. An eighth of a turn. */
const NUDGE = Math.PI / 4;

export function FashionStage({ outfit, description }: FashionStageProps) {
  const { t } = useTranslation('c-rmhfashion');
  const reduced = useReducedMotion();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<FashionScene | null>(null);
  const frameRef = useRef(0);
  const visibleRef = useRef(true);
  const [failed, setFailed] = useState(false);

  // The scene outlives every outfit change, so the two effects below can run in
  // either order: whichever gets there first dresses the figure.
  const outfitRef = useRef(outfit);
  outfitRef.current = outfit;
  const appliedRef = useRef<Outfit | null>(null);

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

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const gpu = probeGpu();
    if (gpu.backend === 'none') {
      setFailed(true);
      return;
    }
    // `reducedMotion` is deliberately not passed to the tier: there it means
    // "cut the effects", which would drop this to a 1x buffer — and under
    // reduced motion this canvas is a still picture, where a 1x buffer on a 3x
    // phone is just a blurry picture. The motion is cut inside the scene.
    const tier = detectTier({
      gpuTier: gpu.gpuTier,
      isMobile: window.matchMedia('(pointer: coarse)').matches,
      devicePixelRatio: window.devicePixelRatio || 1,
    });
    const quality = TIER_QUALITY[tier];

    let scene: FashionScene;
    try {
      scene = new FashionScene({
        canvas,
        maxDpr: quality.dpr[1],
        antialias: quality.antialias,
        reducedMotion: reduced,
        onContextLost: () => setFailed(true),
      });
    } catch {
      setFailed(true);
      return;
    }
    sceneRef.current = scene;
    scene.setPaint(readPaint(host));
    appliedRef.current = outfitRef.current;
    scene.setOutfit(outfitRef.current);

    const resize = new ResizeObserver(([entry]) => {
      scene.resize(entry.contentRect.width, entry.contentRect.height);
      kick();
    });
    resize.observe(host);

    const seen = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry.isIntersecting;
      if (entry.isIntersecting) kick();
    });
    seen.observe(host);

    // Themes land on <html> as a class (and user themes as inline custom
    // properties), so one observer catches every way the palette can change
    // without this component knowing that any of them exist.
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

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (appliedRef.current !== outfit) {
      appliedRef.current = outfit;
      scene.setOutfit(outfit);
    }
    kick();
  }, [outfit, kick]);

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
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      // A press that never really moved is a POKE, not a throw of zero speed.
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

  const hint = failed
    ? t('stage-hint-static', {
        defaultValue: 'Your browser can’t show the 3D model, so the wardrobe below still works.',
      })
    : reduced
      ? t('stage-hint-reduced', { defaultValue: 'Drag the stage to turn the figure.' })
      : t('stage-hint', {
          defaultValue: 'Drag to turn · tap the figure to make the fabric ripple',
        });

  return (
    <div className="flex flex-col gap-3">
      <div ref={hostRef} className="rmhfash-stage glass-pane glass-bevel-sm rounded-site">
        {failed ? (
          <div className="flex size-full items-center justify-center p-6 text-center text-sm text-site-text-muted">
            {t('stage-unavailable', {
              defaultValue:
                'This device can’t draw the figure, but everything you choose below is still saved to the outfit.',
            })}
          </div>
        ) : (
          <canvas ref={canvasRef} role="img" aria-label={description} />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
        <p className="text-xs text-site-text-dim">{hint}</p>
        {!failed && (
          <div className="flex items-center gap-1">
            {/* The near face of the figure follows the button, so a positive
                turn — which sweeps what you are looking at toward screen-right
                — is the right-hand one. */}
            <StageButton
              onClick={() => turn(-NUDGE)}
              label={t('turn-left', { defaultValue: 'Turn the figure left' })}
              icon={RotateCcw}
            />
            <StageButton
              onClick={home}
              label={t('reset-view', { defaultValue: 'Reset the view' })}
              icon={Undo2}
            />
            <StageButton
              onClick={() => turn(NUDGE)}
              label={t('turn-right', { defaultValue: 'Turn the figure right' })}
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
   The renderer names no colours. The site's ink comes from `--site-*`; the
   wardrobe's comes from the `--rmhfash-swatch-*` group, which is a domain-fixed
   palette rather than a theme token (a red coat is red in every theme). Both go
   through the browser's own parser first — see `lib/render/glass-cage`. */

function readPaint(host: HTMLElement): FashionPaint {
  const cs = getComputedStyle(host);
  const fallback = resolveColor(cs.color) ?? '#808080';
  const swatches = {} as Record<SwatchId, string>;
  for (const id of SWATCHES) swatches[id] = readToken(cs, swatchVar(id), fallback);
  return {
    ink: readToken(cs, '--site-text', fallback),
    accent: readToken(cs, '--site-accent', fallback),
    minor: readAlpha(cs, '--rmhfash-cage-minor', 0.26),
    parallel: readAlpha(cs, '--rmhfash-cage-parallel', 0.18),
    major: readAlpha(cs, '--rmhfash-cage-major', 0.5),
    swatches,
  };
}
