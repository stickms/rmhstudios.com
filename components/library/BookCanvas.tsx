/**
 * BookCanvas — the 3D, drag-follow page-turn stage (react-three-fiber + three).
 *
 * Renders the open book as real geometry: static left/right page planes plus a
 * "turning leaf" that rotates around the spine while a vertex bend curls the paper,
 * Apple-Books style. The turn follows the pointer/finger as you drag (release past
 * the halfway point completes the turn, otherwise it snaps back), and arrow
 * keys / on-screen arrows / a hold-to-flip repeat trigger an animated turn. Two-page
 * spread on desktop, single page on mobile.
 *
 * Page textures are supplied ready-to-draw by the parent's PageStore via `getTex`:
 * they are already-decoded GPU textures, so this component never waits on an async
 * image decode at draw time — which is what lets a turn settle without the
 * end-of-flip flash the old (data-URL → TextureLoader) path suffered. Client-only —
 * mounted by BookReader after the PDF has loaded in the browser.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  /** Best-available, already-decoded texture for a 1-based page (or undefined). */
  getTex: (n: number) => THREE.Texture | undefined;
  ensurePage: (n: number) => void;
  /** Scales the canvas surface; enlarged pages remain scrollable in the stage. */
  zoom?: number;
  onPageChange?: (info: { label: string; page: number; k: number }) => void;
  /** Parent stashes a `goToPage(n)` fn here so the toolbar can jump to any page. */
  seek?: React.MutableRefObject<((page: number) => void) | null>;
};

