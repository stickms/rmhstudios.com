/**
 * The texture a war-painted weapon is drawn with, for a kit's script at a wear level and seed. Built in a
 * worker, so the preview keeps moving while it is drawn; `null` until it is ready (and when the kit has
 * not been synced), in which case the weapon keeps its own texture.
 */
'use client';

import { useEffect, useState } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { renderWarPaint } from '@/lib/tf2-loadout/warpaint-client';

export function useWarPaintTexture(
  script: string | undefined,
  wear: number,
  seed: number,
): CanvasTexture | null {
  const [texture, setTexture] = useState<CanvasTexture | null>(null);

  useEffect(() => {
    if (!script) {
      setTexture(null);
      return undefined;
    }
    let alive = true;
    // Dragging the seed fires a lot of changes; the worker only ever keeps the latest.
    const timer = setTimeout(() => {
      void renderWarPaint(script, wear, seed).then((res) => {
        if (!alive || !res) return;
        const canvas = document.createElement('canvas');
        canvas.width = res.w;
        canvas.height = res.h;
        canvas
          .getContext('2d')
          ?.putImageData(
            new ImageData(res.rgba as Uint8ClampedArray<ArrayBuffer>, res.w, res.h),
            0,
            0,
          );
        const tex = new CanvasTexture(canvas);
        tex.colorSpace = SRGBColorSpace;
        tex.flipY = false; // glTF's UV origin is the top left, like the image
        tex.anisotropy = 4;
        setTexture((old) => {
          old?.dispose();
          return tex;
        });
      });
    }, 120);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [script, wear, seed]);

  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}
