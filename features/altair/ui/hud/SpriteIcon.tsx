/**
 * SpriteIcon — Renders a single frame from a sprite sheet on a mini canvas.
 * Used in React/HTML UI (HUD, level-up, class select) where the main
 * game canvas drawSprite() helpers are not available.
 */

import {
  useRef,
  useEffect,
  memo,
} from 'react';
import { loadCorsImage } from '@features/altair/engine/engine/sprites/cors-image';

interface SpriteIconProps {
  sheetSrc: string;
  frameIndex: number;
  frameWidth?: number;
  frameHeight?: number;
  size: number;
  className?: string;
}

const SpriteIcon =
  memo(
    function SpriteIcon({
      sheetSrc,
      frameIndex,
      frameWidth = 16,
      frameHeight = 16,
      size,
      className,
    }: SpriteIconProps) {
      const canvasRef =
        useRef<HTMLCanvasElement>(
          null,
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
          );
        if (
          !ctx
        )
          return;

        const img =
          new Image();
        // Same CORS-mode request as the engine's, so one CDN URL is only ever fetched one way.
        loadCorsImage(
          img,
          sheetSrc,
          () => {
            const cols =
              Math.floor(
                img.naturalWidth /
                  frameWidth,
              ) ||
              1;
            const col =
              frameIndex %
              cols;
            const row =
              Math.floor(
                frameIndex /
                  cols,
              );
            const sx =
              col *
              frameWidth;
            const sy =
              row *
              frameHeight;

            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(
              0,
              0,
              size,
              size,
            );
            ctx.drawImage(
              img,
              sx,
              sy,
              frameWidth,
              frameHeight,
              0,
              0,
              size,
              size,
            );
          },
        );
      }, [
        sheetSrc,
        frameIndex,
        frameWidth,
        frameHeight,
        size,
      ]);

      return (
        <canvas
          ref={
            canvasRef
          }
          width={
            size
          }
          height={
            size
          }
          className={
            className
          }
          style={{
            imageRendering:
              'pixelated',
            width:
              size,
            height:
              size,
          }}
        />
      );
    },
  );

export default SpriteIcon;
