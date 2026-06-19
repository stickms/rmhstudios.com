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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
  onPageChange?: (label: string, k: number) => void;
};

export function BookCanvas({ aspect, single, numPages, getImg, ensurePage, onPageChange }: BookCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const turnId = useRef(0);

  // Animation/drag share one mutable progress value (0→1) read every frame, so
  // dragging and the settle animation never trigger React re-renders.
  const progress = useRef(0);
  const anim = useRef<{ active: boolean; target: number }>({ active: false, target: 0 });
  const dragging = useRef(false);
  const dragStartX = useRef(0);

  const maxK = single ? Math.max(0, numPages - 1) : Math.max(0, Math.floor(numPages / 2));
  const view = useCallback(
    (idx: number): Spread =>
      single ? { left: 0, right: idx + 1 } : { left: idx === 0 ? 0 : idx * 2, right: idx * 2 + 1 },
    [single],
  );

  // Prefetch current + neighbouring page bitmaps.
  useEffect(() => {
    for (const idx of [k - 1, k, k + 1]) {
      if (idx < 0 || idx > maxK) continue;
      const s = view(idx);
      if (s.left) ensurePage(s.left);
      if (s.right) ensurePage(s.right);
    }
  }, [k, maxK, view, ensurePage]);

  // Report the page label upward for the toolbar counter.
  useEffect(() => {
    const cur = view(k);
    const label = single
      ? `${cur.right} / ${numPages}`
      : `${cur.left || cur.right}–${Math.min(cur.right, numPages)} / ${numPages}`;
    onPageChange?.(label, k);
  }, [k, single, numPages, view, onPageChange]);

  // Build a turn descriptor and queue its bitmaps.
  const beginTurn = useCallback(
    (dir: Dir, viaDrag: boolean): boolean => {
      if (turn || anim.current.active) return false;
      const target = dir === 'next' ? k + 1 : k - 1;
      if (target < 0 || target > maxK) return false;
      const cur = view(k);
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

      progress.current = 0;
      anim.current = viaDrag ? { active: false, target: 0 } : { active: true, target: 1 };
      setTurn(t);
      return true;
    },
    [turn, k, maxK, view, single, ensurePage],
  );

  // Called by the scene when progress settles at 0 (cancelled) or 1 (completed).
  const onSettle = useCallback((reached: number) => {
    setTurn((cur) => {
      if (cur && reached >= 0.999) setK(cur.target);
      return null;
    });
    progress.current = 0;
    anim.current = { active: false, target: 0 };
  }, []);

  // ─── Pointer drag ────────────────────────────────────────────────────────────
  const dragSpan = () => {
    const w = wrapRef.current?.clientWidth ?? 800;
    return w * (single ? 0.7 : 0.42);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (turn || anim.current.active) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rightHalf = e.clientX - rect.left > rect.width / 2;
    const dir: Dir = rightHalf ? 'next' : 'prev';
    if (!beginTurn(dir, true)) return;
    dragging.current = true;
    dragStartX.current = e.clientX;
    wrapRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !turn) return;
    const dx = e.clientX - dragStartX.current;
    // Forward turns advance as you drag left; backward turns as you drag right.
    const signed = turn.dir === 'next' ? -dx : dx;
    progress.current = Math.min(1, Math.max(0, signed / dragSpan()));
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      wrapRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer may already be released */
    }
    anim.current = { active: true, target: progress.current > 0.5 ? 1 : 0 };
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

  const canPrev = k > 0 && !turn && !anim.current.active;
  const canNext = k < maxK && !turn && !anim.current.active;

  const base = turn ? { left: turn.staticLeft, right: turn.staticRight } : view(k);
  const contentW = single ? aspect : 2 * aspect;
  const contentH = 1.18;

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
          anim={anim}
          onSettle={onSettle}
        />
      </Canvas>

      <button
        type="button"
        className="lib-reader__nav lib-reader__nav--prev"
        onClick={() => beginTurn('prev', false)}
        disabled={!canPrev}
        aria-label="Previous page"
      >
        <ChevronLeft size={26} />
      </button>
      <button
        type="button"
        className="lib-reader__nav lib-reader__nav--next"
        onClick={() => beginTurn('next', false)}
        disabled={!canNext}
        aria-label="Next page"
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
  anim: React.RefObject<{ active: boolean; target: number }>;
  onSettle: (reached: number) => void;
};

