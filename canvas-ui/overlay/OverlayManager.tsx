/**
 * Overlay manager — the sanctioned escape hatch for content that physically
 * cannot render into a 2D canvas: cross-origin iframes (YouTube/Twitch,
 * rmhvibe sandbox, wiki-race), WebGL game canvases, and maplibre maps.
 *
 * An `<OverlaySlot>` in a scene is a yoga Box that reports its computed
 * viewport rect into this store; `<OverlayRoot>` (DOM sibling of the stage)
 * absolutely positions the registered DOM content over that rect. Every
 * overlay carries `data-overlay-allow` — the Playwright census asserts that
 * any visible non-canvas element sits inside `#overlay-root` with an
 * allowlisted kind for its route.
 */

import { create } from "zustand";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Box, type LayoutRect, type BoxProps } from "../runtime/layout/LayoutTree";

export interface OverlayEntry {
  id: string;
  /** Allowlist kind, e.g. "iframe-youtube", "webgl-game", "maplibre". */
  kind: string;
  rect: LayoutRect;
  content: ReactNode;
  /** Layer under (-1) or over (1) the Konva canvas. Default over. */
  z: -1 | 1;
}

interface OverlayStore {
  entries: Map<string, OverlayEntry>;
  upsert: (entry: OverlayEntry) => void;
  remove: (id: string) => void;
}

export const useOverlayStore = create<OverlayStore>((set) => ({
  entries: new Map(),
  upsert: (entry) =>
    set((s) => {
      const entries = new Map(s.entries);
      entries.set(entry.id, entry);
      return { entries };
    }),
  remove: (id) =>
    set((s) => {
      const entries = new Map(s.entries);
      entries.delete(id);
      return { entries };
    }),
}));

export interface OverlaySlotProps extends Pick<BoxProps, "style" | "name"> {
  kind: string;
  children: ReactNode; // DOM content rendered into the overlay root
  under?: boolean;
}

/** Reserve layout space in the scene and project DOM content onto it. */
export function OverlaySlot({ kind, children, under, style, name }: OverlaySlotProps) {
  const id = useId();
  const upsert = useOverlayStore((s) => s.upsert);
  const remove = useOverlayStore((s) => s.remove);
  const contentRef = useRef(children);
  contentRef.current = children;

  useEffect(() => () => remove(id), [id, remove]);

  return (
    <Box
      name={name ?? `overlay-slot-${kind}`}
      style={style}
      onLayout={(rect) => {
        // Rect is group-local; walk to absolute viewport coordinates via the
        // Konva transform when the group is attached.
        upsert({ id, kind, rect, content: contentRef.current, z: under ? -1 : 1 });
      }}
      ref={(box) => {
        const group = box?.group;
        if (group && box.handle) {
          box.handle.onLayout(() => {
            const abs = group.getClientRect({ skipShadow: true, skipStroke: true });
            upsert({
              id,
              kind,
              rect: { x: abs.x, y: abs.y, width: abs.width, height: abs.height },
              content: contentRef.current,
              z: under ? -1 : 1,
            });
          });
        }
      }}
    />
  );
}

/** The DOM host for overlays — rendered by StageHost beside the canvas. */
export function OverlayRoot() {
  const entries = useOverlayStore((s) => s.entries);
  if (entries.size === 0) return null;
  return (
    <div id="overlay-root" style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
      {[...entries.values()].map((e) => (
        <div
          key={e.id}
          data-overlay-allow={e.kind}
          style={{
            position: "absolute",
            left: e.rect.x,
            top: e.rect.y,
            width: e.rect.width,
            height: e.rect.height,
            pointerEvents: "auto",
            zIndex: e.z,
          }}
        >
          {e.content}
        </div>
      ))}
    </div>
  );
}
