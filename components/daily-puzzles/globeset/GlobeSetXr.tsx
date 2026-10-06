'use client';

/**
 * GlobeSet, standing in your room.
 *
 * An `immersive-ar` session puts the globe on a real surface and leaves it
 * there. This is the only mode with genuine **6DoF**: the sphere is anchored to
 * a point in the room, so leaning gives parallax and walking round the back of
 * it actually shows you the back of it. The page's gyroscope mode is 3DoF —
 * orientation only — and turning in place there does the same thing as walking,
 * which is the difference this mode exists to close.
 *
 * ## Why this is three.js and the page's globe is not
 *
 * The DOM globe is seven elements under a CSS `perspective`, which is the right
 * tool for a sphere on a page and no tool at all for one in a room: WebXR hands
 * out a projection matrix per eye per frame and expects a WebGL framebuffer
 * back. So the cards become textured planes here. What does NOT change is the
 * game: `lib/globeset/globe.ts` supplies the same seven slot directions, and
 * every claim goes through the same `onToggle` the flat board and the DOM globe
 * call, so a set claimed in the room is the same run as a set claimed on the
 * page.
 *
 * ## Placement
 *
 * A reticle rides the hit-test against real geometry; the first tap plants the
 * globe there, and every tap after that is a card pick. When the device finds
 * no surface (poor light, a featureless floor) the globe drops in at arm's
 * length in front of the viewer instead, because a puzzle you cannot start is
 * worse than one sitting slightly wrong.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { DOT_COLORS, type Card } from '@/lib/globeset/cards';
import { SLOT_DIRECTIONS } from '@/lib/globeset/globe';
import { formatDuration } from '@/lib/globeset/game';
import {
  AR_CARD_HEIGHT_M,
  AR_CARD_WIDTH_M,
  AR_DOT_RADIUS,
  AR_DOT_SLOTS,
  AR_FALLBACK_DISTANCE_M,
  AR_GLOBE_RADIUS_M,
  AR_TEXTURE_PPM,
  readPalette,
} from '@/lib/globeset/xr';

export interface GlobeSetXrProps {
  board: readonly Card[];
  selected: readonly Card[];
  hinted: readonly Card[];
  shapes: boolean;
  /** HUD figures — the DOM overlay renders them over the passthrough. */
  elapsedSeconds: number;
  cardsLeft: number;
  sets: number;
  onToggle: (card: Card) => void;
  /** The session ended, by the player or by the runtime. */
  onExit: () => void;
}

/** Texture side, in pixels. One card is a small object; 256 is generous. */
const TEX = Math.round(AR_CARD_WIDTH_M * AR_TEXTURE_PPM * 0.125);

