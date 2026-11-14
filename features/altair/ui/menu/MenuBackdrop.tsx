/**
 * MenuBackdrop — the Outpost 13 corridor behind the main menu.
 *
 * A low-resolution canvas the pure renderer in `features/altair/engine/menu/corridor-scene.ts`
 * draws into, scaled up with `image-rendering: pixelated`. The internal buffer is
 * fixed per layout (never reallocated per frame): its short side is 180 px and its
 * long side follows the container's aspect, so a phone and a desktop both get true
 * pixel art. ~2 ms a frame at 30 fps.
 *
 * Loop bounds (lib/__tests__/raf-loop-allowlist.test.ts): the frame is requested only
 * while the component is mounted AND the tab is visible. Unmount cancels it; a hidden
 * tab cancels it and `visibilitychange` restarts it. The CSS corridor underneath is the
 * pre-hydration / no-canvas fallback and is removed once the first frame is painted so
 * its keyframes stop running behind the canvas.
 */

import {
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  createCorridorScene,
  renderCorridor,
  type CorridorScene,
} from '@features/altair/engine/menu/corridor-scene';

const FRAME_MS =
  1000 /
  30;
const SHORT_SIDE = 180;
const LONG_SIDE_MAX = 400;

/** Buffer size for a container: short side fixed, long side follows its aspect. */
export function bufferSizeFor(
  cssWidth: number,
  cssHeight: number,
): {
  w: number;
  h: number;
} {
  const aspect =
    cssWidth >
      0 &&
    cssHeight >
      0
      ? cssWidth /
        cssHeight
      : 16 /
        9;
  if (
    aspect >=
    1
  )
    return {
      w: Math.min(
        LONG_SIDE_MAX,
        Math.round(
          SHORT_SIDE *
            aspect,
        ),
      ),
      h: SHORT_SIDE,
    };
  return {
    w: SHORT_SIDE,
    h: Math.min(
      LONG_SIDE_MAX,
      Math.round(
        SHORT_SIDE /
          aspect,
      ),
    ),
  };
}

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

    let scene: CorridorScene | null =
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
        scene =
          createCorridorScene(
            w,
            h,
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
          now -
            last >=
          FRAME_MS
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
          renderCorridor(
            scene,
            (now -
              origin) /
              1000,
            pointer.x,
            pointer.y,
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

    return () => {
      stop();
      observer?.disconnect();
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
      className="altair-corridor"
      aria-hidden="true"
    >
      {!ready && (
        <>
          <div className="altair-corridor__frames">
            <span className="altair-corridor__frame" />
            <span className="altair-corridor__frame" />
            <span className="altair-corridor__frame" />
            <span className="altair-corridor__frame" />
            <span className="altair-corridor__frame" />
            <span className="altair-corridor__frame" />
          </div>
          <span className="altair-corridor__lamp altair-corridor__lamp--l" />
          <span className="altair-corridor__lamp altair-corridor__lamp--r" />
        </>
      )}
      <canvas
        ref={
          canvasRef
        }
        className="altair-corridor__canvas"
        data-ready={
          ready
            ? 'true'
            : undefined
        }
      />
    </div>
  );
}