export function BookCanvas({ aspect, single, numPages, getTex, ensurePage, zoom = 1, onPageChange, seek }: BookCanvasProps) {
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
  useLayoutEffect(() => {
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
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdDelay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdFired = useRef(false);
  const stopHold = useCallback(() => {
    if (holdTimer.current) {
      clearInterval(holdTimer.current);
      holdTimer.current = null;
    }
    if (holdDelay.current) {
      clearTimeout(holdDelay.current);
      holdDelay.current = null;
    }
  }, []);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  const maxK = single ? Math.max(0, numPages - 1) : Math.max(0, Math.floor(numPages / 2));
  const view = useCallback(
    (idx: number): Spread =>
      single ? { left: 0, right: idx + 1 } : { left: idx === 0 ? 0 : idx * 2, right: idx * 2 + 1 },
    [single],
  );

  // `k` is a page index in single mode and a spread index in book mode. Preserve
  // the actual leading page when a resize or device rotation changes the layout.
  const previousSingle = useRef(single);
  useLayoutEffect(() => {
    if (previousSingle.current === single) return;
    const logicalPage = previousSingle.current
      ? kRef.current + 1
      : (kRef.current === 0 ? 1 : kRef.current * 2);
    const nextK = single ? logicalPage - 1 : Math.floor(logicalPage / 2);
    const clamped = Math.max(0, Math.min(maxK, nextK));
    kRef.current = clamped;
    setK(clamped);
    setTurn(null);
    turnRef.current = null;
    progress.current = 0;
    anim.current = { active: false, target: 0 };
    dragging.current = false;
    moved.current = false;
    tilt.current = 0;
    stopHold();
    previousSingle.current = single;
  }, [maxK, single, stopHold]);

  // Prefetch a window of spreads around the current one so spam-clicking through the
  // book stays ahead of the rasteriser and never flashes a blank page. Forward-biased
  // — reading advances forward — and ordered nearest-first so the pages you're about to
  // see render before the ones further out. ensurePage skips anything already
  // rendered/in-flight, so each step only rasterises the new frontier.
  useEffect(() => {
    const AHEAD = 5;
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
  // page-jump input, chapter menu, bookmarks and the scrubber can all navigate.
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
      if (reducedMotion) {
        kRef.current = target;
        setK(target);
        turnRef.current = null;
        setTurn(null);
        anim.current = { active: false, target: 0 };
        return true;
      }
      anim.current = viaDrag ? { active: false, target: 0 } : { active: true, target: 1 };
      setTurn(t);
      return true;
    },
    [maxK, view, single, ensurePage, reducedMotion],
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
    if ((e.target as HTMLElement).closest('button, a, input')) return;
    if (turn || anim.current.active) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rightHalf = e.clientX - rect.left > rect.width / 2;
    const dir: Dir = rightHalf ? 'next' : 'prev';
    if (reducedMotion) {
      beginTurn(dir, false);
      return;
    }
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

  // ─── Keyboard + hold-to-flip ─────────────────────────────────────────────────
  // Arrow keys turn a page; the browser's own key-repeat (held arrow) chains turns,
  // and because turns are interruptible the flips stay smooth at any repeat rate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable || target?.closest('input, textarea, select, [role="menu"], [role="listbox"], [role="dialog"]')) return;
      const turned = e.key === 'ArrowRight'
        ? beginTurn('next', false)
        : e.key === 'ArrowLeft'
          ? beginTurn('prev', false)
          : false;
      if (turned) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [beginTurn]);

  // Press-and-hold an on-screen arrow to flip continuously. A click turns exactly
  // one page; only after holding past a short cooldown does it auto-repeat so you
  // can rip through pages without machine-gunning the button.
  const HOLD_DELAY = 500; // ms held before auto-repeat begins
  const HOLD_EVERY = 320; // ms between auto-repeated turns
  // pointerdown only *arms* the repeat — the first turn comes from onClick, so a
  // tap never double-fires. The cooldown gives a deliberate pause before speed-up.
  const startHold = useCallback(
    (dir: Dir) => {
      stopHold();
      holdFired.current = false;
      holdDelay.current = setTimeout(() => {
        holdFired.current = true;
        beginTurn(dir, false);
        holdTimer.current = setInterval(() => {
          if (!beginTurn(dir, false)) stopHold();
        }, HOLD_EVERY);
      }, HOLD_DELAY);
    },
    [beginTurn, stopHold],
  );
  // A click turns one page — unless a hold already auto-repeated, in which case the
  // trailing click that fires on release is swallowed so the page count stays right.
  const navClick = useCallback(
    (dir: Dir) => {
      if (holdFired.current) {
        holdFired.current = false;
        return;
      }
      beginTurn(dir, false);
    },
    [beginTurn],
  );
  useEffect(() => stopHold, [stopHold]);

  // Gate the arrows on the page we'll be on once the current turn lands (its target,
  // if one's in flight), not on whether an animation is running — turns are
  // interruptible, so the only reason to hide an arrow is hitting the book's edge.
  const effK = turn ? turn.target : k;
  const canPrev = effK > 0;
  const canNext = effK < maxK;

  const base = turn ? { left: turn.staticLeft, right: turn.staticRight } : view(k);
  const contentW = single ? aspect : 2 * aspect;
  // Fit box height = the page height exactly (1). The leaf can never exceed the page
  // rectangle vertically — it rotates around the vertical spine (no height change),
  // its ≤0.2rad vertical tilt is an x-rotation that only *foreshortens* the page, and
  // the z-curl is invisible under the orthographic camera. So no vertical headroom is
  // needed: we size to the page itself so the book stands as tall as the stage allows.
  const contentH = 1.0;

  return (
    <div
      ref={wrapRef}
      className="lib-canvas-wrap"
      style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <Canvas
        flat
        orthographic
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, 6], zoom: 120, near: 0.1, far: 100 }}
      >
        <Scene
          aspect={aspect}
          single={single}
          contentW={contentW}
          contentH={contentH}
          base={base}
          turn={turn}
          getTex={getTex}
          progress={progress}
          tilt={tilt}
          anim={anim}
          onSettle={onSettle}
        />
      </Canvas>

      <button
        type="button"
        className="lib-reader__nav lib-reader__nav--prev"
        onClick={() => navClick('prev')}
        onPointerDown={(e) => {
          e.preventDefault();
          startHold('prev');
        }}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        disabled={!canPrev}
        aria-label={t("previous-page", { defaultValue: "Previous page" })}
      >
        <ChevronLeft size={26} />
      </button>
      <button
        type="button"
        className="lib-reader__nav lib-reader__nav--next"
        onClick={() => navClick('next')}
        onPointerDown={(e) => {
          e.preventDefault();
          startHold('next');
        }}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
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
  getTex: (n: number) => THREE.Texture | undefined;
  progress: React.RefObject<number>;
  tilt: React.RefObject<number>;
  anim: React.RefObject<{ active: boolean; target: number }>;
  onSettle: (reached: number) => void;
};

