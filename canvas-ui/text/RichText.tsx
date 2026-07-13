/**
 * RichText — styled inline runs (bold / links / colored spans) with manual
 * greedy line-breaking, drawn by a single Konva.Shape. This is the canvas
 * replacement for paragraphs that mixed <strong>/<a> inside wrapped text,
 * which a single Konva.Text cannot represent.
 *
 * Layout: runs are tokenized into words (trailing whitespace kept with the
 * word), measured with a shared offscreen 2D context, greedily filled into
 * lines at the yoga-provided width, then painted token-by-token. Links get
 * an underline, a pointer cursor, per-token hit testing, and an a11y-mirror
 * registration via the parent scene.
 */

import { useCallback, useMemo, useRef } from "react";
import { Shape } from "react-konva";
import { Box, type LayoutRect } from "../runtime/layout/LayoutTree";
import { MeasureMode } from "../runtime/layout/yoga";
import { useTheme } from "../theme/useTheme";
import { useCanvasEnv } from "../runtime/env";
import { useMirrorControl } from "../mirror/MirrorControls";
import { setCursor } from "../widgets/cursor";

export interface TextRun {
  text: string;
  bold?: boolean;
  /** Internal path or external URL — the run renders as a link. */
  href?: string;
  color?: string;
}

export interface RichTextTypography {
  fontSize: number;
  lineHeight: number; // px
  fontFamily: string;
  color: string;
  boldColor?: string;
  boldWeight?: number;
  linkColor?: string;
  letterSpacing?: number; // px
}

interface Token {
  text: string;
  x: number;
  y: number; // line top
  width: number;
  bold: boolean;
  href?: string;
  color: string;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function getCtx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    measureCtx = document.createElement("canvas").getContext("2d")!;
  }
  return measureCtx;
}

function fontString(typo: RichTextTypography, bold: boolean): string {
  const weight = bold ? (typo.boldWeight ?? 600) : 400;
  // Konva font family strings are comma lists; ctx.font accepts them as-is.
  return `${weight} ${typo.fontSize}px ${typo.fontFamily}`;
}

function layoutRuns(runs: TextRun[], typo: RichTextTypography, maxWidth: number): { tokens: Token[]; height: number; width: number } {
  const ctx = getCtx();
  const tokens: Token[] = [];
  let x = 0;
  let line = 0;
  let maxLineWidth = 0;

  for (const run of runs) {
    const color = run.color ?? (run.href ? (typo.linkColor ?? typo.color) : run.bold ? (typo.boldColor ?? typo.color) : typo.color);
    ctx.font = fontString(typo, !!run.bold);
    // Split keeping trailing spaces attached to the preceding word.
    const words = run.text.match(/\S+\s*|\s+/g) ?? [];
    for (const word of words) {
      const width = ctx.measureText(word)!.width + (typo.letterSpacing ?? 0) * word.length;
      if (x > 0 && x + width > maxWidth && word.trim() !== "") {
        line += 1;
        x = 0;
      }
      // Skip leading whitespace at line starts.
      if (x === 0 && word.trim() === "") continue;
      tokens.push({ text: word, x, y: line * typo.lineHeight, width, bold: !!run.bold, href: run.href, color });
      x += width;
      maxLineWidth = Math.max(maxLineWidth, x);
    }
  }

  return { tokens, height: (line + 1) * typo.lineHeight, width: maxLineWidth };
}

export interface RichTextProps {
  runs: TextRun[];
  typography?: Partial<RichTextTypography>;
  name?: string;
}

export function RichText({ runs, typography, name }: RichTextProps) {
  const tokens = useTheme();
  const env = useCanvasEnv();
  const layoutRef = useRef<{ tokens: Token[]; height: number } | null>(null);
  const widthRef = useRef(0);

  const typo: RichTextTypography = useMemo(
    () => ({
      fontSize: 16,
      lineHeight: 26,
      fontFamily: tokens.fontBody,
      color: tokens.textMuted,
      boldColor: tokens.text,
      linkColor: tokens.text,
      ...typography,
    }),
    [tokens, typography]
  );

  // Register link runs in the a11y mirror (one control per link).
  const links = useMemo(() => runs.filter((r) => r.href), [runs]);
  useMirrorControl(
    links.length > 0
      ? {
          role: "link",
          label: links.map((l) => l.text).join(", "),
          href: links[0]!.href,
          onActivate: () => navigateTo(env, links[0]!.href!),
        }
      : false
  );

  const measure = useCallback(
    (width: number, widthMode: MeasureMode) => {
      const max = widthMode === MeasureMode.Undefined ? Number.MAX_SAFE_INTEGER : width;
      const layout = layoutRuns(runs, typo, max);
      layoutRef.current = layout;
      widthRef.current = Math.min(layout.width, max);
      return { width: Math.ceil(widthRef.current), height: Math.ceil(layout.height) };
    },
    [runs, typo]
  );

  const handleLayout = useCallback(
    (rect: LayoutRect) => {
      const layout = layoutRuns(runs, typo, rect.width || Number.MAX_SAFE_INTEGER);
      layoutRef.current = layout;
      widthRef.current = rect.width;
    },
    [runs, typo]
  );

  const tokenAt = (pos: { x: number; y: number } | null): Token | null => {
    const layout = layoutRef.current;
    if (!layout || !pos) return null;
    return (
      layout.tokens.find(
        (t) => t.href && pos.x >= t.x && pos.x <= t.x + t.width && pos.y >= t.y && pos.y <= t.y + typo.lineHeight
      ) ?? null
    );
  };

  return (
    <Box name={name ?? "rich-text"} measure={measure} onLayout={handleLayout}>
      <Shape
        listening={links.length > 0}
        onClick={(e) => {
          const t = tokenAt(e.target.getRelativePointerPosition());
          if (t?.href) navigateTo(env, t.href);
        }}
        onTap={(e) => {
          const t = tokenAt(e.target.getRelativePointerPosition());
          if (t?.href) navigateTo(env, t.href);
        }}
        onMouseMove={(e) => {
          setCursor(e, tokenAt(e.target.getRelativePointerPosition()) ? "pointer" : "default");
        }}
        onMouseLeave={(e) => setCursor(e, "default")}
        sceneFunc={(ctx, shape) => {
          const layout = layoutRef.current;
          if (!layout) return;
          const c = ctx._context;
          c.textBaseline = "alphabetic";
          const baselineOffset = typo.fontSize * 0.8 + (typo.lineHeight - typo.fontSize) / 2;
          for (const t of layout.tokens) {
            c.font = fontString(typo, t.bold);
            c.fillStyle = t.color;
            c.fillText(t.text, t.x, t.y + baselineOffset);
            if (t.href) {
              c.strokeStyle = t.color;
              c.lineWidth = 1;
              c.beginPath();
              c.moveTo(t.x, t.y + baselineOffset + 3);
              c.lineTo(t.x + t.width, t.y + baselineOffset + 3);
              c.stroke();
            }
          }
          // Hit region for links.
          ctx.fillStrokeShape(shape);
        }}
        hitFunc={(ctx, shape) => {
          ctx.beginPath();
          ctx.rect(0, 0, widthRef.current, layoutRef.current?.height ?? 0);
          ctx.closePath();
          ctx.fillStrokeShape(shape);
        }}
      />
    </Box>
  );
}

function navigateTo(env: ReturnType<typeof useCanvasEnv>, href: string) {
  if (/^https?:\/\//.test(href)) window.open(href, "_blank", "noopener");
  else env.navigate(href);
}
