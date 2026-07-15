/**
 * LayeredCanvasHost — hosts a game's own rendering surface (2D <canvas> or
 * WebGL/R3F) as a positioned overlay while the Konva scene draws the HUD /
 * chrome around it. Thin wrapper over OverlaySlot: reserves a layout region
 * in the scene and projects the game's DOM (its canvas + any imperative UI)
 * onto that rect via the overlay root.
 *
 * `under` (default true) places the surface BELOW the Konva stage so canvas
 * HUD widgets drawn in the scene appear on top; set false to place a fully
 * self-contained game above. `kind` is the census allowlist tag (e.g.
 * "game-2d", "game-webgl", "maplibre") — the route's manifest entry must list
 * it in overlayAllow.
 */

import { type ReactNode } from "react";
import { OverlaySlot } from "./OverlayManager";
import { tw, type TwStyle } from "../runtime/tw";

export interface LayeredCanvasHostProps {
  kind: string;
  children: ReactNode;
  style?: TwStyle;
  under?: boolean;
  name?: string;
}

export function LayeredCanvasHost({ kind, children, style, under = true, name }: LayeredCanvasHostProps) {
  return (
    <OverlaySlot
      kind={kind}
      under={under}
      name={name ?? `layered-${kind}`}
      style={style ?? tw("flex flex-col flex-1 w-full")}
    >
      {children}
    </OverlaySlot>
  );
}
