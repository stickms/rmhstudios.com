/**
 * The canvas layout tree: yoga flexbox driving Konva node positions.
 *
 * Every `<Box>` owns a yoga node and renders one react-konva `<Group>`; the
 * yoga tree's child ORDER is re-derived from the Konva tree before each pass
 * (react-konva keeps Konva children in JSX order), so React insertions and
 * removals can never desync layout order. After `calculateLayout`, computed
 * rects are written imperatively to the Konva nodes (no React re-render per
 * frame) and `onLayout` subscribers fire.
 *
 * Constraint that keeps this simple: a Box's layout children must be Boxes
 * whose Konva Group is a DIRECT child of the parent Box's Group — don't
 * hand-wrap Box children in raw react-konva `<Group>`s.
 */

import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  type ReactNode,
} from "react";
import { Group, Rect } from "react-konva";
import type Konva from "konva";
import {
  getYoga,
  Align,
  Display,
  Edge,
  FlexDirection,
  Gutter,
  Justify,
  PositionType,
  Wrap,
  Direction,
  MeasureMode,
  type YogaNode,
} from "./yoga";
import {
  resolveResponsive,
  type Dimension,
  type LayoutStyle,
  type TwDecl,
  type TwStyle,
  type TokenColor,
} from "../tw";
import { useTheme } from "../../theme/useTheme";
import type { ThemeTokens } from "../../theme/tokens";

export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type MeasureFn = (
  width: number,
  widthMode: MeasureMode,
  height: number,
  heightMode: MeasureMode
) => { width: number; height: number };

/** One participant in the layout tree. */
export class LayoutHandle {
  yoga: YogaNode;
  group: Konva.Group | null = null;
  parent: LayoutHandle | null = null;
  children = new Set<LayoutHandle>();
  style: TwStyle | null = null;
  rect: LayoutRect = { x: 0, y: 0, width: 0, height: 0 };
  private listeners = new Set<(rect: LayoutRect) => void>();

  constructor(readonly scheduler: LayoutScheduler) {
    this.yoga = getYoga().Node.create();
  }

  onLayout(fn: (rect: LayoutRect) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  commit(rect: LayoutRect) {
    this.rect = rect;
    if (this.group) {
      this.group.position({ x: rect.x, y: rect.y });
    }
    for (const fn of this.listeners) fn(rect);
  }

  attach(parent: LayoutHandle) {
    this.parent = parent;
    parent.children.add(this);
    // Insert at the end; true order is re-derived from the Konva tree in
    // syncChildOrder() before every layout pass.
    parent.yoga.insertChild(this.yoga, parent.yoga.getChildCount());
    this.scheduler.request();
  }

  detach() {
    if (this.parent) {
      this.parent.children.delete(this);
      this.parent.yoga.removeChild(this.yoga);
      this.parent = null;
    }
    this.yoga.free();
    this.scheduler.request();
  }
}

/** Owns the yoga root, batches layout passes, applies results. */
export class LayoutScheduler {
  root: LayoutHandle | null = null;
  private queued = false;
  width = 0;
  height = 0;
  private layer: Konva.Layer | null = null;

  setViewport(width: number, height: number) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.request();
  }

  setLayer(layer: Konva.Layer | null) {
    this.layer = layer;
  }

  request() {
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      this.flush();
    });
  }

  flush() {
    const root = this.root;
    if (!root || this.width === 0) return;
    this.applyStyles(root);
    this.syncChildOrder(root);
    root.yoga.calculateLayout(this.width, this.height, Direction.LTR);
    this.commit(root, true);
    this.layer?.batchDraw();
  }

  private applyStyles(handle: LayoutHandle) {
    if (handle.style) {
      const decl = resolveResponsive(handle.style, this.width);
      applyLayoutStyle(handle.yoga, decl.layout);
    }
    for (const child of handle.children) this.applyStyles(child);
  }

  /** Reorder yoga children to match the Konva tree (JSX order). */
  private syncChildOrder(handle: LayoutHandle) {
    if (handle.children.size > 1) {
      const ordered = [...handle.children].sort((a, b) => (a.group?.zIndex() ?? 0) - (b.group?.zIndex() ?? 0));
      let inOrder = true;
      for (let i = 0; i < ordered.length; i++) {
        if (handle.yoga.getChild(i) !== ordered[i].yoga) {
          inOrder = false;
          break;
        }
      }
      if (!inOrder) {
        for (const child of ordered) handle.yoga.removeChild(child.yoga);
        ordered.forEach((child, i) => handle.yoga.insertChild(child.yoga, i));
      }
    }
    for (const child of handle.children) this.syncChildOrder(child);
  }

  private commit(handle: LayoutHandle, isRoot: boolean) {
    const y = handle.yoga;
    handle.commit({
      x: isRoot ? 0 : y.getComputedLeft(),
      y: isRoot ? 0 : y.getComputedTop(),
      width: y.getComputedWidth(),
      height: y.getComputedHeight(),
    });
    for (const child of handle.children) this.commit(child, false);
  }
}

