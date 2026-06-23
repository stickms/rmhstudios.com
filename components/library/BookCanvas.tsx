/**
 * BookCanvas — the 3D, drag-follow page-turn stage (react-three-fiber + three).
 *
 * Renders the open book as real geometry: static left/right page planes plus a
 * "turning leaf" that rotates around the spine while a vertex bend curls the paper,
 * Apple-Books style. The turn follows the pointer/finger as you drag (release past
 * the halfway point completes the turn, otherwise it snaps back), and arrow
 * keys / on-screen arrows trigger an animated turn. Two-page spread on desktop,
 * single page on mobile.
 *
 * Page bitmaps are supplied by the parent (rendered lazily from the PDF); this
 * component only turns them into textures and animates them. Client-only — it's
 * mounted by BookReader after the PDF has loaded in the browser.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';

const PI = Math.PI;

type Dir = 'next' | 'prev';
type Spread = { left: number; right: number };

type Turn = {
  id: number;
  dir: Dir;
  target: number; // spread index to commit to
  side: 'left' | 'right';
  rotSign: 1 | -1; // direction of the leaf's rotateY
  staticLeft: number; // page numbers (0 = blank) painted under the leaf
  staticRight: number;
  front: number; // leaf front-face page
  back: number; // leaf back-face page (0 = blank paper)
};

export type BookCanvasProps = {
  aspect: number; // page width / height
  single: boolean;
  numPages: number;
  getImg: (n: number) => string | undefined;
  ensurePage: (n: number) => void;
  onPageChange?: (info: { label: string; page: number; k: number }) => void;
  /** Parent stashes a `goToPage(n)` fn here so the toolbar can jump to any page. */
  seek?: React.MutableRefObject<((page: number) => void) | null>;
};

