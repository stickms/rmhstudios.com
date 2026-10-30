/**
 * Paints a menu scene (the HUD editor's painter, lib/tf2-hud/scene/paint.ts) on a canvas of the given
 * CSS size, and again when a texture it names arrives — no frame loop. Decoration only: the menus lay
 * real buttons over it.
 */
'use client';

import { useEffect, useLayoutEffect, useReducer, useRef, type CSSProperties } from 'react';
import { gameSurfaceDpr } from '@/lib/display-scale';
import type { ImageStore } from '@/lib/tf2-hud/assets/images';
import { paintScene } from '@/lib/tf2-hud/scene/paint';
import type { Scene } from '@/lib/tf2-hud/scene/types';

export default function MenuCanvas({
  scene,
  images,
  listeners,
  width,
  height,
  className,
  style,
}: {
  scene: Scene;
  images: ImageStore;
  listeners: Set<() => void>;
  width: number;
  height: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [arrived, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, [listeners]);
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = gameSurfaceDpr(window);
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Run-time content (3D models, avatars) is drawn by the page, and missing textures draw nothing.
    paintScene(g, scene, { images, skipDynamic: () => true, hideMissing: true });
  }, [scene, images, width, height, arrived]);
  return <canvas ref={ref} className={className} style={{ width, height, ...style }} aria-hidden="true" />;
}