function setDimension(
  set: (v: number | `${number}%` | "auto") => void,
  value: Dimension | undefined
) {
  if (value !== undefined) set(value);
}

/** Write a parsed LayoutStyle onto a yoga node. */
export function applyLayoutStyle(node: YogaNode, s: LayoutStyle) {
  node.setDisplay(s.display === "none" ? Display.None : Display.Flex);
  node.setFlexDirection(
    s.flexDirection === "row"
      ? FlexDirection.Row
      : s.flexDirection === "row-reverse"
        ? FlexDirection.RowReverse
        : s.flexDirection === "column-reverse"
          ? FlexDirection.ColumnReverse
          : FlexDirection.Column
  );
  node.setFlexWrap(s.flexWrap === "wrap" ? Wrap.Wrap : Wrap.NoWrap);
  node.setAlignItems(
    s.alignItems === "center"
      ? Align.Center
      : s.alignItems === "flex-end"
        ? Align.FlexEnd
        : s.alignItems === "baseline"
          ? Align.Baseline
          : s.alignItems === "flex-start"
            ? Align.FlexStart
            : Align.Stretch
  );
  node.setAlignSelf(
    s.alignSelf === "center"
      ? Align.Center
      : s.alignSelf === "flex-end"
        ? Align.FlexEnd
        : s.alignSelf === "flex-start"
          ? Align.FlexStart
          : s.alignSelf === "stretch"
            ? Align.Stretch
            : Align.Auto
  );
  node.setJustifyContent(
    s.justifyContent === "center"
      ? Justify.Center
      : s.justifyContent === "flex-end"
        ? Justify.FlexEnd
        : s.justifyContent === "space-between"
          ? Justify.SpaceBetween
          : s.justifyContent === "space-around"
            ? Justify.SpaceAround
            : s.justifyContent === "space-evenly"
              ? Justify.SpaceEvenly
              : Justify.FlexStart
  );
  if (s.flexGrow !== undefined) node.setFlexGrow(s.flexGrow);
  if (s.flexShrink !== undefined) node.setFlexShrink(s.flexShrink);
  if (s.flexBasis !== undefined) node.setFlexBasis(s.flexBasis);
  node.setGap(Gutter.Row, s.rowGap ?? 0);
  node.setGap(Gutter.Column, s.columnGap ?? 0);
  const p = s.padding;
  node.setPadding(Edge.Top, p?.top ?? 0);
  node.setPadding(Edge.Right, p?.right ?? 0);
  node.setPadding(Edge.Bottom, p?.bottom ?? 0);
  node.setPadding(Edge.Left, p?.left ?? 0);
  const m = s.margin;
  if (m?.autoX) {
    node.setMarginAuto(Edge.Horizontal);
  } else {
    node.setMargin(Edge.Left, m?.left ?? 0);
    node.setMargin(Edge.Right, m?.right ?? 0);
  }
  node.setMargin(Edge.Top, m?.top ?? 0);
  node.setMargin(Edge.Bottom, m?.bottom ?? 0);
  setDimension((v) => node.setWidth(v), s.width);
  setDimension((v) => node.setHeight(v), s.height);
  if (s.minWidth !== undefined && s.minWidth !== "auto") node.setMinWidth(s.minWidth);
  if (s.minHeight !== undefined && s.minHeight !== "auto") node.setMinHeight(s.minHeight);
  if (s.maxWidth !== undefined && s.maxWidth !== "auto") node.setMaxWidth(s.maxWidth);
  if (s.maxHeight !== undefined && s.maxHeight !== "auto") node.setMaxHeight(s.maxHeight);
  node.setPositionType(s.position === "absolute" ? PositionType.Absolute : PositionType.Relative);
  if (s.top !== undefined) node.setPosition(Edge.Top, s.top);
  if (s.right !== undefined) node.setPosition(Edge.Right, s.right);
  if (s.bottom !== undefined) node.setPosition(Edge.Bottom, s.bottom);
  if (s.left !== undefined) node.setPosition(Edge.Left, s.left);
  if (s.aspectRatio !== undefined) node.setAspectRatio(s.aspectRatio);
}

// ---------------------------------------------------------------------------
// React integration
// ---------------------------------------------------------------------------

export const LayoutSchedulerContext = createContext<LayoutScheduler | null>(null);
export const LayoutParentContext = createContext<LayoutHandle | null>(null);

export function useLayoutScheduler(): LayoutScheduler {
  const scheduler = useContext(LayoutSchedulerContext);
  if (!scheduler) throw new Error("canvas-ui: <Box> must render inside a scene (LayoutSchedulerContext missing).");
  return scheduler;
}

/** Resolve a TokenColor against the active theme. */
export function resolveColor(tokens: ThemeTokens, c: TokenColor | undefined): string | undefined {
  if (!c) return undefined;
  if ("literal" in c) return c.literal;
  switch (c.token) {
    case "bg": return tokens.bg;
    case "bg-subtle": return tokens.bgSubtle;
    case "surface": return tokens.surface;
    case "surface-hover": return tokens.surfaceHover;
    case "surface-active": return tokens.surfaceActive;
    case "border": return tokens.border;
    case "border-bright": return tokens.borderBright;
    case "text": return tokens.text;
    case "text-muted": return tokens.textMuted;
    case "text-dim": return tokens.textDim;
    case "accent": return tokens.accent;
    case "accent-fg": return tokens.accentFg;
    case "accent-hover": return tokens.accentHover;
    case "accent-dim": return tokens.accentDim;
    case "success": return tokens.success;
    case "danger": return tokens.danger;
    case "warning": return tokens.warning;
  }
}

