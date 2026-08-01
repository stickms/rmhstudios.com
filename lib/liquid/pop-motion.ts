/** Pure geometry for the panel half of the liquid-pop entrance animation. */

export interface PopRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PopPanelMotion {
  dx: number;
  dy: number;
  startScaleX: number;
  startScaleY: number;
  originX: number;
  originY: number;
  rotation: number;
}

export const WEBGPU_POP_DURATION_S = 0.46;
export const FALLBACK_POP_DURATION_S = 0.3;
export const PERF_POP_DURATION_S = 0.18;

/**
 * WebGPU gets a longer, multi-lobed settle so the SDF bud visibly stretches,
 * overshoots, squashes, and rebounds. The CSS/SVG fallback keeps the same physical
 * idea at lower amplitude; perf-lite uses a short single settle.
 */
export const WEBGPU_POP_PROGRESS = [0, 0.42, 0.76, 1.075, 0.955, 1.018, 1] as const;
export const WEBGPU_POP_TIMES = [0, 0.18, 0.42, 0.64, 0.78, 0.9, 1] as const;
export const FALLBACK_POP_PROGRESS = [0, 0.72, 1.035, 0.985, 1] as const;
export const FALLBACK_POP_TIMES = [0, 0.42, 0.7, 0.86, 1] as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Build a direction-aware transform that appears to grow out of the trigger. */
export function createPopPanelMotion(
  trigger: PopRect,
  panel: PopRect,
  shader: boolean,
): PopPanelMotion {
  const triggerX = trigger.left + trigger.width / 2;
  const triggerY = trigger.top + trigger.height / 2;
  const panelX = panel.left + panel.width / 2;
  const panelY = panel.top + panel.height / 2;
  const dx = clamp(triggerX - panelX, -48, 48);
  const dy = clamp(triggerY - panelY, -48, 48);
  const vertical = Math.abs(dy) >= Math.abs(dx);

  return {
    dx,
    dy,
    // Squash along the travel axis and spread across it, like a droplet pulling
    // away from the trigger. The fallback is deliberately calmer.
    startScaleX: shader ? (vertical ? 0.82 : 0.48) : vertical ? 0.95 : 0.9,
    startScaleY: shader ? (vertical ? 0.48 : 0.82) : vertical ? 0.9 : 0.95,
    originX: clamp(triggerX - panel.left, 0, panel.width),
    originY: clamp(triggerY - panel.top, 0, panel.height),
    rotation: shader ? clamp(dx / 16, -2.5, 2.5) : clamp(dx / 32, -1.25, 1.25),
  };
}

/** Resolve one progress sample. Values above 1 create the elastic overshoot. */
export function popPanelTransform(motion: PopPanelMotion, progress: number): string {
  const remaining = 1 - progress;
  const x = motion.dx * remaining;
  const y = motion.dy * remaining;
  const scaleX = 1 + (motion.startScaleX - 1) * remaining;
  const scaleY = 1 + (motion.startScaleY - 1) * remaining;
  const rotation = motion.rotation * remaining;
  return `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg) scale3d(${scaleX}, ${scaleY}, 1)`;
}
