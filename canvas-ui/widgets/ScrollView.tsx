/**
 * ScrollView — canvas replacement for native scrolling: a clipped viewport
 * Box whose content Box translates on wheel / touch-drag (with momentum),
 * plus an auto-fading overlay scrollbar. Keyboard paging comes from the
 * window (PageUp/Down/Home/End) while the view is the active scroller.
 */

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import Konva from "konva";
import { Group, Rect } from "react-konva";
import { Box, type BoxRef, type LayoutRect } from "../runtime/layout/LayoutTree";
import { tw, type TwStyle } from "../runtime/tw";
import { useTheme } from "../theme/useTheme";

export interface ScrollViewProps {
  children: ReactNode;
  /** Sizing/placement of the viewport within the scene. */
  style?: TwStyle;
  /** Layout of the inner content column. */
  contentStyle?: TwStyle;
  name?: string;
  onScroll?: (offset: number) => void;
}

export function ScrollView({ children, style, contentStyle, name, onScroll }: ScrollViewProps) {
  const tokens = useTheme();
  const viewportRef = useRef<BoxRef | null>(null);
  const contentRef = useRef<BoxRef | null>(null);
  const scrollbarRef = useRef<Konva.Rect | null>(null);
  const state = useRef({
    offset: 0,
    viewportH: 0,
    contentH: 0,
    velocity: 0,
    raf: 0,
    lastTouchY: 0,
    fadeTimer: 0 as ReturnType<typeof setTimeout> | 0,
  });

  const clampAndApply = useCallback(
    (next: number) => {
      const s = state.current;
      const max = Math.max(0, s.contentH - s.viewportH);
      s.offset = Math.min(max, Math.max(0, next));
      const group = contentRef.current?.group;
      if (group) {
        group.y(contentRef.current!.handle!.rect.y - s.offset);
        group.getLayer()?.batchDraw();
      }
      const bar = scrollbarRef.current;
      if (bar && s.contentH > s.viewportH) {
        const trackH = s.viewportH;
        const barH = Math.max(32, (s.viewportH / s.contentH) * trackH);
        bar.height(barH);
        bar.y((s.offset / max) * (trackH - barH));
        bar.opacity(0.4);
        bar.getLayer()?.batchDraw();
        if (s.fadeTimer) clearTimeout(s.fadeTimer);
        s.fadeTimer = setTimeout(() => {
          bar.to({ opacity: 0, duration: 0.3 });
        }, 800);
      }
      onScroll?.(s.offset);
    },
    [onScroll]
  );

  const momentum = useCallback(() => {
    const s = state.current;
    cancelAnimationFrame(s.raf);
    const step = () => {
      s.velocity *= 0.94;
      if (Math.abs(s.velocity) < 0.5) return;
      clampAndApply(s.offset + s.velocity);
      s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
  }, [clampAndApply]);

  // Wheel + touch arrive on the stage container (DOM), not Konva nodes.
  useEffect(() => {
    const stage = viewportRef.current?.group?.getStage();
    const container = stage?.container();
    if (!container) return;
    const s = state.current;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const line = e.deltaMode === 1 ? 16 : 1;
      clampAndApply(s.offset + e.deltaY * line);
    };
    const onTouchStart = (e: TouchEvent) => {
      cancelAnimationFrame(s.raf);
      s.velocity = 0;
      s.lastTouchY = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0].clientY;
      const dy = s.lastTouchY - y;
      s.lastTouchY = y;
      s.velocity = dy;
      clampAndApply(s.offset + dy);
    };
    const onTouchEnd = () => momentum();
    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: true });
    container.addEventListener("touchend", onTouchEnd);
    return () => {
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      cancelAnimationFrame(s.raf);
    };
  }, [clampAndApply, momentum]);

  // Keyboard paging while mounted (single main scroller per scene).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = state.current;
      const page = s.viewportH * 0.85;
      const map: Record<string, number | "home" | "end"> = {
        PageDown: page,
        PageUp: -page,
        Home: "home",
        End: "end",
        ArrowDown: 48,
        ArrowUp: -48,
      };
      const d = map[e.key];
      if (d === undefined) return;
      // Don't steal keys from the input proxy.
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      e.preventDefault();
      if (d === "home") clampAndApply(0);
      else if (d === "end") clampAndApply(Number.MAX_SAFE_INTEGER);
      else clampAndApply(s.offset + d);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clampAndApply]);

  const onViewportLayout = useCallback(
    (rect: LayoutRect) => {
      state.current.viewportH = rect.height;
      // Re-clip, re-position the scrollbar track, re-clamp on resize.
      const group = viewportRef.current?.group;
      group?.clip({ x: 0, y: 0, width: rect.width, height: rect.height });
      scrollbarRef.current?.x(rect.width - 8);
      clampAndApply(state.current.offset);
    },
    [clampAndApply]
  );

  const onContentLayout = useCallback(
    (rect: LayoutRect) => {
      state.current.contentH = rect.height;
      clampAndApply(state.current.offset);
    },
    [clampAndApply]
  );

  return (
    <Box
      ref={viewportRef}
      name={name ?? "scroll-view"}
      style={style ?? tw("flex flex-col flex-1 w-full overflow-hidden")}
      onLayout={onViewportLayout}
    >
      <Box
        ref={contentRef}
        name="scroll-content"
        style={contentStyle ?? tw("flex flex-col w-full")}
        onLayout={onContentLayout}
      >
        {children}
      </Box>
      {/* Overlay scrollbar — positioned imperatively, outside layout. */}
      <Group name="scroll-gestures">
        <Rect
          ref={scrollbarRef}
          name="scrollbar"
          width={4}
          cornerRadius={2}
          fill={tokens.textDim}
          opacity={0}
          listening={false}
        />
      </Group>
    </Box>
  );
}