export function BookCanvas({ aspect, single, numPages, getImg, ensurePage, onPageChange, seek }: BookCanvasProps) {
  const { t } = useTranslation("c-library");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const turnId = useRef(0);
  // Live mirrors of the committed spread and the active turn, read synchronously by
  // beginTurn so rapid clicks/keypresses chain correctly without waiting on a React
  // re-render to update the `k`/`turn` state they close over.
  const kRef = useRef(0);
  const turnRef = useRef<Turn | null>(null);
  useEffect(() => {
    kRef.current = k;
  }, [k]);

  // Animation/drag share one mutable progress value (0→1) read every frame, so
  // dragging and the settle animation never trigger React re-renders.
  const progress = useRef(0);
  const anim = useRef<{ active: boolean; target: number }>({ active: false, target: 0 });
  const dragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);
  const moved = useRef(false);
  // Vertical lean (-1..1) so the page follows the cursor up/down, not just across.
  const tilt = useRef(0);

  const maxK = single ? Math.max(0, numPages - 1) : Math.max(0, Math.floor(numPages / 2));
  const view = useCallback(
    (idx: number): Spread =>
      single ? { left: 0, right: idx + 1 } : { left: idx === 0 ? 0 : idx * 2, right: idx * 2 + 1 },
    [single],
  );

  // Prefetch a window of spreads around the current one so spam-clicking through the
  // book stays ahead of the (∼100–200ms/page) rasteriser and never flashes a blank
  // page. Forward-biased — reading advances forward — and ordered nearest-first so the
  // pages you're about to see render before the ones further out. ensurePage skips
  // anything already rendered/in-flight, so each step only rasterises the new frontier.
  useEffect(() => {
    const AHEAD = 4;
    const BEHIND = 2;
    const order = [k];
    for (let d = 1; d <= Math.max(AHEAD, BEHIND); d++) {
      if (d <= AHEAD) order.push(k + d);
      if (d <= BEHIND) order.push(k - d);
    }
    for (const idx of order) {
      if (idx < 0 || idx > maxK) continue;
      const s = view(idx);
      if (s.left) ensurePage(s.left);
      if (s.right) ensurePage(s.right);
    }
  }, [k, maxK, view, ensurePage]);

  // Report the page label + leading page number upward for the toolbar.
  useEffect(() => {
    const cur = view(k);
    const page = single ? cur.right : cur.left || cur.right;
    const label = single
      ? `${cur.right} / ${numPages}`
      : `${cur.left || cur.right}–${Math.min(cur.right, numPages)} / ${numPages}`;
    onPageChange?.({ label, page, k });
  }, [k, single, numPages, view, onPageChange]);

  // Map a 1-based page number to its spread index and jump there instantly,
  // cancelling any in-flight turn. Exposed to the parent via the `seek` ref so the
  // page-jump input and chapter dropdown can navigate.
  useEffect(() => {
    if (!seek) return;
    seek.current = (page: number) => {
      const p = Math.max(1, Math.min(numPages, Math.round(page)));
      const target = single ? p - 1 : Math.floor(p / 2);
      setTurn(null);
      turnRef.current = null;
      progress.current = 0;
      anim.current = { active: false, target: 0 };
      const tgt = Math.max(0, Math.min(maxK, target));
      kRef.current = tgt;
      setK(tgt);
    };
    return () => {
      if (seek) seek.current = null;
    };
  }, [seek, single, numPages, maxK]);

  // Build a turn descriptor and queue its bitmaps.
  const beginTurn = useCallback(
    (dir: Dir, viaDrag: boolean): boolean => {
      // Interruptible turns are what let you rip through pages: if an animated turn is
      // still settling, commit it instantly and start the next one from where it landed
      // instead of dropping the input. The spread we turn FROM:
      //  - mid-drag (turn set, anim not yet running): never interrupt — return false;
      //  - settling toward completion (anim.target ≥ 0.5): treat it as done → its target;
      //  - settling back to a cancel, or idle: the still-committed spread (kRef).
      const inFlight = turnRef.current;
      if (inFlight && !anim.current.active) return false;
      const committing = !!inFlight && anim.current.target >= 0.5;
      const fromK = committing ? inFlight!.target : kRef.current;
      const target = dir === 'next' ? fromK + 1 : fromK - 1;
      if (target < 0 || target > maxK) return false;
      const cur = view(fromK);
      const dest = view(target);
      [cur.left, cur.right, dest.left, dest.right].forEach((n) => n && ensurePage(n));

      let t: Turn;
      if (single) {
        t = {
          id: ++turnId.current,
          dir,
          target,
          side: 'right',
          rotSign: dir === 'next' ? -1 : 1,
          staticLeft: 0,
          staticRight: dest.right,
          front: cur.right,
          back: 0,
        };
      } else if (dir === 'next') {
        t = {
          id: ++turnId.current,
          dir,
          target,
          side: 'right',
          rotSign: -1,
          staticLeft: cur.left,
          staticRight: dest.right,
          front: cur.right,
          back: dest.left,
        };
      } else {
        t = {
          id: ++turnId.current,
          dir,
          target,
          side: 'left',
          rotSign: 1,
          staticLeft: dest.left,
          staticRight: cur.right,
          front: cur.left,
          back: dest.right,
        };
      }

      // Finalise the interrupted turn so the committed spread underneath is correct
      // before the fresh leaf flips off it.
      if (committing && fromK !== kRef.current) {
        kRef.current = fromK;
        setK(fromK);
      }
      turnRef.current = t;
      progress.current = 0;
      anim.current = viaDrag ? { active: false, target: 0 } : { active: true, target: 1 };
      setTurn(t);
      return true;
    },
    [maxK, view, single, ensurePage],
  );

  // Called by the scene when progress settles at 0 (cancelled) or 1 (completed).
  const onSettle = useCallback((reached: number) => {
    const t = turnRef.current;
    turnRef.current = null;
    // Commit the new spread and drop the leaf as sibling top-level setters so React
    // batches them into ONE commit. Calling setK from *inside* a setTurn updater (it
    // runs in the render phase) made it a separate render-phase update: React applied
    // `turn → null` first — a frame where the leaf is gone but `k` still points at the
    // OLD spread, so `base` painted the previous pages — then re-rendered with the new
    // `k`. r3f drew that stale in-between frame, which was the end-of-turn flicker.
    if (t && reached >= 0.999) {
      kRef.current = t.target;
      setK(t.target);
    }
    setTurn(null);
    // Pin progress at the value it settled on rather than snapping to 0. Clearing
    // `turn` only takes effect on React's next commit, so the leaf stays mounted for
    // a frame or two longer — and if we reset progress to 0 here, that lingering leaf
    // rotates flat back onto its *original* side, flashing the page you just turned
    // away from. Holding it at `reached` keeps it showing the completed (or snapped-
    // back) spread until it unmounts. The next turn's beginTurn resets progress to 0.
    progress.current = reached;
    anim.current = { active: false, target: 0 };
  }, []);

  // ─── Pointer drag ────────────────────────────────────────────────────────────
  const dragSpan = () => {
    const w = wrapRef.current?.clientWidth ?? 800;
    return w * (single ? 0.7 : 0.42);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Let the on-screen arrows (and any control) handle their own clicks — without
    // this, the wrapper would start a drag-turn on pointerdown and cancel it on
    // pointerup, swallowing the button click.
    if ((e.target as HTMLElement).closest('button, a')) return;
    if (turn || anim.current.active) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rightHalf = e.clientX - rect.left > rect.width / 2;
    const dir: Dir = rightHalf ? 'next' : 'prev';
    if (!beginTurn(dir, true)) return;
    dragging.current = true;
    moved.current = false;
    dragStartX.current = e.clientX;
    dragStartY.current = e.clientY;
    tilt.current = 0;
    wrapRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !turn) return;
    const dx = e.clientX - dragStartX.current;
    const dy = e.clientY - dragStartY.current;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) moved.current = true;
    // Forward turns advance as you drag left; backward turns as you drag right.
    const signed = turn.dir === 'next' ? -dx : dx;
    progress.current = Math.min(1, Math.max(0, signed / dragSpan()));
    // Vertical follow: drag up/down leans the page the same way (clamped).
    const h = wrapRef.current?.clientHeight ?? 600;
    tilt.current = Math.max(-1, Math.min(1, dy / (h * 0.5)));
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      wrapRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer may already be released */
    }
    // A tap (no real drag) completes the turn; a drag uses the halfway threshold.
    const target = !moved.current ? 1 : progress.current > 0.5 ? 1 : 0;
    anim.current = { active: true, target };
  };

  // ─── Keyboard ──────────────────────────────────────────────────────────────--
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') beginTurn('next', false);
      else if (e.key === 'ArrowLeft') beginTurn('prev', false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [beginTurn]);

  // Gate the arrows on the page we'll be on once the current turn lands (its target,
  // if one's in flight), not on whether an animation is running — turns are
  // interruptible, so the only reason to hide an arrow is hitting the book's edge.
  // This also stops the buttons from vanishing mid-flip.
  const effK = turn ? turn.target : k;
  const canPrev = effK > 0;
  const canNext = effK < maxK;

  const base = turn ? { left: turn.staticLeft, right: turn.staticRight } : view(k);
  const contentW = single ? aspect : 2 * aspect;
  // Fit box height = the page height exactly (1). The leaf can never exceed the page
  // rectangle vertically — it rotates around the vertical spine (no height change),
  // its ≤0.2rad vertical tilt is an x-rotation that only *foreshortens* the page
  // (top edge y = 0.5·cosθ ≤ 0.5), and the z-curl is invisible under the orthographic
  // camera. So no vertical headroom is needed: we size to the page itself so the book
  // stands as tall as the stage allows (width follows from the uniform fit zoom).
  // The stage's own padding keeps it off the viewport edge.
  const contentH = 1.0;

  return (
    <div
      ref={wrapRef}
      className="lib-canvas-wrap"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <Canvas
        flat
        orthographic
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0, 0, 6], zoom: 120, near: 0.1, far: 100 }}
      >
        <Scene
          aspect={aspect}
          single={single}
          contentW={contentW}
          contentH={contentH}
          base={base}
          turn={turn}
          getImg={getImg}
          progress={progress}
          tilt={tilt}
          anim={anim}
          onSettle={onSettle}
        />
      </Canvas>

      <button
        type="button"
        className="lib-reader__nav lib-reader__nav--prev"
        onClick={() => beginTurn('prev', false)}
        disabled={!canPrev}
        aria-label={t("previous-page", { defaultValue: "Previous page" })}
      >
        <ChevronLeft size={26} />
      </button>
      <button
        type="button"
        className="lib-reader__nav lib-reader__nav--next"
        onClick={() => beginTurn('next', false)}
        disabled={!canNext}
        aria-label={t("next-page", { defaultValue: "Next page" })}
      >
        <ChevronRight size={26} />
      </button>
    </div>
  );
}