export function GlobeSetXr(props: GlobeSetXrProps) {
  const { t } = useTranslation('c-daily-puzzles');
  const overlayRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState(false);
  const [running, setRunning] = useState(false);

  // Everything the frame loop and the select handler read lives in a ref, so a
  // re-render (the clock ticks every 250ms) never re-arms the XR session.
  const propsRef = useRef(props);
  propsRef.current = props;
  const sessionRef = useRef<XRSession | null>(null);

  const endSession = useCallback(() => {
    void sessionRef.current?.end().catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    let renderer: THREE.WebGLRenderer | null = null;
    let hitTestSource: XRHitTestSource | null = null;
    const disposables: { dispose(): void }[] = [];

    const start = async () => {
      const overlay = overlayRef.current;
      if (!overlay) return;

      let session: XRSession;
      try {
        session = await navigator.xr!.requestSession('immersive-ar', {
          // `local-floor` is required rather than optional: the globe is meant
          // to stand on the ground the player is standing on, and a session
          // that cannot say where that is would place it at head height.
          requiredFeatures: ['local-floor'],
          optionalFeatures: ['hit-test', 'dom-overlay'],
          domOverlay: { root: overlay },
        });
      } catch {
        // Declined, or no runtime after all. Say so and fall back to the page.
        if (!cancelled) {
          toast.error(
            t('globeset-ar-failed', {
              defaultValue: 'Could not start the room view — the globe is still on the page.',
            }),
          );
          propsRef.current.onExit();
        }
        return;
      }
      if (cancelled) {
        void session.end().catch(() => {});
        return;
      }
      sessionRef.current = session;
      setRunning(true);

      /* ── Renderer ─────────────────────────────────────────────────────── */
      const canvas = document.createElement('canvas');
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.xr.enabled = true;
      // The runtime owns the framebuffer in XR, so DPR is expressed as a scale
      // factor rather than by sizing the canvas ourselves.
      renderer.xr.setFramebufferScaleFactor(1);
      renderer.xr.setReferenceSpaceType('local-floor');
      await renderer.xr.setSession(session);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.2));

      /* ── The globe ────────────────────────────────────────────────────── */
      const palette = readPalette(overlay);
      const globe = new THREE.Group();
      globe.visible = false;
      scene.add(globe);

      const wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(new THREE.SphereGeometry(AR_GLOBE_RADIUS_M, 24, 16)),
        new THREE.LineBasicMaterial({
          color: new THREE.Color(palette.edge),
          transparent: true,
          opacity: 0.35,
        }),
      );
      globe.add(wire);
      disposables.push(wire.geometry, wire.material as THREE.Material);

      /** One plane per board slot, plus a highlight plate behind it. */
      const slots = SLOT_DIRECTIONS.map((dir) => {
        // `lib/globeset/globe.ts` is screen-handed (y DOWN); three.js is y-up.
        const normal = new THREE.Vector3(dir.x, -dir.y, dir.z).normalize();
        const holder = new THREE.Group();
        holder.position.copy(normal).multiplyScalar(AR_GLOBE_RADIUS_M);
        holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

        const texture = new THREE.CanvasTexture(document.createElement('canvas'));
        texture.colorSpace = THREE.SRGBColorSpace;
        const face = new THREE.Mesh(
          new THREE.PlaneGeometry(AR_CARD_WIDTH_M, AR_CARD_HEIGHT_M),
          new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
        );
        const glow = new THREE.Mesh(
          new THREE.PlaneGeometry(AR_CARD_WIDTH_M * 1.16, AR_CARD_HEIGHT_M * 1.22),
          new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.85 }),
        );
        glow.position.z = -0.0015;
        glow.visible = false;

        holder.add(glow, face);
        globe.add(holder);
        disposables.push(
          texture,
          face.geometry,
          face.material as THREE.Material,
          glow.geometry,
          glow.material as THREE.Material,
        );
        return { holder, face, glow, texture };
      });

      /* ── Reticle ──────────────────────────────────────────────────────── */
      const reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.06, 0.075, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }),
      );
      reticle.matrixAutoUpdate = false;
      reticle.visible = false;
      scene.add(reticle);
      disposables.push(reticle.geometry, reticle.material as THREE.Material);

      /* ── Input ────────────────────────────────────────────────────────── */
      const controller = renderer.xr.getController(0);
      scene.add(controller);
      const raycaster = new THREE.Raycaster();
      const rotation = new THREE.Matrix4();
      let isPlaced = false;

      const onSelect = () => {
        if (!isPlaced) {
          if (reticle.visible) {
            globe.position.setFromMatrixPosition(reticle.matrix);
            globe.position.y += AR_GLOBE_RADIUS_M * 1.15;
          } else {
            // No surface found — arm's length in front of the viewer.
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            globe.position
              .copy(camera.position)
              .add(forward.multiplyScalar(AR_FALLBACK_DISTANCE_M));
          }
          globe.visible = true;
          reticle.visible = false;
          isPlaced = true;
          setPlaced(true);
          return;
        }

        rotation.identity().extractRotation(controller.matrixWorld);
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rotation);
        const hits = raycaster.intersectObjects(
          slots.map((s) => s.face),
          false,
        );
        if (hits.length === 0) return;
        const index = slots.findIndex((s) => s.face === hits[0].object);
        const card = propsRef.current.board[index];
        if (card !== undefined) propsRef.current.onToggle(card);
      };
      controller.addEventListener('select', onSelect);

      /* ── Hit test ─────────────────────────────────────────────────────── */
      try {
        const viewerSpace = await session.requestReferenceSpace('viewer');
        hitTestSource = (await session.requestHitTestSource?.({ space: viewerSpace })) ?? null;
      } catch {
        hitTestSource = null; // the fallback placement covers this
      }

      /* ── Faces ────────────────────────────────────────────────────────── */
      let painted = '';
      const repaint = () => {
        const { board, selected, hinted, shapes } = propsRef.current;
        const key = `${board.join(',')}|${selected.join(',')}|${hinted.join(',')}|${shapes}`;
        if (key === painted) return;
        painted = key;
        slots.forEach((slot, i) => {
          const card = board[i];
          slot.holder.visible = card !== undefined;
          if (card === undefined) return;
          paintCard(slot.texture.image as HTMLCanvasElement, card, {
            palette,
            shapes,
            hinted: hinted.includes(card),
          });
          slot.texture.needsUpdate = true;
          slot.glow.visible = selected.includes(card);
        });
      };

      /* ── Frame loop. `setAnimationLoop` is the XR-driven one; three stops
            it when the session ends, so there is no rAF to cancel here. ──── */
      const refSpace = renderer.xr.getReferenceSpace();
      renderer.setAnimationLoop((_time, frame) => {
        if (frame && hitTestSource && !isPlaced && refSpace) {
          const results = frame.getHitTestResults(hitTestSource);
          const pose = results[0]?.getPose(refSpace);
          if (pose) {
            reticle.visible = true;
            reticle.matrix.fromArray(pose.transform.matrix);
          } else {
            reticle.visible = false;
          }
        }
        repaint();
        renderer!.render(scene, camera);
      });

      const onEnd = () => {
        sessionRef.current = null;
        setRunning(false);
        setPlaced(false);
        propsRef.current.onExit();
      };
      session.addEventListener('end', onEnd, { once: true });
    };

    void start();

    return () => {
      cancelled = true;
      // Ending the session is what tears the rest down: three stops its own
      // animation loop on `sessionend`, and the GPU objects go with it.
      void sessionRef.current?.end().catch(() => {});
      sessionRef.current = null;
      hitTestSource?.cancel?.();
      renderer?.setAnimationLoop(null);
      for (const item of disposables) item.dispose();
      renderer?.dispose();
    };
    // Armed once. Everything the loop reads comes from `propsRef`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── The DOM overlay, drawn over the passthrough by the runtime ───────── */
  return (
    <div ref={overlayRef} className="fixed inset-0 z-[400] flex flex-col justify-between p-4">
      {running && (
        <>
          <div className="glass-overlay flex items-center justify-between gap-4 rounded-site px-4 py-2">
            <dl className="flex items-center gap-5 text-site-text">
              <Figure label={t('globeset-stat-time', { defaultValue: 'Time' })}>
                {formatDuration(props.elapsedSeconds)}
              </Figure>
              <Figure label={t('globeset-stat-cards-left', { defaultValue: 'Cards left' })}>
                {props.cardsLeft}
              </Figure>
              <Figure label={t('globeset-stat-sets', { defaultValue: 'Sets' })}>
                {props.sets}
              </Figure>
            </dl>
            <button
              type="button"
              onClick={endSession}
              className="inline-flex items-center gap-1.5 rounded-full bg-site-surface px-3 py-1.5 text-sm font-medium text-site-text"
            >
              <X className="h-4 w-4" aria-hidden />
              {t('globeset-ar-exit', { defaultValue: 'Leave' })}
            </button>
          </div>

          <p className="glass-overlay mx-auto rounded-site px-4 py-2 text-center text-sm text-site-text">
            {placed
              ? t('globeset-ar-playing', {
                  defaultValue: 'Walk around the globe. Tap a card to pick it.',
                })
              : t('globeset-ar-place', {
                  defaultValue: 'Point at a surface and tap to put the globe down.',
                })}
          </p>
        </>
      )}
    </div>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[0.6rem] font-medium uppercase tracking-wide text-site-text-muted">
        {label}
      </dt>
      <dd className="font-mono text-base font-bold tabular-nums">{children}</dd>
    </div>
  );
}

