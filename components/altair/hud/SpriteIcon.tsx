/**
 * SpriteIcon — Renders a single frame from a sprite sheet on a mini canvas.
 * Used in React/HTML UI (HUD, level-up, class select) where the main
 * game canvas drawSprite() helpers are not available.
 */
'use client';

import { useRef, useEffect, memo } from 'react';

interface SpriteIconProps {
  sheetSrc: string;
  frameIndex: number;
  frameWidth?: number;
  frameHeight?: number;
  size: number;
  className?: string;
}

const SpriteIcon = memo(function SpriteIcon({
  sheetSrc,
  frameIndex,
  frameWidth = 16,
  frameHeight = 16,
  size,
  className,
}: SpriteIconProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      const cols = Math.floor(img.naturalWidth / frameWidth) || 1;
      const col = frameIndex % cols;
      const row = Math.floor(frameIndex / cols);
      const sx = col * frameWidth;
      const sy = row * frameHeight;

      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, sx, sy, frameWidth, frameHeight, 0, 0, size, size);
    };
    img.src = sheetSrc;
  }, [sheetSrc, frameIndex, frameWidth, frameHeight, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={className}
      style={{ imageRendering: 'pixelated', width: size, height: size }}
    />
  );
});

export default SpriteIcon;
