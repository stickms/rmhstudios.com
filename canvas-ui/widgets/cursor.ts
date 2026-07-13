/** Cursor management for canvas hit targets. */

import type Konva from "konva";

export function setCursor(e: Konva.KonvaEventObject<unknown>, cursor: "pointer" | "default" | "text" | "grab") {
  const container = e.target.getStage()?.container();
  if (container) container.style.cursor = cursor;
}
