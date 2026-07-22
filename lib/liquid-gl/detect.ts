/**
 * Tier detection for the liquid layer (§16.1.4).
 *
 * WebGPU → WebGL2 → none. The GL layer is a *replacement* for the CSS/SVG aurora
 * + goo, so every degradation that already kills those (perf-lite,
 * reduced-motion, high-contrast, reduce-transparency) forces `'none'` here too —
 * the untouched CSS/SVG stack is the fallback tier and stays visually identical
 * to today when GL is off. We never *upgrade* those users onto the canvas.
 *
 * Pure feature/flag reads — no canvas is created here (index.ts probes the actual
 * context lazily). WebGPU only reports available when `navigator.gpu` exists AND
 * an adapter resolves, so the async form is the source of truth for that tier.
 */

import type { LiquidTier } from './types';
import { preferredTierOrder } from './trust';

/** Ordered backend candidates, with policy/accessibility gates applied. */
export function liquidTierCandidates(): ('webgpu' | 'webgl2')[] {
  if (liquidGlBlocked()) return [];
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return preferredTierOrder(ua);
}

/** True when any accessibility/perf gate forbids the shader layer entirely. */
export function liquidGlBlocked(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return true;
  const de = document.documentElement;
  // Account / device degradations (set by Providers + the appearance runtime).
  if (de.classList.contains('perf-lite')) return true;
  if (de.classList.contains('reduce-motion')) return true;
  if (de.classList.contains('reduce-transparency')) return true;
  if (de.classList.contains('style-high-contrast')) return true;
  // OS-level signals.
  const mm = window.matchMedia;
  if (typeof mm === 'function') {
    if (mm('(prefers-reduced-motion: reduce)').matches) return true;
    if (mm('(prefers-reduced-transparency: reduce)').matches) return true;
    if (mm('(forced-colors: active)').matches) return true;
  }
  return false;
}

/** Cheap synchronous probe for the WebGL2 fallback tier. */
export function webgl2Available(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    return !!gl;
  } catch {
    return false;
  }
}

/**
 * Resolve the best usable tier. Async because WebGPU requires an adapter request
 * to know whether it is *actually* usable (a bare `navigator.gpu` can still fail
 * to yield an adapter — exactly this container). Returns `'none'` whenever a gate
 * blocks or no context is available.
 */
export async function detectLiquidTier(): Promise<LiquidTier> {
  for (const tier of liquidTierCandidates()) {
    if (tier === 'webgpu') {
      // WebGPU: present AND an adapter resolves.
      const gpu = typeof navigator !== 'undefined' ? navigator.gpu : undefined;
      if (gpu) {
        try {
          const adapter = await gpu.requestAdapter({ powerPreference: 'low-power' });
          if (adapter) return 'webgpu';
        } catch {
          /* fall through to the next tier */
        }
      }
    } else if (tier === 'webgl2') {
      if (webgl2Available()) return 'webgl2';
    }
  }

  return 'none';
}