export function resolveCornerRadius(tokens: ThemeTokens, r: TwDecl["paint"]["cornerRadius"], height: number): number {
  if (r === undefined) return 0;
  if (r === "site") return tokens.radius;
  if (r === "site-sm") return tokens.radiusSm;
  if (r === "full") return height / 2;
  return r;
}

export interface BoxProps {
  style?: TwStyle;
  /** Konva node name — used by scene queries in tests and devtools. */
  name?: string;
  children?: ReactNode;
  /** Fires with the computed rect after every layout pass. */
  onLayout?: (rect: LayoutRect) => void;
  /** Leaf measurement (text, images) — makes this Box a yoga measure node. */
  measure?: MeasureFn;
  listening?: boolean;
  onClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onTap?: (e: Konva.KonvaEventObject<Event>) => void;
  onMouseEnter?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseLeave?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseDown?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseUp?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  opacity?: number;
}

export interface BoxRef {
  handle: LayoutHandle | null;
  group: Konva.Group | null;
}

/**
 * The layout primitive: a flexbox node rendered as a Konva Group with an
 * optional background/border Rect (present only when the style paints).
 */
export const Box = forwardRef<BoxRef, BoxProps>(function Box(
  { style, name, children, onLayout, measure, listening, opacity, ...events },
  ref
) {
  const scheduler = useLayoutScheduler();
  const parent = useContext(LayoutParentContext);
  const tokens = useTheme();
  const groupRef = useRef<Konva.Group | null>(null);
  const bgRef = useRef<Konva.Rect | null>(null);
  const handleRef = useRef<LayoutHandle | null>(null);

  // Create the handle once (during render, so the context value below is
  // stable for children on first mount). Creation is idempotent.
  if (handleRef.current === null) {
    handleRef.current = new LayoutHandle(scheduler);
  }
  const handle = handleRef.current;
  handle.style = style ?? null;

  useImperativeHandle(ref, () => ({ handle: handleRef.current, group: groupRef.current }), []);

  useLayoutEffect(() => {
    handle.group = groupRef.current;
    if (parent) handle.attach(parent);
    return () => {
      handle.detach();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (measure) {
      handle.yoga.setMeasureFunc((w, wm, h, hm) => measure(w, wm, h, hm));
    } else {
      handle.yoga.unsetMeasureFunc();
    }
    scheduler.request();
  }, [handle, measure, scheduler]);

  // Any style/theme change re-runs layout + repaints the background.
  useLayoutEffect(() => {
    scheduler.request();
  }, [style, tokens, scheduler]);

  // Keep the background rect glued to the computed size.
  useLayoutEffect(() => {
    if (!onLayout && !bgRef.current) return undefined;
    return handle.onLayout((rect) => {
      const bg = bgRef.current;
      if (bg) {
        bg.size({ width: rect.width, height: rect.height });
        const decl = style ? resolveResponsive(style, scheduler.width) : null;
        if (decl) {
          bg.cornerRadius(resolveCornerRadius(tokens, decl.paint.cornerRadius, rect.height));
        }
      }
      onLayout?.(rect);
    });
  }, [handle, onLayout, style, tokens, scheduler]);

  const decl = style ? resolveResponsive(style, scheduler.width || 1024) : null;
  const paint = decl?.paint;
  const hasBackground = !!(paint && (paint.fill || paint.stroke || paint.shadow === "site"));
  const fill = resolveColor(tokens, paint?.fill);
  const stroke = resolveColor(tokens, paint?.stroke);
  const strokeWidth = paint?.strokeWidth === "token" ? tokens.borderWidth : paint?.strokeWidth;
  const shadow = paint?.shadow === "site" ? tokens.shadow : null;

  return (
    <Group
      ref={groupRef}
      name={name}
      listening={listening}
      opacity={opacity ?? paint?.opacity ?? 1}
      {...events}
    >
      {hasBackground && (
        <Rect
          ref={bgRef}
          name="box-bg"
          width={handle.rect.width}
          height={handle.rect.height}
          fill={fill}
          stroke={stroke}
          strokeWidth={stroke ? (strokeWidth ?? 1) : 0}
          cornerRadius={resolveCornerRadius(tokens, paint?.cornerRadius, handle.rect.height)}
          shadowColor={shadow?.color}
          shadowBlur={shadow?.blur ?? 0}
          shadowOffsetX={shadow?.offsetX ?? 0}
          shadowOffsetY={shadow?.offsetY ?? 0}
          perfectDrawEnabled={false}
          listening={false}
        />
      )}
      <LayoutParentContext.Provider value={handle}>{children}</LayoutParentContext.Provider>
    </Group>
  );
});