// ─── 3D scene ──────────────────────────────────────────────────────────────────

type SceneProps = {
  aspect: number;
  single: boolean;
  contentW: number;
  contentH: number;
  base: Spread;
  turn: Turn | null;
  getImg: (n: number) => string | undefined;
  progress: React.RefObject<number>;
  tilt: React.RefObject<number>;
  anim: React.RefObject<{ active: boolean; target: number }>;
  onSettle: (reached: number) => void;
};

function Scene({ aspect, single, contentW, contentH, base, turn, getImg, progress, tilt, anim, onSettle }: SceneProps) {
  // Centre the content: a single page hinges at its left edge, so shift it so the
  // page (not the spine) is centred; a two-page spread is already centred at x=0.
  const groupX = single ? -aspect / 2 : 0;

  return (
    <>
      <Fit width={contentW} height={contentH} />
      <group position={[groupX, 0, 0]}>
        {/* Static pages painted under the turning leaf. */}
        {base.left > 0 && <PageMesh src={getImg(base.left)} cx={-aspect / 2} w={aspect} />}
        {base.right > 0 && <PageMesh src={getImg(base.right)} cx={aspect / 2} w={aspect} />}

        {turn && (
          <Leaf
            key={turn.id}
            turn={turn}
            w={aspect}
            single={single}
            frontSrc={getImg(turn.front)}
            backSrc={turn.back ? getImg(turn.back) : undefined}
            progress={progress}
            tilt={tilt}
            anim={anim}
            onSettle={onSettle}
          />
        )}
      </group>
    </>
  );
}

