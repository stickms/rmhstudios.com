import { describe, expect, it } from 'vitest';
import {
  FALLBACK_POP_PROGRESS,
  WEBGPU_POP_PROGRESS,
  createPopPanelMotion,
  popPanelTransform,
} from '../pop-motion';

describe('liquid-pop panel motion', () => {
  const panel = { left: 100, top: 100, width: 240, height: 180 };

  it('anchors its transform origin to the trigger and clamps it inside the panel', () => {
    const motion = createPopPanelMotion({ left: 350, top: 40, width: 32, height: 32 }, panel, true);
    expect(motion.originX).toBe(panel.width);
    expect(motion.originY).toBe(0);
    expect(motion.dx).toBe(48);
    expect(motion.dy).toBe(-48);
  });

  it('uses stronger direction-aware squash for the shader path', () => {
    const trigger = { left: 200, top: 40, width: 32, height: 32 };
    const shader = createPopPanelMotion(trigger, panel, true);
    const fallback = createPopPanelMotion(trigger, panel, false);
    expect(shader.startScaleY).toBeLessThan(shader.startScaleX);
    expect(shader.startScaleY).toBeLessThan(fallback.startScaleY);
  });

  it('settles at identity and turns progress above one into a rebound', () => {
    const motion = createPopPanelMotion({ left: 200, top: 40, width: 32, height: 32 }, panel, true);
    expect(popPanelTransform(motion, 1)).toBe(
      'translate3d(0px, 0px, 0) rotate(0deg) scale3d(1, 1, 1)',
    );
    expect(popPanelTransform(motion, 1.075)).toContain('scale3d(1.0135');
    expect(WEBGPU_POP_PROGRESS.some((value) => value > 1)).toBe(true);
    expect(FALLBACK_POP_PROGRESS.some((value) => value > 1)).toBe(true);
  });
});
