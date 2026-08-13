/**
 * Where the attachments of a post go on its card.
 *
 * This is the photo grid every social embed uses — one fills the box, two split
 * it down the middle, three put one tall tile beside two stacked ones, four
 * make a 2×2 — expressed as plain geometry so it can be tested without a
 * renderer. It is client-safe on purpose: it describes a layout, it does not
 * touch an image.
 *
 * The one invariant worth stating, because satori will not enforce it and does
 * not clip: **every tile is inside the box**. Tiles are laid out from both
 * edges rather than by repeatedly adding a rounded half-width — the second
 * column starts at `width - half` instead of `half + gap`, so integer rounding
 * can only ever make the gutter a pixel wider, never push a tile over the edge
 * or leave a hairline of pane showing down the right-hand side.
 */

export interface TileBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CollageBox {
  width: number;
  height: number;
}

/** How many attachments a card draws. The rest are counted, not shown. */
export const MAX_COLLAGE_TILES = 4;

/**
 * The tiles for `count` pictures inside `box`, separated by `gap`.
 *
 * Returns an empty array for a count of zero, and never more than
 * `MAX_COLLAGE_TILES` entries — a post cannot carry more than four images, but
 * the clamp is here rather than assumed so a caller that grows the limit gets a
 * shorter grid instead of a broken one.
 */
export function collageTiles(count: number, box: CollageBox, gap: number): TileBox[] {
  const n = Math.min(Math.max(Math.floor(count), 0), MAX_COLLAGE_TILES);
  if (n === 0) return [];

  const { width: W, height: H } = box;
  const halfW = Math.floor((W - gap) / 2);
  const halfH = Math.floor((H - gap) / 2);
  const rightX = W - halfW;
  const lowerY = H - halfH;

  switch (n) {
    case 1:
      return [{ left: 0, top: 0, width: W, height: H }];
    case 2:
      return [
        { left: 0, top: 0, width: halfW, height: H },
        { left: rightX, top: 0, width: halfW, height: H },
      ];
    case 3:
      // The tall tile leads, as it does on every consumer of this shape: the
      // first attachment is the one the author chose first.
      return [
        { left: 0, top: 0, width: halfW, height: H },
        { left: rightX, top: 0, width: halfW, height: halfH },
        { left: rightX, top: lowerY, width: halfW, height: halfH },
      ];
    default:
      return [
        { left: 0, top: 0, width: halfW, height: halfH },
        { left: rightX, top: 0, width: halfW, height: halfH },
        { left: 0, top: lowerY, width: halfW, height: halfH },
        { left: rightX, top: lowerY, width: halfW, height: halfH },
      ];
  }
}
