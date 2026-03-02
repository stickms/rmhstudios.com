/**
 * drawSprite.ts — Pure function to draw SpriteConfig + entity transform to canvas context.
 * Supports rotation modes, hit flash overlay, shadow rendering,
 * and runtime background removal for AI-generated sprites.
 */

import type { SpriteConfig } from './sprites';
import { getCachedImage } from './SpriteLoader';

// ── Runtime background removal cache ────────────────────────────────────────
const cleanedCache = new Map<string, HTMLCanvasElement>();

/**
 * Remove background pixels from an image (both dark AND light backgrounds).
 * Dark pixels (R,G,B all below darkThreshold) → alpha zeroed.
 * Light pixels (R,G,B all above lightThreshold) → alpha zeroed.
 * Smooth falloff avoids harsh edges.
 */
function getCleanedImage(img: HTMLImageElement, url: string): HTMLCanvasElement {
    const cached = cleanedCache.get(url);
    if (cached) return cached;

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const offCtx = offscreen.getContext('2d')!;
    offCtx.drawImage(img, 0, 0, w, h);

    const imageData = offCtx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const darkThreshold = 30;
    const darkUpper = 50;
    const lightThreshold = 230;
    const lightLower = 210;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const maxCh = Math.max(r, g, b);
        const minCh = Math.min(r, g, b);
        // Remove dark backgrounds
        if (maxCh < darkThreshold) {
            data[i + 3] = 0;
        } else if (maxCh < darkUpper) {
            data[i + 3] = Math.floor(data[i + 3] * (maxCh - darkThreshold) / (darkUpper - darkThreshold));
        }
        // Remove light/white backgrounds
        else if (minCh > lightThreshold) {
            data[i + 3] = 0;
        } else if (minCh > lightLower) {
            data[i + 3] = Math.floor(data[i + 3] * (lightThreshold - minCh) / (lightThreshold - lightLower));
        }
    }

    offCtx.putImageData(imageData, 0, 0);
    cleanedCache.set(url, offscreen);
    return offscreen;
}

export interface EntityTransform {
    x: number;       // screen x
    y: number;       // screen y
    radius: number;  // screen-scaled radius
    angle: number;   // rotation angle (radians)
    vx?: number;     // velocity x (for velocity-based rotation)
    vy?: number;     // velocity y
    hitFlashUntil?: number; // timestamp — if now < this, draw hit flash
    aimAngle?: number; // for 'aim' rotation mode
}

/**
 * Draw a sprite at the given screen position.
 * Returns true if sprite was drawn, false if fallback needed.
 */
export function drawSprite(
    ctx: CanvasRenderingContext2D,
    config: SpriteConfig,
    transform: EntityTransform,
    now: number,
    scale: number = 1,
): boolean {
    const rawImg = getCachedImage(config.url);
    if (!rawImg) return false;

    // Use cleaned image (bg removed) or raw
    const shouldClean = config.removeBackground !== false; // default true
    const img: HTMLCanvasElement | HTMLImageElement = shouldClean
        ? getCleanedImage(rawImg, config.url)
        : rawImg;

    const drawSize = transform.radius * 2 * config.scale * scale;
    const halfSize = drawSize / 2;

    // Calculate rotation
    let rotation = 0;
    switch (config.rotationMode) {
        case 'aim':
            rotation = transform.aimAngle ?? transform.angle;
            break;
        case 'velocity':
            if (transform.vx !== undefined && transform.vy !== undefined) {
                const speed = Math.sqrt(transform.vx * transform.vx + transform.vy * transform.vy);
                if (speed > 0.1) {
                    rotation = Math.atan2(transform.vy, transform.vx);
                }
            }
            break;
        case 'none':
        default:
            rotation = 0;
            break;
    }

    ctx.save();
    ctx.translate(transform.x, transform.y);

    // Shadow
    if (config.shadow) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(2, 4, halfSize * 0.7, halfSize * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // Glow effect — skip shadowBlur for performance
    // (glow is handled by sprite itself)

    // Apply rotation
    if (rotation !== 0) {
        ctx.rotate(rotation);
    }

    // Draw the sprite
    ctx.drawImage(
        img,
        -halfSize * config.anchorX * 2,
        -halfSize * config.anchorY * 2,
        drawSize,
        drawSize,
    );

    // Hit flash — additive blend overlay for 80ms
    const isFlashing = transform.hitFlashUntil !== undefined && now < transform.hitFlashUntil;
    if (isFlashing) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.6;
        ctx.drawImage(
            img,
            -halfSize * config.anchorX * 2,
            -halfSize * config.anchorY * 2,
            drawSize,
            drawSize,
        );
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    ctx.restore();
    return true;
}

/**
 * Draw a bobbing/pulsing pickup sprite.
 */
export function drawPickupSprite(
    ctx: CanvasRenderingContext2D,
    config: SpriteConfig,
    x: number,
    y: number,
    time: number,
    scale: number = 1,
): boolean {
    const rawImg = getCachedImage(config.url);
    if (!rawImg) return false;

    const shouldClean = config.removeBackground !== false;
    const img: HTMLCanvasElement | HTMLImageElement = shouldClean
        ? getCleanedImage(rawImg, config.url)
        : rawImg;

    const bob = Math.sin(time * 3) * 3;
    const pulse = 0.9 + Math.sin(time * 4) * 0.1;
    const drawSize = 20 * config.scale * scale * pulse;
    const halfSize = drawSize / 2;

    ctx.save();
    ctx.translate(x, y + bob);

    ctx.drawImage(img, -halfSize, -halfSize, drawSize, drawSize);

    ctx.restore();
    return true;
}