/** Fit the orthographic camera so the book fills the canvas with a little padding. */
function Fit({ width, height }: { width: number; height: number }) {
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    // Fit to whichever axis binds (min), filling nearly all of it — the book never
    // overflows because the chosen zoom guarantees both axes fit, and the leaf can't
    // exceed the page rectangle (see contentH). The 0.5% trim leaves a sliver for
    // antialiased edges; the stage's padding provides the actual visual margin.
    const zoom = Math.min(size.width / width, size.height / height) * 0.995;
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
  }, [size.width, size.height, width, height, camera]);
  return null;
}

/** A flat, unlit page plane. */
function PageMesh({ src, cx, w }: { src?: string; cx: number; w: number }) {
  const tex = usePageTexture(src);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  // The texture loads after the material first compiles (without a map). Adding a
  // `map` to an already-compiled material doesn't enable the USE_MAP shader path on
  // its own, so the page would stay blank — force a recompile when the texture
  // arrives. (The turning Leaf doesn't need this: its material is rebuilt from
  // scratch via useMemo whenever its texture changes.)
  useEffect(() => {
    if (matRef.current) matRef.current.needsUpdate = true;
  }, [tex]);
  return (
    <mesh position={[cx, 0, 0]}>
      <planeGeometry args={[w, 1]} />
      <meshBasicMaterial ref={matRef} map={tex ?? undefined} color={tex ? '#ffffff' : '#f1f1ee'} toneMapped={false} />
    </mesh>
  );
}

