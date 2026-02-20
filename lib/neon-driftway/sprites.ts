/**
 * SpriteSheet loader for atlas-based sprite rendering.
 * Loads a single spritesheet image and draws sub-regions (non-uniform rects).
 */

/** Pixel coordinates within the spritesheet image */
export interface SpriteRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** Full sprite definition with optional anchor pivot and visual scale */
export interface SpriteDef {
  rect: SpriteRect;
  /** Normalized 0..1 anchor point. Default (0.5, 0.5) = center */
  pivot?: { x: number; y: number };
  /** Visual-only scale multiplier (does NOT affect physics hitbox). Default 1 */
  drawScale?: number;
}

/** Sets canvas context to pixel-art mode (no smoothing) */
export function setPixelArt(ctx: CanvasRenderingContext2D): void {
  ctx.imageSmoothingEnabled = false;
}

export class SpriteSheet {
  readonly img: HTMLImageElement;
  ready = false;

  constructor(src: string) {
    this.img = new Image();
    this.img.onload = () => {
      this.ready = true;
    };
    this.img.onerror = () => {
      console.warn(`[SpriteSheet] Failed to load: ${src}`);
    };
    this.img.src = src;
  }

  /**
   * Draw a sprite from the atlas.
   * @param ctx  Canvas 2D context
   * @param def  Sprite definition (rect + pivot + drawScale)
   * @param x    Entity center X (world coords)
   * @param y    Entity center Y (world coords)
   * @param w    Entity physics width
   * @param h    Entity physics height
   */
  draw(
    ctx: CanvasRenderingContext2D,
    def: SpriteDef,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    if (!this.ready) return;

    const { rect } = def;
    const scale = def.drawScale ?? 1;
    const pivotX = def.pivot?.x ?? 0.5;
    const pivotY = def.pivot?.y ?? 0.5;

    const dw = w * scale;
    const dh = h * scale;
    const dx = x - dw * pivotX;
    const dy = y - dh * pivotY;

    ctx.drawImage(
      this.img,
      rect.sx, rect.sy, rect.sw, rect.sh, // source rect
      dx, dy, dw, dh,                       // destination rect
    );
  }
}
