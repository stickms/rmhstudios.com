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

// Face region definitions per direction (pixel coords within each 64×96 frame).
// Bodies use LPC headless bases with 32px transparent padding at top.
// The profile circle sits in this top pad area, centered above the neck.
const FACE_REGIONS: Record<string, FaceRegion> = {
  SOUTH: { x: 18, y: 2, w: 28, h: 28, scale: 1.0, visible: true },
  SOUTHWEST: { x: 14, y: 2, w: 26, h: 28, scale: 0.95, visible: true },
  WEST: { x: 10, y: 4, w: 24, h: 26, scale: 0.85, visible: true },
  NORTHWEST: { x: 14, y: 4, w: 24, h: 26, scale: 0.8, visible: true },
  NORTH: { x: 18, y: 4, w: 28, h: 28, scale: 0.0, visible: false },
  NORTHEAST: { x: 26, y: 4, w: 24, h: 26, scale: 0.8, visible: true },
  EAST: { x: 30, y: 4, w: 24, h: 26, scale: 0.85, visible: true },
  SOUTHEAST: { x: 22, y: 2, w: 26, h: 28, scale: 0.95, visible: true },
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

  // 2. Load profile picture
  const profileImg = await loadImage(config.profileImageUrl);

  // 3. Create circular face texture
  const faceCanvas = createCircularFace(profileImg, 48);

  // 4. Optionally tint the body
  let bodyCanvas: HTMLCanvasElement | HTMLImageElement = bodySheet;
  if (config.bodyColor) {
    bodyCanvas = tintImage(bodySheet, config.bodyColor);
  }

  // 5. Draw body sheet
  ctx.drawImage(bodyCanvas, 0, 0);

  // 6. Overlay face onto each frame
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
