# Athora Asset Manifest

All assets go under `public/assets/athora/`. The engine expects specific
filenames and layouts documented below.

---

## Tilesets

### `tilesets/terrain.png`

**Required.** The main terrain tileset used by the template tile map generator.

- **Tile size:** 32×32 pixels
- **Grid:** 10 columns × 6 rows = 60 tiles total
- **Image dimensions:** 320×192 pixels

#### Tile layout (index = row × 10 + col):

| Row | Cols 0-4 | Cols 5-9 |
|-----|----------|----------|
| 0 | Grass variants (light→dark) | Flowers, weeds, moss |
| 1 | Dirt/path (plain, worn, horiz, vert, cross) | Sand variants |
| 2 | Stone floor variants + edge | Wood floor variants + edge |
| 3 | Carpet variants + edge | Tile floor variants |
| 4 | Water variants + edge | Dark/void variants |
| 5 | Wall (top, side, corner, door, window) | Decorative (rug, mat, etc) |

### Sourcing

Assemble from **[LPC] Terrains** (OpenGameArt) or create a custom 320×192
spritesheet following the layout above.

---

## Avatar Bodies

### `avatars/bodies/{variant}.png`

One file per body variant: `default.png`, `suit.png`, `casual.png`, `hoodie.png`.

- **Frame size:** 64×96 pixels
- **Grid:** 5 columns (4 walk + 1 idle) × 8 rows (directions)
- **Sheet dimensions:** 320×768 pixels
- **Directions (row order):** S, SW, W, NW, N, NE, E, SE
- **Head region:** Transparent — profile photo is composited in at runtime

### Sourcing

Use **LPC Character Bases** (headless bodies) from OpenGameArt, cropped/reformatted
to the 320×768 layout, or create custom body sprites.

---

## Avatar Accessories

### `avatars/accessories/{id}.png`

Same dimensions as body sheets (320×768). Rendered as overlay on top of the body.

Files: `hat-beanie.png`, `hat-cap.png`, `glasses-round.png`, `glasses-shades.png`, `headphones.png`

---

## Props (optional)

### `props/{name}.png`

Standalone decoration sprites for room furniture. Not used by the template
generator but available for custom room layouts.
