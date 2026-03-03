/**
 * Athora — Avatar Sprite Compositor
 *
 * Composites a user's profile picture onto a base sprite body to create
 * a personalized walking sprite sheet.
 *
 * Base body sprites have a transparent "face slot" that gets replaced
 * with the circular-cropped profile picture.
 */

interface CompositorConfig {
  profileImageUrl: string;
  bodyVariant: string; // "default", "suit", "casual", "hoodie"
  bodyColor?: string;
  accessoryIds?: string[];
}

interface FaceRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
  visible: boolean;
}

// Face size (same for all directions — always a uniform circle).
// The circle is drawn at FACE_SIZE × FACE_SIZE pixels, centered at
// per-direction x/y offsets so it sits on the body's shoulders.
const FACE_SIZE = 46;

// Face region definitions per direction (pixel coords within each 64×96 frame).
// Bodies use LPC headless bases — the shoulders start around y:40-48.
// x/y position the top-left of the FACE_SIZE square within each frame.
const FACE_REGIONS: Record<string, FaceRegion> = {
  SOUTH:     { x: 9,  y: 24, w: FACE_SIZE, h: FACE_SIZE, scale: 1.0, visible: true },
  SOUTHWEST: { x: 7,  y: 24, w: FACE_SIZE, h: FACE_SIZE, scale: 1.0, visible: true },
  WEST:      { x: 4,  y: 24, w: FACE_SIZE, h: FACE_SIZE, scale: 1.0, visible: true },
  NORTHWEST: { x: 6,  y: 24, w: FACE_SIZE, h: FACE_SIZE, scale: 1.0, visible: true },
  NORTH:     { x: 9,  y: 24, w: FACE_SIZE, h: FACE_SIZE, scale: 1.0, visible: true },
  NORTHEAST: { x: 12, y: 24, w: FACE_SIZE, h: FACE_SIZE, scale: 1.0, visible: true },
  EAST:      { x: 14, y: 24, w: FACE_SIZE, h: FACE_SIZE, scale: 1.0, visible: true },
  SOUTHEAST: { x: 11, y: 24, w: FACE_SIZE, h: FACE_SIZE, scale: 1.0, visible: true },
};

const DIRECTIONS = [
  "SOUTH",
  "SOUTHWEST",
  "WEST",
  "NORTHWEST",
  "NORTH",
  "NORTHEAST",
  "EAST",
  "SOUTHEAST",
];
const FRAMES_PER_DIR = 5; // 4 walk + 1 idle
const FRAME_W = 64;
const FRAME_H = 96;

export async function compositeAvatarSpriteSheet(
  config: CompositorConfig
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = FRAME_W * FRAMES_PER_DIR; // 320
  canvas.height = FRAME_H * DIRECTIONS.length; // 768
  const ctx = canvas.getContext("2d")!;

  // 1. Load base body sprite sheet
  const bodySheet = await loadImage(
    `/assets/athora/avatars/bodies/${config.bodyVariant}.png`
  );

  // 2. Load profile picture (skip if no URL)
  let faceCanvas: HTMLCanvasElement | null = null;
  if (config.profileImageUrl) {
    try {
      const profileImg = await loadImage(config.profileImageUrl);
      faceCanvas = createCircularFace(profileImg, 64);
    } catch {
      // Profile image failed to load — continue without face
    }
  }

  // 4. Optionally tint the body
  let bodyCanvas: HTMLCanvasElement | HTMLImageElement = bodySheet;
  if (config.bodyColor) {
    bodyCanvas = tintImage(bodySheet, config.bodyColor);
  }

  // 5. Draw body sheet
  ctx.drawImage(bodyCanvas, 0, 0);

  // 6. Overlay face onto each frame (if profile loaded)
  if (faceCanvas) {
    for (let dirIdx = 0; dirIdx < DIRECTIONS.length; dirIdx++) {
      const dir = DIRECTIONS[dirIdx];
      const region = FACE_REGIONS[dir];

      if (!region.visible) continue;

      for (let frame = 0; frame < FRAMES_PER_DIR; frame++) {
        const frameX = frame * FRAME_W;
        const frameY = dirIdx * FRAME_H;

        // Walking frames have slight vertical bob
        const bobOffset = frame < 4 ? [0, -1, 0, 1][frame] : 0;

        const faceW = region.w * region.scale;
        const faceH = region.h * region.scale;
        const faceX = frameX + region.x + (region.w - faceW) / 2;
        const faceY = frameY + region.y + (region.h - faceH) / 2 + bobOffset;

        ctx.drawImage(faceCanvas, faceX, faceY, faceW, faceH);
      }
    }
  }

  // 7. Layer accessories
  if (config.accessoryIds?.length) {
    for (const accId of config.accessoryIds) {
      try {
        const accSheet = await loadImage(
          `/assets/athora/avatars/accessories/${accId}.png`
        );
        ctx.drawImage(accSheet, 0, 0);
      } catch {
        // Accessory not found, skip
      }
    }
  }

  return canvas;
}

/** Crops an image into a circle */
function createCircularFace(
  img: HTMLImageElement,
  size: number
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;

  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  const minDim = Math.min(img.width, img.height);
  const sx = (img.width - minDim) / 2;
  const sy = (img.height - minDim) / 2;
  ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

  return c;
}

/** Apply a color tint to an image */
function tintImage(
  img: HTMLImageElement,
  color: string
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = "destination-atop";
  ctx.drawImage(img, 0, 0);
  return c;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export { DIRECTIONS, FRAMES_PER_DIR, FRAME_W, FRAME_H, FACE_REGIONS };