/* ── Painting a card face into a texture ───────────────────────────────────
   The same card the SVG board draws, baked to a canvas because WebGL cannot
   read an SVG or a CSS custom property. The palette is sampled once per
   session from a live element (`readPalette`), so the theme and the
   colour-vision ramps still reach the room. */

function paintCard(
  canvas: HTMLCanvasElement,
  card: Card,
  options: {
    palette: { face: string; edge: string; ink: string; dots: string[] };
    shapes: boolean;
    hinted: boolean;
  },
): void {
  const w = TEX;
  const h = Math.round(TEX * (AR_CARD_HEIGHT_M / AR_CARD_WIDTH_M));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { palette, shapes, hinted } = options;
  ctx.clearRect(0, 0, w, h);

  const radius = w * 0.08;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, radius);
  ctx.fillStyle = palette.face;
  ctx.fill();
  ctx.lineWidth = hinted ? w * 0.035 : w * 0.015;
  ctx.strokeStyle = hinted ? '#e0a73a' : palette.edge;
  ctx.stroke();

  const dotR = w * AR_DOT_RADIUS;
  DOT_COLORS.forEach((dot, bit) => {
    if ((card & (1 << bit)) === 0) return;
    const slot = AR_DOT_SLOTS[bit];
    const cx = slot.x * w;
    const cy = slot.y * h;
    ctx.beginPath();
    ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
    ctx.fillStyle = palette.dots[bit];
    ctx.fill();
    ctx.lineWidth = Math.max(1, w * 0.006);
    ctx.strokeStyle = palette.ink;
    ctx.globalAlpha = 0.45;
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (shapes) drawGlyph(ctx, dot.shape, cx, cy, dotR * 0.58, palette.ink);
  });
}

function drawGlyph(
  ctx: CanvasRenderingContext2D,
  shape: (typeof DOT_COLORS)[number]['shape'],
  cx: number,
  cy: number,
  r: number,
  ink: string,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = Math.max(1, r * 0.28);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const polygon = (sides: number, rot: number, inner?: number) => {
    const points = inner ? sides * 2 : sides;
    for (let i = 0; i < points; i++) {
      const a = (Math.PI * 2 * i) / points + rot;
      const rad = inner && i % 2 === 1 ? inner : r;
      const x = Math.cos(a) * rad;
      const y = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  switch (shape) {
    case 'circle':
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      break;
    case 'triangle':
      polygon(3, -Math.PI / 2);
      break;
    case 'square':
      polygon(4, Math.PI / 4);
      break;
    case 'diamond':
      polygon(4, -Math.PI / 2);
      break;
    case 'hexagon':
      polygon(6, -Math.PI / 2);
      break;
    case 'star':
      polygon(5, -Math.PI / 2, r * 0.45);
      break;
  }
  ctx.stroke();
  ctx.restore();
}
