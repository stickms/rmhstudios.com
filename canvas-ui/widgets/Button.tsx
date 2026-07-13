/**
 * Canvas Button — the CVA-variant contract of components/ui/button.tsx
 * redrawn in Konva: token colors, site radius, hover/active states via
 * pointer events, cursor management, and automatic a11y-mirror registration
 * (a real <button> screen readers can activate).
 */

import { useRef, useState } from "react";
import type Konva from "konva";
import { Box, type BoxProps } from "../runtime/layout/LayoutTree";
import { CanvasText } from "../text/Text";
import { tw, type TwStyle } from "../runtime/tw";
import { useMirrorControl } from "../mirror/MirrorControls";
import { setCursor } from "./cursor";

export type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "default" | "lg";

const VARIANT_BASE: Record<ButtonVariant, string> = {
  default: "bg-site-accent",
  secondary: "bg-site-surface border border-site-border",
  outline: "bg-transparent border border-site-border",
  ghost: "bg-transparent",
  danger: "bg-site-danger",
};

const VARIANT_HOVER: Record<ButtonVariant, string> = {
  default: "bg-site-accent-hover",
  secondary: "bg-site-surface-hover border border-site-border-bright",
  outline: "bg-site-surface-hover border border-site-border-bright",
  ghost: "bg-site-surface-hover",
  danger: "bg-site-danger",
};

const VARIANT_TEXT: Record<ButtonVariant, string> = {
  default: "text-site-accent-fg font-medium",
  secondary: "text-site-text font-medium",
  outline: "text-site-text font-medium",
  ghost: "text-site-text-muted font-medium",
  danger: "text-white font-medium",
};

const SIZE_CLASSES: Record<ButtonSize, { box: string; text: string }> = {
  sm: { box: "px-3 h-8 gap-1.5 rounded-site-sm", text: "text-sm" },
  default: { box: "px-4 h-10 gap-2 rounded-site-sm", text: "text-sm" },
  lg: { box: "px-6 h-12 gap-2 rounded-site", text: "text-base" },
};

export interface ButtonProps {
  children: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  /** Extra tw classes merged onto the container. */
  style?: TwStyle;
  /** Accessible label when it differs from the visible text. */
  label?: string;
  /** Pass false to opt OUT of the a11y mirror (explicit act). */
  mirror?: boolean;
  name?: string;
  /** Leading icon or custom content. */
  before?: BoxProps["children"];
}

export function Button({
  children,
  onPress,
  variant = "default",
  size = "default",
  disabled,
  style,
  label,
  mirror = true,
  name,
  before,
}: ButtonProps) {
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);
  const groupRef = useRef<Konva.Group | null>(null);

  const { focused } = useMirrorControl(
    mirror === false
      ? false
      : { role: "button", label: label ?? children, disabled, onActivate: onPress }
  );

  const base = SIZE_CLASSES[size];
  const bg = hover && !disabled ? VARIANT_HOVER[variant] : VARIANT_BASE[variant];
  const focusRing = focused ? " border border-site-accent" : "";
  const boxStyle = tw(
    `flex flex-row items-center justify-center ${base.box} ${bg}${focusRing}`
  );
  const merged: TwStyle = style
    ? { ...boxStyle, layout: { ...boxStyle.layout, ...style.layout }, paint: { ...boxStyle.paint, ...style.paint }, text: boxStyle.text }
    : boxStyle;

  return (
    <Box
      name={name ?? "button"}
      style={merged}
      opacity={disabled ? 0.5 : active ? 0.85 : 1}
      onClick={() => !disabled && onPress?.()}
      onTap={() => !disabled && onPress?.()}
      onMouseEnter={(e) => {
        setHover(true);
        if (!disabled) setCursor(e, "pointer");
      }}
      onMouseLeave={(e) => {
        setHover(false);
        setActive(false);
        setCursor(e, "default");
      }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      ref={(r) => {
        groupRef.current = r?.group ?? null;
      }}
    >
      {before}
      <CanvasText style={`${VARIANT_TEXT[variant]} ${base.text}`}>{children}</CanvasText>
    </Box>
  );
}