function Scene({ aspect, single, contentW, contentH, base, turn, getTex, progress, tilt, anim, onSettle }: SceneProps) {
  // Centre the content: a single page hinges at its left edge, so shift it so the
  // page (not the spine) is centred; a two-page spread is already centred at x=0.
  const groupX = single ? -aspect / 2 : 0;

  return (
    <>
      <Fit width={contentW} height={contentH} />
      <group position={[groupX, 0, 0]}>
        {/* Static pages painted under the turning leaf. */}
        {base.left > 0 && <PageMesh tex={getTex(base.left)} cx={-aspect / 2} w={aspect} />}
        {base.right > 0 && <PageMesh tex={getTex(base.right)} cx={aspect / 2} w={aspect} />}

        {turn && (
          <Leaf
            key={turn.id}
            turn={turn}
            w={aspect}
            single={single}
            frontTex={getTex(turn.front)}
            backTex={turn.back ? getTex(turn.back) : undefined}
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
    // Fit to whichever axis binds (min), filling nearly all of it. The 0.5% trim
    // leaves a sliver for antialiased edges; the stage's padding provides the margin.
    const zoom = Math.min(size.width / width, size.height / height) * 0.995;
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
  }, [size.width, size.height, width, height, camera]);
  return null;
}

/** A flat, unlit page plane. */
function PageMesh({ tex, cx, w }: { tex?: THREE.Texture; cx: number; w: number }) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  // A material first compiled without a `map` won't enable the USE_MAP shader path
  // just because a map is later assigned — force a recompile when the texture arrives
  // so the page stops showing the blank fallback colour.
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
  frontTex,
  backTex,
  progress,
  tilt,
  anim,
  onSettle,
}: {
  turn: Turn;
  w: number;
  single: boolean;
  frontTex?: THREE.Texture;
  backTex?: THREE.Texture;
  progress: React.RefObject<number>;
  tilt: React.RefObject<number>;
  anim: React.RefObject<{ active: boolean; target: number }>;
  onSettle: (reached: number) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);

  // Shared bend uniforms, driven each frame.
  const uProgress = useMemo(() => ({ value: 0 }), []);
  const uTilt = useMemo(() => ({ value: 0 }), []);
  const planeOffset = turn.side === 'right' ? w / 2 : -w / 2;

  // Front face draws the store's texture directly. The back face needs the page
  // mirrored (it's seen from behind), so we clone the shared texture — a clone shares
  // the same GPU image but carries its own UV transform — and flip it horizontally.
  // The clone is ours to dispose; the store-owned front texture is never disposed here.
  const frontMat = useMemo(
    () => makeLeafMaterial(frontTex ?? null, THREE.FrontSide, w, uProgress, uTilt, '#fbfbf9'),
    [frontTex, w, uProgress, uTilt],
  );
  const backMat = useMemo(() => {
    let map: THREE.Texture | null = null;
    if (backTex) {
      map = backTex.clone();
      map.wrapS = THREE.RepeatWrapping;
      map.repeat.x = -1;
      map.offset.x = 1;
      map.needsUpdate = true;
    }
    return makeLeafMaterial(map, THREE.BackSide, w, uProgress, uTilt, '#f1efe9');
  }, [backTex, w, uProgress, uTilt]);
  // Only the single-page leaf's back face fades out (see useFrame); enabling
  // transparency lets its opacity take effect without changing how the opaque
  // two-page leaf — or the real page content on the front face — renders/sorts.
  backMat.transparent = single;
  useEffect(
    () => () => {
      frontMat.dispose(); // material only — its map belongs to the PageStore
      backMat.map?.dispose(); // our mirrored clone — safe to dispose
      backMat.dispose();
    },
    [frontMat, backMat],
  );

  useFrame((_, delta) => {
    const a = anim.current!;
    if (a.active) {
      // λ≈11 makes the turn settle a touch slower than before, so a tapped/keyed
      // flip reads as a smooth sweep rather than a snap.
      const next = THREE.MathUtils.damp(progress.current!, a.target, 11, delta);
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
      // Lean the whole leaf toward the cursor vertically; fade the lean out at the
      // closed/open extremes so it never looks broken. An x-rotation only foreshortens.
      groupRef.current.rotation.x = ty * 0.2 * Math.sin(p * PI);
    }
    // In single-page mode the leaf's back is blank paper (there's no facing page), so
    // it would pop out of existence when the turn commits. The back only becomes
    // visible past halfway, so fade it from there to gone — it dissolves, never snaps.
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
