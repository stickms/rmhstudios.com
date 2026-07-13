/**
 * Canvas motion utilities — Konva.Tween wrappers that honor the user's
 * reduced-motion preference the way MotionConfig did for framer-motion:
 * when reduced, animations jump straight to their final values.
 */

import Konva from "konva";

export type Easing = "linear" | "ease-out" | "ease-in-out" | "back-out" | "elastic-out";

const EASINGS: Record<Easing, (...args: number[]) => number> = {
  linear: Konva.Easings.Linear,
  "ease-out": Konva.Easings.EaseOut,
  "ease-in-out": Konva.Easings.EaseInOut,
  "back-out": Konva.Easings.BackEaseOut,
  "elastic-out": Konva.Easings.ElasticEaseOut,
};

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export interface AnimateOptions {
  /** Seconds. */
  duration?: number;
  easing?: Easing;
  onFinish?: () => void;
}

/** Tween Konva node attrs; instant under reduced motion. Returns a cancel fn. */
export function animate(
  node: Konva.Node,
  attrs: Record<string, number>,
  { duration = 0.2, easing = "ease-out", onFinish }: AnimateOptions = {}
): () => void {
  if (prefersReducedMotion() || duration <= 0) {
    node.setAttrs(attrs);
    node.getLayer()?.batchDraw();
    onFinish?.();
    return () => {};
  }
  const tween = new Konva.Tween({
    node,
    duration,
    easing: EASINGS[easing],
    onFinish,
    ...attrs,
  });
  tween.play();
  return () => tween.destroy();
}
