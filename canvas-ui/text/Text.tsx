/**
 * Canvas text primitive: token typography + yoga-measured wrapping + RTL.
 *
 * Renders a yoga leaf whose measure function wraps/measures the string with
 * an offscreen Konva.Text, so flex layout and painted text can never
 * disagree. Base direction follows the active i18n locale (`dirFor`), which
 * Konva forwards to `ctx.direction` for bidi-correct rendering of Arabic /
 * Urdu / Farsi strings.
 */

import { useCallback, useMemo, useRef } from "react";
import Konva from "konva";
import { Text as KonvaText } from "react-konva";
import { useTranslation } from "react-i18next";
import { dirFor, type Locale } from "@/lib/i18n/config";
import { Box, resolveColor, useLayoutScheduler, type LayoutRect } from "../runtime/layout/LayoutTree";
import { registerMeasureHandle } from "./fonts";
import { MeasureMode } from "../runtime/layout/yoga";
import { tw, resolveResponsive, type TwStyle } from "../runtime/tw";
import { useTheme } from "../theme/useTheme";
import { TEXT_SIZES, FONT_WEIGHTS } from "../theme/tokens";

let sharedMeasurer: Konva.Text | null = null;
function getMeasurer(): Konva.Text {
  sharedMeasurer ??= new Konva.Text({ listening: false });
  return sharedMeasurer;
}

export interface TextProps {
  children: string | number | Array<string | number>;
  /** tw() classes — only the text/font/leading/tracking/truncate subset applies. */
  style?: TwStyle | string;
  /** Cap wrapped lines (1 with truncate = single-line ellipsis). */
  maxLines?: number;
  name?: string;
  listening?: boolean;
}

interface ResolvedTypography {
  fontSize: number;
  lineHeightPx: number;
  fontFamily: string;
  fontStyle: string;
  fill: string;
  align: "left" | "center" | "right";
  letterSpacing: number;
  ellipsis: boolean;
  wrap: "word" | "none";
  textTransform: "none" | "uppercase";
  direction: "ltr" | "rtl";
}

export function CanvasText({ children, style, maxLines, name, listening = false }: TextProps) {
  const tokens = useTheme();
  const scheduler = useLayoutScheduler();
  const { i18n } = useTranslation();
  const nodeRef = useRef<Konva.Text | null>(null);
  const rectRef = useRef<LayoutRect | null>(null);

  const text = Array.isArray(children) ? children.join("") : String(children);
  const twStyle = typeof style === "string" ? tw(style) : style;
  const decl = twStyle ? resolveResponsive(twStyle, scheduler.width || 1024) : null;
  const t = decl?.text;

  const typo: ResolvedTypography = useMemo(() => {
    const size = TEXT_SIZES[t?.size ?? "base"];
    const family =
      t?.family === "mono" ? tokens.fontMono : t?.family === "display" ? tokens.fontDisplay : tokens.fontBody;
    const weight = FONT_WEIGHTS[t?.weight ?? "normal"];
    const fontSize = size.fontSize;
    return {
      fontSize,
      lineHeightPx: t?.lineHeightPx ?? size.lineHeight,
      fontFamily: family,
      fontStyle: weight === 400 ? "normal" : String(weight),
      fill: resolveColor(tokens, t?.color) ?? tokens.text,
      align: t?.align ?? "left",
      letterSpacing: (t?.letterSpacingEm ?? tokens.letterSpacing) * fontSize,
      ellipsis: !!t?.truncate,
      wrap: t?.truncate && !maxLines ? "none" : "word",
      textTransform: t?.uppercase || tokens.headingTransform === "uppercase" ? "uppercase" : "none",
      direction: dirFor((i18n.resolvedLanguage ?? i18n.language ?? "en") as Locale),
    };
  }, [t, tokens, maxLines, i18n.resolvedLanguage, i18n.language]);

  const display = typo.textTransform === "uppercase" ? text.toUpperCase() : text;

  const measure = useCallback(
    (width: number, widthMode: MeasureMode) => {
      const m = getMeasurer();
      m.setAttrs({
        text: display,
        fontSize: typo.fontSize,
        fontFamily: typo.fontFamily,
        fontStyle: typo.fontStyle,
        lineHeight: typo.lineHeightPx / typo.fontSize,
        letterSpacing: typo.letterSpacing,
        wrap: typo.wrap,
        ellipsis: typo.ellipsis,
        width: widthMode === MeasureMode.Undefined ? undefined : undefined,
      });
      // Unconstrained: natural single/multi-line width.
      m.width("auto" as unknown as number);
      const natural = { width: m.getWidth() as number, height: m.getHeight() as number };
      if (widthMode === MeasureMode.Undefined || natural.width <= width) {
        return { width: Math.ceil(natural.width), height: Math.ceil(measuredHeight(m, maxLines, typo)) };
      }
      m.width(Math.max(0, width));
      return { width: Math.ceil(width), height: Math.ceil(measuredHeight(m, maxLines, typo)) };
    },
    [display, typo, maxLines]
  );

  const handleLayout = useCallback((rect: LayoutRect) => {
    rectRef.current = rect;
    const node = nodeRef.current;
    if (node) {
      node.width(rect.width);
      node.height(rect.height);
    }
  }, []);

  return (
    <Box
      name={name ?? "text"}
      measure={measure}
      onLayout={handleLayout}
      listening={listening}
      // register for font-invalidation via ref callback on the Box handle
      ref={(box) => {
        if (box?.handle) {
          registerMeasureHandle(box.handle);
        }
      }}
    >
      <KonvaText
        ref={nodeRef}
        text={display}
        fontSize={typo.fontSize}
        fontFamily={typo.fontFamily}
        fontStyle={typo.fontStyle}
        lineHeight={typo.lineHeightPx / typo.fontSize}
        letterSpacing={typo.letterSpacing}
        fill={typo.fill}
        align={typo.align}
        wrap={typo.wrap}
        ellipsis={typo.ellipsis}
        direction={typo.direction}
        perfectDrawEnabled={false}
        listening={false}
      />
    </Box>
  );
}

function measuredHeight(m: Konva.Text, maxLines: number | undefined, typo: ResolvedTypography): number {
  const naturalHeight = m.getHeight() as number;
  if (!maxLines) return naturalHeight;
  return Math.min(naturalHeight, maxLines * typo.lineHeightPx);
}
