/**
 * Canvas text input (single-line) and Textarea (multi-line).
 *
 * The visible field is drawn in Konva (border, placeholder, value); real
 * keystrokes/IME/paste/autocorrect go through the shared hidden `<textarea>`
 * proxy (`helpers/HelperRoot`), moved to the field's caret coordinates while
 * focused. The proxy registers `autocomplete`/`inputmode`/`enterkeyhint`, so
 * password managers and mobile keyboards work.
 *
 * Value is controlled (`value`/`onChange`) exactly like the DOM `<input>` it
 * replaces; a11y comes from the input's mirror registration.
 */

import { useId, useRef, useState } from "react";
import { Text as KonvaText } from "react-konva";
import { Box, type LayoutRect } from "../runtime/layout/LayoutTree";
import { tw, type TwStyle } from "../runtime/tw";
import { useTheme } from "../theme/useTheme";
import { useInputProxyStore } from "../helpers/HelperRoot";
import { useMirrorControl } from "../mirror/MirrorControls";
import { setCursor } from "./cursor";
import { TEXT_SIZES } from "../theme/tokens";

export interface InputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  multiline?: boolean;
  password?: boolean;
  autocomplete?: string;
  inputMode?: "text" | "email" | "numeric" | "tel" | "url" | "search";
  enterKeyHint?: string;
  onSubmit?: () => void;
  disabled?: boolean;
  style?: TwStyle;
  name?: string;
  /** Fixed height for multiline; single-line is 40px. */
  minHeight?: number;
}

export function Input({
  value,
  onChange,
  placeholder,
  label,
  multiline,
  password,
  autocomplete,
  inputMode,
  enterKeyHint,
  onSubmit,
  disabled,
  style,
  name,
  minHeight,
}: InputProps) {
  const id = useId();
  const tokens = useTheme();
  const [focused, setFocused] = useState(false);
  const rectRef = useRef<LayoutRect | null>(null);
  const focusProxy = useInputProxyStore((s) => s.focus);
  const blurProxy = useInputProxyStore((s) => s.blur);

  const beginEdit = () => {
    if (disabled) return;
    setFocused(true);
    const rect = rectRef.current;
    focusProxy({
      id,
      value,
      multiline: !!multiline,
      inputMode,
      autocomplete,
      enterKeyHint,
      caret: rect ? { x: rect.x + 8, y: rect.y + 8 } : { x: 0, y: 0 },
      onChange: (next) => onChange(next),
      onSubmit,
      onBlur: () => {
        setFocused(false);
        blurProxy(id);
      },
    });
  };

  useMirrorControl({
    role: "button",
    label: `${label}${value ? `: ${password ? "•".repeat(value.length) : value}` : ""}`,
    disabled,
    onActivate: beginEdit,
  });

  const display = password && value ? "•".repeat(value.length) : value;
  const showPlaceholder = !value;
  const size = TEXT_SIZES.sm;
  const h = multiline ? (minHeight ?? 96) : 40;

  const base = tw(
    `flex flex-col w-full px-3 py-2 rounded-site-sm bg-site-surface border ${
      focused ? "border-site-accent" : "border-site-border"
    }`
  );
  const merged: TwStyle = style
    ? { ...base, layout: { ...base.layout, ...style.layout, height: h }, paint: { ...base.paint, ...style.paint } }
    : { ...base, layout: { ...base.layout, height: h } };

  return (
    <Box
      name={name ?? "input"}
      style={merged}
      opacity={disabled ? 0.5 : 1}
      onClick={beginEdit}
      onTap={beginEdit}
      onMouseEnter={(e) => !disabled && setCursor(e, "text")}
      onMouseLeave={(e) => setCursor(e, "default")}
      onLayout={(rect) => {
        rectRef.current = rect;
      }}
    >
      <KonvaText
        text={showPlaceholder ? (placeholder ?? "") : display}
        fontSize={size.fontSize}
        fontFamily={tokens.fontBody}
        lineHeight={size.lineHeight / size.fontSize}
        fill={showPlaceholder ? tokens.textDim : tokens.text}
        wrap={multiline ? "word" : "none"}
        ellipsis={!multiline}
        listening={false}
        perfectDrawEnabled={false}
      />
    </Box>
  );
}

export function Textarea(props: Omit<InputProps, "multiline">) {
  return <Input {...props} multiline />;
}
