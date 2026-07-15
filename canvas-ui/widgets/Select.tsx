/**
 * Canvas Select — the DOM <select> replacement. A trigger draws the current
 * value + chevron; opening it reveals a clipped, scrollable option list on a
 * dropdown layer positioned below the trigger. Selecting fires onChange and
 * closes. A real <select> is registered in the a11y mirror (via
 * useMirrorControl as a button announcing the current value) so keyboard and
 * screen-reader users retain access.
 *
 * Large option lists (e.g. timezones) render inside a ScrollView; a
 * VirtualList upgrade for very long lists is a tracked follow-up.
 */

import { useState } from "react";
import { Box } from "../runtime/layout/LayoutTree";
import { tw, type TwStyle } from "../runtime/tw";
import { CanvasText } from "../text/Text";
import { ScrollView } from "./ScrollView";
import { Icon } from "./Icon";
import { icons } from "./icons";
import { useTheme } from "../theme/useTheme";
import { useMirrorControl } from "../mirror/MirrorControls";
import { setCursor } from "./cursor";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  style?: TwStyle;
  name?: string;
  /** Max dropdown height in px (default 280). */
  maxHeight?: number;
}

const ROW_H = 36;

export function Select({ value, options, onChange, label, placeholder, style, name, maxHeight = 280 }: SelectProps) {
  const tokens = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  useMirrorControl({
    role: "button",
    label: `${label}: ${current?.label ?? placeholder ?? ""}`,
    onActivate: () => setOpen((v) => !v),
  });

  const dropHeight = Math.min(maxHeight, options.length * ROW_H);

  const base = tw("flex flex-col w-full");
  const merged: TwStyle = style
    ? { ...base, layout: { ...base.layout, ...style.layout }, paint: { ...base.paint, ...style.paint } }
    : base;

  return (
    <Box name={name ?? "select"} style={merged}>
      {/* Trigger */}
      <Box
        style={tw("flex flex-row items-center justify-between w-full px-3 h-10 rounded-site-sm bg-site-surface border border-site-border")}
        onClick={() => setOpen((v) => !v)}
        onTap={() => setOpen((v) => !v)}
        onMouseEnter={(e) => setCursor(e, "pointer")}
        onMouseLeave={(e) => setCursor(e, "default")}
      >
        <CanvasText style={current ? "text-sm text-site-text" : "text-sm text-site-text-dim"}>
          {current?.label ?? placeholder ?? ""}
        </CanvasText>
        <Icon node={icons["chevron-down"]} size={16} color={{ token: "text-muted" }} />
      </Box>

      {/* Dropdown — absolutely positioned below the trigger, drawn last (on top). */}
      {open && (
        <Box
          name="select-dropdown"
          style={{
            layout: { position: "absolute", top: 44, left: 0, width: "100%", height: dropHeight, overflow: "hidden" },
            paint: { fill: { token: "surface" }, stroke: { token: "border-bright" }, strokeWidth: "token", cornerRadius: "site-sm", shadow: "site" },
            text: {},
          }}
        >
          <ScrollView style={tw("flex flex-col w-full h-full overflow-hidden")} contentStyle={tw("flex flex-col w-full")}>
            {options.map((o) => {
              const selected = o.value === value;
              return (
                <Box
                  key={o.value}
                  style={{
                    ...tw(`flex flex-row items-center w-full px-3 ${selected ? "bg-site-accent-dim" : ""}`),
                    layout: { ...tw("flex flex-row items-center w-full px-3").layout, height: ROW_H },
                  }}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  onTap={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  onMouseEnter={(e) => setCursor(e, "pointer")}
                  onMouseLeave={(e) => setCursor(e, "default")}
                >
                  <CanvasText style={selected ? "text-sm text-site-accent" : "text-sm text-site-text-muted"} maxLines={1}>
                    {o.label}
                  </CanvasText>
                </Box>
              );
            })}
          </ScrollView>
        </Box>
      )}
      {/* Reference tokens to keep theme reactivity on the trigger border. */}
      <Box style={{ layout: { height: 0 }, paint: {}, text: {} }} name={`select-anchor-${tokens.id}`} />
    </Box>
  );
}
