import { describe, expect, it } from 'vitest';
import { TWEEN_MS, createTween, type TweenFrame } from './tween';

function rig(initial = 10) {
  let t = 0;
  let next = 1;
  const queue = new Map<number, () => void>();
  const frames: TweenFrame[] = [];
  const tween = createTween({
    initial,
    onFrame: (f) => frames.push(f),
    scheduler: {
      now: () => t,
      request: (cb) => {
        const h = next++;
        queue.set(h, cb);
        return h;
      },
      cancel: (h) => void queue.delete(h),
    },
  });
  const advance = (ms: number) => {
    t += ms;
    const [h, cb] = [...queue.entries()][0] ?? [];
    if (h !== undefined && cb) {
      queue.delete(h);
      cb();
    }
  };
  return { tween, frames, advance, queue };
}

describe('createTween', () => {
  it('is within the R5 limit and ease-out', () => {
    expect(TWEEN_MS).toBeLessThanOrEqual(300);
  });
  it('schedules nothing until the target changes', () => {
    const { tween, queue, frames } = rig();
    tween.set(10);
    expect(queue.size).toBe(0);
    expect(frames).toHaveLength(0);
    expect(tween.frame).toEqual({ value: 10, from: 10, to: 10, p: 1 });
  });
  it('moves monotonically to the target and then requests no further frame', () => {
    const { tween, queue, advance } = rig(10);
    tween.set(100);
    expect(queue.size).toBe(1);
    expect(tween.frame.value).toBe(10);
    advance(70);
    const mid = tween.frame.value;
    expect(mid).toBeGreaterThan(10);
    expect(mid).toBeLessThan(100);
    advance(100);
    expect(tween.frame.value).toBeGreaterThan(mid);
    advance(TWEEN_MS);
    expect(tween.frame).toEqual({ value: 100, from: 100, to: 100, p: 1 });
    expect(queue.size).toBe(0);
    expect(tween.pending).toBe(false);
  });
  it('is faster at the start than at the end (ease-out)', () => {
    const { tween, advance } = rig(0);
    tween.set(100);
    advance(TWEEN_MS / 4);
    const first = tween.frame.value;
    advance(TWEEN_MS / 4);
    const second = tween.frame.value - first;
    expect(first).toBeGreaterThan(second);
  });
  it('an interrupted tween continues from where it was drawn, not from its old start', () => {
    const { tween, advance } = rig(0);
    tween.set(100);
    advance(80);
    const at = tween.frame.value;
    tween.set(20);
    expect(tween.frame.value).toBe(at);
    expect(tween.frame.to).toBe(20);
    advance(TWEEN_MS + 1);
    expect(tween.frame.value).toBe(20);
  });
  it('reduced motion jumps with no frame requested', () => {
    const { tween, queue } = rig(10);
    tween.set(50, true);
    expect(tween.frame.value).toBe(50);
    expect(queue.size).toBe(0);
  });
  it('stop cancels the pending frame', () => {
    const { tween, queue } = rig(10);
    tween.set(50);
    tween.stop();
    expect(queue.size).toBe(0);
  });
});
