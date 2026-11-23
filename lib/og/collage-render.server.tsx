/**
 * A grid of pictures on a card: the post card's attachments, and the apps a section card shows.
 *
 * The geometry is `lib/og/collage` (client-safe, tested without a renderer); this is the part that encodes the
 * pictures for the tiles that geometry gave and draws them, each a `framedImage` (S5: a picture is a box with a 1px
 * rule).
 */

import React from 'react';
import { RADIUS_SM, SCALE } from '@/lib/og/shared.server';
import { framedImage, mediaTag } from '@/lib/og/chrome.server';
import { collageTiles, type CollageBox, type TileBox } from '@/lib/og/collage';
import { encodeOgImage, type OgImage } from '@/lib/og/media.server';

/** Between tiles of the collage. */
const TILE_GAP = 4 * SCALE;

export interface Tile {
  image: OgImage;
  box: TileBox;
}

/**
 * Encode the attachments into the grid for however many of them actually
 * resolved.
 *
 * The second attempt is not paranoia: a post's attachments outlive nothing —
 * media sweeps, storage moves and truncated uploads all happen — and a tile
 * that decodes but won't encode would otherwise leave a hole in a grid that was
 * measured for one more picture than it has.
 */
export async function encodeTiles(buffers: Buffer[], box: CollageBox): Promise<Tile[]> {
  let list = buffers;
  for (let attempt = 0; attempt < 2 && list.length > 0; attempt++) {
    const boxes = collageTiles(list.length, box, TILE_GAP);
    const encoded = await Promise.all(
      list.map((bytes, i) =>
        encodeOgImage(bytes, {
          width: boxes[i].width,
          height: boxes[i].height,
          fit: 'cover',
        }),
      ),
    );
    const survivors = list.filter((_, i) => encoded[i]);
    if (survivors.length === list.length) {
      return boxes.map((tileBox, i) => ({
        box: tileBox,
        image: encoded[i]!,
      }));
    }
    list = survivors;
  }
  return [];
}

export function collage(tiles: Tile[], box: CollageBox, gifTag = false): React.ReactElement {
  // A lone picture takes the pane's own radius; tiles in a grid take a tighter
  // one, so four of them don't read as four separate cards.
  const radius = tiles.length === 1 ? RADIUS_SM : Math.round(RADIUS_SM * 0.6);
  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: box.width,
        height: box.height,
      }}
    >
      {tiles.map((tile, i) => (
        <div
          key={`tile${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: tile.box.left,
            top: tile.box.top,
          }}
        >
          {framedImage(tile.image, radius, i === 0 && gifTag ? mediaTag('GIF', 8 * SCALE) : undefined)}
        </div>
      ))}
    </div>
  );
}