/** The turning leaf: rotates around the spine while a vertex bend curls the paper. */
function Leaf({
  turn,
  w,
  single,
  frontSrc,
  backSrc,
  progress,
  tilt,
  anim,
  onSettle,
}: {
  turn: Turn;
  w: number;
  single: boolean;
  frontSrc?: string;
  backSrc?: string;
  progress: React.RefObject<number>;
  tilt: React.RefObject<number>;
  anim: React.RefObject<{ active: boolean; target: number }>;
  onSettle: (reached: number) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const frontTex = usePageTexture(frontSrc);
  const backTex = usePageTexture(backSrc, true); // mirror back-face UVs

  // Shared bend uniforms, driven each frame.
  const uProgress = useMemo(() => ({ value: 0 }), []);
  const uTilt = useMemo(() => ({ value: 0 }), []);
  const planeOffset = turn.side === 'right' ? w / 2 : -w / 2;

  const frontMat = useMemo(
    () => makeLeafMaterial(frontTex, THREE.FrontSide, w, uProgress, uTilt, '#fbfbf9'),
    [frontTex, w, uProgress, uTilt],
  );
  const backMat = useMemo(
    () => makeLeafMaterial(backTex, THREE.BackSide, w, uProgress, uTilt, '#f1efe9'),
    [backTex, w, uProgress, uTilt],
  );
  // Only the single-page leaf's back face fades out (see useFrame); enabling
  // transparency lets its opacity take effect without changing how the opaque
  // two-page leaf — or the real page content on the front face — renders/sorts.
  backMat.transparent = single;
  useEffect(() => () => {
    frontMat.dispose();
    backMat.dispose();
  }, [frontMat, backMat]);

  useFrame((_, delta) => {
    const a = anim.current!;
    if (a.active) {
      const next = THREE.MathUtils.damp(progress.current!, a.target, 15, delta);
      progress.current = next;
      // Ease the vertical lean back to neutral as the turn settles.
      tilt.current = THREE.MathUtils.damp(tilt.current!, 0, 9, delta);
      if (Math.abs(next - a.target) < 0.004) {
        progress.current = a.target;
        const reached = a.target;
        a.active = false;
        onSettle(reached);
      }
    }
    const p = progress.current!;
    const ty = tilt.current!;
    uProgress.value = p;
    uTilt.value = ty;
    if (groupRef.current) {
      groupRef.current.rotation.y = turn.rotSign * p * PI;
      // Lean the whole leaf toward the cursor vertically; fade the lean out as the
      // page reaches the closed/open extremes so it never looks broken. This is an
      // x-rotation, so it only foreshortens the page (never lifts a corner past the
      // page's top/bottom edge) — safe even with the book sized flush to the stage.
      groupRef.current.rotation.x = ty * 0.2 * Math.sin(p * PI);
    }
    // In single-page mode the leaf's back is blank paper (there's no facing page), so
    // it would sit as a blank sheet beside the page and then pop out of existence when
    // the turn commits. The back face only becomes visible past the halfway point, so
    // fade it from there to fully gone — it dissolves away instead of snapping.
    backMat.opacity = single ? THREE.MathUtils.clamp((1 - p) / 0.5, 0, 1) : 1;
  });

  return (
    <group ref={groupRef} position={[0, 0, 0.002]}>
      <mesh position={[planeOffset, 0, 0]} material={frontMat}>
        <planeGeometry args={[w, 1, 48, 1]} />
      </mesh>
      <mesh position={[planeOffset, 0, 0]} material={backMat}>
        <planeGeometry args={[w, 1, 48, 1]} />
      </mesh>
    </group>
  );
}

/**
 * An unlit page material whose vertices bend (curl) with `uProgress`, with a faint
 * shade in the curl so the fold reads in 3D. Built on MeshBasicMaterial so three's
 * colour management still applies to the page texture.
 */
function makeLeafMaterial(
  map: THREE.Texture | null,
  side: THREE.Side,
  width: number,
  uProgress: { value: number },
  uTilt: { value: number },
  blank: string,
): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({
    map: map ?? null,
    color: map ? '#ffffff' : blank,
    side,
    toneMapped: false,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uProgress = uProgress;
    sh.uniforms.uTilt = uTilt;
    sh.uniforms.uWidth = { value: width };
    sh.uniforms.uCurl = { value: 0.17 };
    sh.vertexShader =
      'uniform float uProgress;\nuniform float uTilt;\nuniform float uWidth;\nuniform float uCurl;\nvarying float vShade;\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float _t = uProgress;
         float _curl = sin(_t * 3.14159265);
         float _xN = (position.x / uWidth) + 0.5;
         float _bend = sin(_xN * 3.14159265);
         // Diagonal corner curl: bias the bend toward the dragged corner (uTilt)
         // so the fold follows the cursor in 2D rather than a flat horizontal hinge.
         float _corner = 1.0 + uTilt * position.y * 2.2;
         transformed.z += uCurl * _curl * _bend * _corner;
         vShade = 1.0 - 0.32 * _curl * _bend;`,
      );
    sh.fragmentShader =
      'varying float vShade;\n' +
      sh.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         gl_FragColor.rgb *= vShade;`,
      );
  };
  return m;
}

