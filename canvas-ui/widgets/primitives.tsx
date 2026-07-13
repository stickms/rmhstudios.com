/**
 * Small canvas primitives mirroring components/ui: Card, Badge, Divider,
 * Spinner, Skeleton. Larger interactive widgets live in their own files.
 */

import { useEffect, useRef, type ReactNode } from "react";
import Konva from "konva";
import { Arc, Rect } from "react-konva";
import { Box, type BoxProps } from "../runtime/layout/LayoutTree";
import { CanvasText } from "../text/Text";
import { tw, type TwStyle } from "../runtime/tw";
import { useTheme } from "../theme/useTheme";
import { prefersReducedMotion } from "../motion/animate";

/** Card — surface + border + site radius, the standard content container. */
export function Card({ children, style, name }: { children: ReactNode; style?: TwStyle; name?: string }) {
  const base = tw("flex flex-col bg-site-surface border border-site-border rounded-site p-4 gap-2");
  const merged: TwStyle = style
    ? { ...base, layout: { ...base.layout, ...style.layout }, paint: { ...base.paint, ...style.paint } }
    : base;
  return (
    <Box name={name ?? "card"} style={merged}>
      {children}
    </Box>
  );
}

/** Badge — small token-colored pill. */
export function Badge({
  children,
  tone = "default",
  name,
}: {
  children: string;
  tone?: "default" | "accent" | "success" | "danger" | "warning";
  name?: string;
}) {
  const bg = {
    default: "bg-site-surface border border-site-border",
    accent: "bg-site-accent-dim",
    success: "bg-site-surface border border-site-border",
    danger: "bg-site-surface border border-site-border",
    warning: "bg-site-surface border border-site-border",
  }[tone];
  const fg = {
    default: "text-site-text-muted",
    accent: "text-site-accent",
    success: "text-site-success",
    danger: "text-site-danger",
    warning: "text-site-warning",
  }[tone];
  return (
    <Box name={name ?? "badge"} style={tw(`flex flex-row items-center px-2.5 h-6 rounded-full ${bg}`)}>
      <CanvasText style={`${fg} text-xs font-medium`}>{children}</CanvasText>
    </Box>
  );
}

/** Divider — a 1px token hairline. */
export function Divider({ style }: { style?: TwStyle }) {
  return <Box name="divider" style={style ?? tw("w-full h-px bg-site-border")} />;
}

/** Spinner — rotating accent arc (still animates under reduced motion, as
 * loading feedback is exempt, matching the CSS behavior). */
export function Spinner({ size = 20 }: { size?: number }) {
  const tokens = useTheme();
  const arcRef = useRef<Konva.Arc | null>(null);

  useEffect(() => {
    const node = arcRef.current;
    if (!node) return;
    const anim = new Konva.Animation((frame) => {
      if (frame) node.rotation((frame.time / 900) * 360);
    }, node.getLayer());
    anim.start();
    return () => {
      anim.stop();
    };
  }, []);

  return (
    <Box name="spinner" style={{ layout: { width: size, height: size }, paint: {}, text: {} }}>
      <Arc
        ref={arcRef}
        x={size / 2}
        y={size / 2}
        innerRadius={size / 2 - 2}
        outerRadius={size / 2}
        angle={270}
        fill={tokens.accent}
        listening={false}
      />
    </Box>
  );
}

/** Skeleton — pulsing placeholder block. */
export function Skeleton({ style }: { style?: TwStyle }) {
  const tokens = useTheme();
  const rectRef = useRef<Konva.Rect | null>(null);
  const boxRef = useRef<Parameters<NonNullable<BoxProps["onLayout"]>>[0] | null>(null);

  useEffect(() => {
    const node = rectRef.current;
    if (!node || prefersReducedMotion()) return;
    const anim = new Konva.Animation((frame) => {
      if (frame) node.opacity(0.5 + 0.3 * Math.sin(frame.time / 350));
    }, node.getLayer());
    anim.start();
    return () => {
      anim.stop();
    };
  }, []);

  return (
    <Box
      name="skeleton"
      style={style ?? tw("w-full h-4")}
      onLayout={(rect) => {
        boxRef.current = rect;
        rectRef.current?.size({ width: rect.width, height: rect.height });
      }}
    >
      <Rect ref={rectRef} fill={tokens.surfaceHover} cornerRadius={tokens.radiusSm} listening={false} />
    </Box>
  );
}