function Scene({ aspect, single, contentW, contentH, base, turn, getImg, progress, anim, onSettle }: SceneProps) {
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
            frontSrc={getImg(turn.front)}
            backSrc={turn.back ? getImg(turn.back) : undefined}
            progress={progress}
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
    const zoom = Math.min(size.width / width, size.height / height) * 0.92;
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
  }, [size.width, size.height, width, height, camera]);
  return null;
}

/** A flat, unlit page plane. */
function PageMesh({ src, cx, w }: { src?: string; cx: number; w: number }) {
  const tex = usePageTexture(src);
  return (
    <mesh position={[cx, 0, 0]}>
      <planeGeometry args={[w, 1]} />
      <meshBasicMaterial map={tex ?? undefined} color={tex ? '#ffffff' : '#f1f1ee'} toneMapped={false} />
    </mesh>
  );
}

/** The turning leaf: rotates around the spine while a vertex bend curls the paper. */
function Leaf({
  turn,
  w,
  frontSrc,
  backSrc,
  progress,
  anim,
  onSettle,
}: {
  turn: Turn;
  w: number;
  frontSrc?: string;
  backSrc?: string;
  progress: React.RefObject<number>;
  anim: React.RefObject<{ active: boolean; target: number }>;
  onSettle: (reached: number) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const frontTex = usePageTexture(frontSrc);
  const backTex = usePageTexture(backSrc, true); // mirror back-face UVs

  // Shared bend uniform, driven each frame.
  const uProgress = useMemo(() => ({ value: 0 }), []);
  const planeOffset = turn.side === 'right' ? w / 2 : -w / 2;

  const frontMat = useMemo(
    () => makeLeafMaterial(frontTex, THREE.FrontSide, w, uProgress, '#fbfbf9'),
    [frontTex, w, uProgress],
  );
  const backMat = useMemo(
    () => makeLeafMaterial(backTex, THREE.BackSide, w, uProgress, '#f1efe9'),
    [backTex, w, uProgress],
  );
  useEffect(() => () => {
    frontMat.dispose();
    backMat.dispose();
  }, [frontMat, backMat]);

  useFrame((_, delta) => {
    const a = anim.current!;
    if (a.active) {
      const next = THREE.MathUtils.damp(progress.current!, a.target, 11, delta);
      progress.current = next;
      if (Math.abs(next - a.target) < 0.004) {
        progress.current = a.target;
        const reached = a.target;
        a.active = false;
        onSettle(reached);
      }
    }
    const p = progress.current!;
    uProgress.value = p;
    if (groupRef.current) groupRef.current.rotation.y = turn.rotSign * p * PI;
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
    sh.uniforms.uWidth = { value: width };
    sh.uniforms.uCurl = { value: 0.17 };
    sh.vertexShader =
      'uniform float uProgress;\nuniform float uWidth;\nuniform float uCurl;\nvarying float vShade;\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float _t = uProgress;
         float _curl = sin(_t * 3.14159265);
         float _xN = (position.x / uWidth) + 0.5;
         float _bend = sin(_xN * 3.14159265);
         transformed.z += uCurl * _curl * _bend;
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

/** Load a data-URL into a three texture (optionally mirrored for back faces). */
function usePageTexture(src?: string, mirror = false): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!src) {
      setTex(null);
      return;
    }
    let dead = false;
    let loaded: THREE.Texture | null = null;
    new THREE.TextureLoader().load(src, (t) => {
      if (dead) {
        t.dispose();
        return;
      }
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      if (mirror) {
        t.wrapS = THREE.RepeatWrapping;
        t.repeat.x = -1;
        t.offset.x = 1;
      }
      t.needsUpdate = true;
      loaded = t;
      setTex(t);
    });
    return () => {
      dead = true;
      loaded?.dispose();
    };
  }, [src, mirror]);
  return tex;
}