// ─── Page-texture cache ──────────────────────────────────────────────────────--
// Decoded GPU textures are cached and shared across meshes, keyed by image src (+
// a flag for the mirrored back-face variant). This is what keeps a page turn from
// "snapping": when the leaf settles and the spread swaps, the new static pages find
// their textures already uploaded in the cache and render on the same frame, rather
// than each mesh re-decoding its image asynchronously (which shows the old spread
// for a beat, then pops). Bounded so a long read can't grow GPU memory without limit.
const TEX_CACHE_CAP = 16;
const texCache = new Map<string, THREE.Texture>();
const texLoading = new Map<string, Promise<THREE.Texture>>();

function texKey(src: string, mirror: boolean): string {
  return mirror ? `${src}|m` : src;
}

function loadPageTexture(src: string, mirror: boolean): Promise<THREE.Texture> {
  const key = texKey(src, mirror);
  const hit = texCache.get(key);
  if (hit) return Promise.resolve(hit);
  let pending = texLoading.get(key);
  if (!pending) {
    pending = new Promise<THREE.Texture>((resolve, reject) => {
      new THREE.TextureLoader().load(
        src,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 4;
          // The rasterised pages are non-power-of-two; mipmap min-filters force a
          // (costly, and on some drivers broken → blank) mipmap chain. Plain linear
          // filtering needs no mipmaps and renders the page reliably.
          t.minFilter = THREE.LinearFilter;
          t.magFilter = THREE.LinearFilter;
          t.generateMipmaps = false;
          if (mirror) {
            t.wrapS = THREE.RepeatWrapping;
            t.repeat.x = -1;
            t.offset.x = 1;
          }
          t.needsUpdate = true;
          texLoading.delete(key);
          texCache.set(key, t);
          // Evict the oldest entries past the cap. The current spread + leaf use only
          // a handful of textures, so anything this old is safely off-screen.
          while (texCache.size > TEX_CACHE_CAP) {
            const oldest = texCache.keys().next().value as string | undefined;
            if (oldest === undefined) break;
            texCache.get(oldest)?.dispose();
            texCache.delete(oldest);
          }
          resolve(t);
        },
        undefined,
        (err) => {
          texLoading.delete(key);
          reject(err instanceof Error ? err : new Error(String(err)));
        },
      );
    });
    texLoading.set(key, pending);
  }
  return pending;
}

/** Decode `src` into the shared cache ahead of time (best-effort, fire-and-forget). */
export function warmPageTexture(src?: string, mirror = false): void {
  if (src) void loadPageTexture(src, mirror).catch(() => {});
}

/** Resolve a page texture, returning a cached one synchronously when available. */
function usePageTexture(src?: string, mirror = false): THREE.Texture | null {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const key = src ? texKey(src, mirror) : '';
  useEffect(() => {
    if (!src || texCache.has(key)) return;
    let dead = false;
    void loadPageTexture(src, mirror).then(() => {
      if (!dead) bump();
    });
    return () => {
      dead = true;
    };
  }, [src, key, mirror]);
  return src && texCache.has(key) ? texCache.get(key)! : null;
}
