/**
 * MenuBackdrop — the rain-soaked 1997 Hong Kong street behind the Kowloon Knockout menus.
 *
 * A low-resolution canvas the pure renderer in `lib/kowloon-knockout/menu/street-scene.ts`
 * draws into, scaled up with `image-rendering: pixelated`. The internal buffer is fixed per
 * layout (never reallocated per frame): its short side is 180 px and its long side follows the
 * container's aspect, so a phone held upright and a desktop both get true pixel art.
 *
 * Loop bounds (lib/__tests__/raf-loop-allowlist.test.ts): the frame is requested only while the
 * component is mounted AND the tab is visible AND the user has not asked for stillness. Unmount
 * cancels it; a hidden tab cancels it and `visibilitychange` restarts it; `data-jelly-motion="still"`
 * (Appearance → Jelly motion) draws one frame and stops, and switching back restarts the loop.
 * It runs at 30 fps, or 15 fps when the graphics preference is Low. The CSS gradient underneath is
 * the pre-hydration / no-canvas fallback and is removed once the first frame is painted.
 */

import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
} from 'react';
import { motionStill } from '@/lib/appearance/prefs';
import { useGraphicsStore } from '@/lib/kowloon-knockout/render/graphicsStore';
import {
  STILL_TIME,
  bufferSizeFor,
  createStreetScene,
  renderStreet,
  type StreetScene,
} from '@/lib/kowloon-knockout/menu/street-scene';
import { readMenuShake } from '@/lib/kowloon-knockout/menu/menuShake';
import './kk-backdrop.css';

// The 3D duel (three.js + the model loaders) is its own chunk: the menu paints the street first.
const MenuFighters3D =
  lazy(
    () =>
      import('@/components/kowloon-knockout/MenuFighters3D'),
  );

export { bufferSizeFor };

const FRAME_MS =
  1000 /
  30;
const FRAME_MS_LOW =
  1000 /
  15;

export default function MenuBackdrop() {
  const canvasRef =
    useRef<HTMLCanvasElement>(
      null,
    );
  const [
    ready,
    setReady,
  ] =
    useState(
      false,
    );

  useEffect(() => {
    const canvas =
      canvasRef.current;
    if (
      !canvas
    )
      return;
    const ctx =
      canvas.getContext(
        '2d',
        {
          alpha: false,
        },
      );
    if (
      !ctx
    )
      return;

    let scene: StreetScene | null =
      null;
    let image: ImageData | null =
      null;
    let raf = 0;
    let last = 0;
    let painted = false;
    const origin =
      performance.now();
    const pointer =
      {
        x: 0,
        y: 0,
        tx: 0,
        ty: 0,
      };

    const paint =
      (
        t: number,
      ) => {
        if (
          !scene ||
          !image
        )
          return;
        // A blow in the 3D duel shakes the street with it (menuShake.ts: read from the clock, no timers of its own).
        renderStreet(
          scene,
          t,
          pointer.x,
          pointer.y,
          readMenuShake(
            performance.now(),
          ),
        );
        ctx.putImageData(
          image,
          0,
          0,
        );
        if (
          !painted
        ) {
          painted = true;
          setReady(
            true,
          );
        }
      };

    const layout =
      () => {
        const rect =
          canvas.getBoundingClientRect();
        const {
          w,
          h,
        } =
          bufferSizeFor(
            rect.width,
            rect.height,
          );
        if (
          scene &&
          scene.width ===
            w &&
          scene.height ===
            h
        )
          return;
        canvas.width =
          w;
        canvas.height =
          h;
        // The street's own pixel fighters are retired: two real 3D characters spar on it (MenuFighters3D).
        scene =
          createStreetScene(
            w,
            h,
            {
              cast: false,
            },
          );
        image =
          new ImageData(
            new Uint8ClampedArray(
              scene
                .buf
                .buffer,
            ),
            w,
            h,
          );
        // A layout change while still: redraw the one frame at the new size.
        if (
          motionStill()
        )
          paint(
            STILL_TIME,
          );
      };

    const frame =
      (
        now: number,
      ) => {
        raf = 0;
        if (
          document.hidden ||
          !scene ||
          !image
        )
          return;
        if (
          motionStill()
        ) {
          paint(
            STILL_TIME,
          );
          return;
        }
        const interval =
          useGraphicsStore.getState()
            .preference ===
          'low'
            ? FRAME_MS_LOW
            : FRAME_MS;
        if (
          now -
            last >=
          interval
        ) {
          last =
            now;
          pointer.x +=
            (pointer.tx -
              pointer.x) *
            0.06;
          pointer.y +=
            (pointer.ty -
              pointer.y) *
            0.06;
          paint(
            (now -
              origin) /
              1000,
          );
        }
        raf =
          requestAnimationFrame(
            frame,
          );
      };

    const start =
      () => {
        if (
          raf ===
            0 &&
          !document.hidden
        )
          raf =
            requestAnimationFrame(
              frame,
            );
      };
    const stop =
      () => {
        if (
          raf !==
          0
        )
          cancelAnimationFrame(
            raf,
          );
        raf = 0;
      };
    const onVisibility =
      () =>
        document.hidden
          ? stop()
          : start();
    const onPointer =
      (
        e: PointerEvent,
      ) => {
        pointer.tx =
          (e.clientX /
            window.innerWidth) *
            2 -
          1;
        pointer.ty =
          (e.clientY /
            window.innerHeight) *
            2 -
          1;
      };
    // Appearance → Jelly motion flips this attribute: Still stops the loop on one frame; any other
    // level starts it again.
    const onMotion =
      () => {
        stop();
        start();
      };

    layout();
    start();
    document.addEventListener(
      'visibilitychange',
      onVisibility,
    );
    window.addEventListener(
      'pointermove',
      onPointer,
      {
        passive: true,
      },
    );
    const observer =
      typeof ResizeObserver !==
      'undefined'
        ? new ResizeObserver(
            layout,
          )
        : null;
    observer?.observe(
      canvas,
    );
    const motionObserver =
      typeof MutationObserver !==
      'undefined'
        ? new MutationObserver(
            onMotion,
          )
        : null;
    motionObserver?.observe(
      document.documentElement,
      {
        attributes: true,
        attributeFilter:
          [
            'data-jelly-motion',
          ],
      },
    );

    return () => {
      stop();
      observer?.disconnect();
      motionObserver?.disconnect();
      document.removeEventListener(
        'visibilitychange',
        onVisibility,
      );
      window.removeEventListener(
        'pointermove',
        onPointer,
      );
    };
  }, []);

  return (
    <div
      className="kk-scene"
      aria-hidden="true"
    >
      {!ready && (
        <span className="kk-scene__fallback" />
      )}
      <canvas
        ref={
          canvasRef
        }
        className="kk-scene__canvas"
        data-ready={
          ready
            ? 'true'
            : undefined
        }
      />
      {ready && (
        <Suspense
          fallback={
            null
          }
        >
          <MenuFighters3D className="kk-scene__duel" />
        </Suspense>
      )}
      <span className="kk-scene__scrim" />
    </div>
  );
}
