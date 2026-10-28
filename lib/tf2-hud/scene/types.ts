/**
 * The scene is plain data: a flat, z-sorted list of panels, each with the draw
 * operations that paint it. Building it (`build.ts`) and painting it
 * (`paint.ts`) never meet except through these types, which keeps layout fully
 * unit-testable without a canvas.
 */

import type { Rect, Screen } from '../layout/geometry';
import type { BorderDef, Rgba } from '../scheme/scheme';

export type HAlign = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom';

export interface TextOp {
  t: 'text';
  rect: Rect;
  text: string;
  color: Rgba;
  fontName: string;
  px: number;
  weight: number;
  italic: boolean;
  underline: boolean;
  outline: boolean;
  dropshadow: boolean;
  align: HAlign;
  valign: VAlign;
  wrap: boolean;
  insetX: number;
  insetY: number;
}

export interface RectOp {
  t: 'rect';
  rect: Rect;
  fill: Rgba;
  /** Corner radius in pixels. */
  radius: number;
}

export interface BorderOp {
  t: 'border';
  rect: Rect;
  border: BorderDef;
  /** Scheme colours already resolved to RGBA, in `border.left/right/top/bottom` order. */
  colors: { left: Rgba[]; right: Rgba[]; top: Rgba[]; bottom: Rgba[] };
  scale: number;
}

export interface ImageOp {
  t: 'image';
  rect: Rect;
  /** Extension-less project path, e.g. `materials/hud/health_bg`. */
  path: string;
  tint?: Rgba;
  /** 0–1: draw only this fraction of the width (progress bars). */
  clipX?: number;
  /**
   * Draw at the texture's own pixel size from the panel's top-left, clipped to the panel, instead of
   * stretching to it. This is what an `ImagePanel` does unless `scaleImage` is set.
   */
  native?: boolean;
}

/** Content that only exists at runtime (3D models, avatars, lists). */
export interface DynamicOp {
  t: 'dynamic';
  rect: Rect;
  label: string;
}

export interface OutlineOp {
  t: 'outline';
  rect: Rect;
  color: Rgba;
  dashed: boolean;
}

export type DrawOp = TextOp | RectOp | BorderOp | ImageOp | DynamicOp | OutlineOp;

export interface PanelNode {
  /** Stable within a scene: `<file>#<key>` (+ `~n` for repeated keys). */
  id: string;
  file: string;
  /** Path into the file's KeyValues tree, usable with `kvAt`. */
  keyPath: string[];
  name: string;
  control: string;
  rect: Rect;
  z: number;
  /** The panel's own `visible` flag. */
  visible: boolean;
  /** Whether it is drawn right now (visible, or revealed by the test options). */
  shown: boolean;
  isFrame: boolean;
  /** Opacity (0–1) from the panel's `alpha` and its ancestors'; absent when fully opaque. */
  alpha?: number;
  parentId: string | null;
  /** Bounds of the ancestor panels this one is clipped to (absent when only the screen clips it). */
  clip?: Rect;
  /** Source range of the entry in the file text. */
  source: { start: number; end: number };
  ops: DrawOp[];
}

export interface Scene {
  screen: Screen;
  nodes: PanelNode[];
  /** Images the scene refers to, for preloading and missing-asset reporting. */
  images: string[];
}
