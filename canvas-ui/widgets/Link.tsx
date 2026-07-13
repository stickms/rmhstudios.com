/**
 * CanvasLink — router-integrated link. Click/tap on the canvas navigates via
 * TanStack Router; the real <a href> lives in the a11y mirror, preserving
 * crawler discovery, middle-click/cmd-click, and screen-reader semantics.
 */

import { useState, type ReactNode } from "react";
import { Box } from "../runtime/layout/LayoutTree";
import { CanvasText } from "../text/Text";
import { tw, type TwStyle } from "../runtime/tw";
import { useCanvasEnv } from "../runtime/env";
import { useMirrorControl } from "../mirror/MirrorControls";
import { setCursor } from "./cursor";

export interface CanvasLinkProps {
  to: string;
  children: string | ReactNode;
  label?: string;
  style?: TwStyle;
  /** tw text classes when children is a plain string. */
  textStyle?: string;
  external?: boolean;
  name?: string;
}

export function CanvasLink({ to, children, label, style, textStyle, external, name }: CanvasLinkProps) {
  const env = useCanvasEnv();
  const [hover, setHover] = useState(false);

  const navigate = () => {
    if (external) window.open(to, "_blank", "noopener");
    else env.navigate(to);
  };

  useMirrorControl({
    role: "link",
    label: label ?? (typeof children === "string" ? children : to),
    href: to,
    onActivate: navigate,
  });

  return (
    <Box
      name={name ?? "link"}
      style={style ?? tw("flex flex-row items-center")}
      onClick={navigate}
      onTap={navigate}
      onMouseEnter={(e) => {
        setHover(true);
        setCursor(e, "pointer");
      }}
      onMouseLeave={(e) => {
        setHover(false);
        setCursor(e, "default");
      }}
    >
      {typeof children === "string" ? (
        <CanvasText style={textStyle ?? (hover ? "text-site-text text-sm" : "text-site-accent text-sm")}>
          {children}
        </CanvasText>
      ) : (
        children
      )}
    </Box>
  );
}
