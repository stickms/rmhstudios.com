import * as THREE from 'three';

// A reusable radial-gradient sprite texture used for cheap, optimized "bloom"
// halos, candle flames and click sparks — generated at runtime so there is no
// network asset dependency.
let cached: THREE.CanvasTexture | null = null;

export function getGlowTexture(): THREE.CanvasTexture {
  if (cached) return cached;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,238,188,0.9)');
  g.addColorStop(0.5, 'rgba(255,196,90,0.35)');
  g.addColorStop(1.0, 'rgba(255,196,90,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cached = tex;
  return tex;
}
