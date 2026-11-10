/**
 * Procedural Touhou-style danmaku bullet sprites.
 *
 * Each (shape, colour) pair is rendered once onto a cached surface and blitted
 * with `drawImage` at runtime — thousands of bullets per frame stay cheap.
 * Bullets are drawn with the classic danmaku read: a soft luminous glow, a
 * saturated coloured shell, a bright white core and a crisp rim.
 *
 * Directional shapes (rice, kunai, knife, amulet) are drawn pointing +X so the
 * renderer can rotate them by the bullet's travel angle.
 */

import { createSurface, type Surface } from './surface';
import { BULLET_COLORS, BULLET_COLOR_NAMES, hsl, shade, type BulletColorName, type Hsl } from './palette';

export type BulletShape =
    | 'orb' // round danmaku ball (the workhorse)
    | 'pellet' // tiny round
    | 'rice' // small elongated grain
    | 'kunai' // arrow / dart
    | 'knife' // long thin blade
    | 'star' // five-point star
    | 'bubble' // large translucent ring
    | 'amulet' // ofuda talisman card
    | 'orbL' // large ball
    | 'orbXL'; // huge ball

export interface BulletSpriteInfo {
    surface: Surface;
    /** World radius the sprite was authored at; renderer scales from this. */
    designRadius: number;
    /** Whether the sprite should rotate to face its travel direction. */
    directional: boolean;
}

/** Authored radius (collision radius) per shape. */
const SHAPE_RADIUS: Record<BulletShape, number> = {
    pellet: 3,
    rice: 4,
    orb: 6,
    kunai: 6,
    knife: 7,
    star: 7,
    amulet: 7,
    orbL: 11,
    bubble: 13,
    orbXL: 18,
};

const DIRECTIONAL: Record<BulletShape, boolean> = {
    pellet: false,
    rice: true,
    orb: false,
    kunai: true,
    knife: true,
    star: false,
    amulet: true,
    orbL: false,
    bubble: false,
    orbXL: false,
};

export const BULLET_SHAPES = Object.keys(SHAPE_RADIUS) as BulletShape[];

export function bulletRadius(shape: BulletShape): number {
    return SHAPE_RADIUS[shape];
}

/** Supersample factor — authored large then downscaled at runtime for crispness. */
const SS = 3;

function softGlow(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, body: Hsl): void {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, hsl(shade(body, 12), 0.55));
    g.addColorStop(0.5, hsl(body, 0.28));
    g.addColorStop(1, hsl(body, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
}

function ballGradient(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    body: Hsl,
    whiteCore = true,
): void {
    const hx = cx - r * 0.28;
    const hy = cy - r * 0.3;
    const g = ctx.createRadialGradient(hx, hy, r * 0.05, cx, cy, r);
    if (whiteCore) {
        g.addColorStop(0, 'hsl(0 0% 100%)');
        g.addColorStop(0.32, hsl(shade(body, 30, -10)));
        g.addColorStop(0.62, hsl(body));
        g.addColorStop(1, hsl(shade(body, -26)));
    } else {
        g.addColorStop(0, hsl(shade(body, 28, -8)));
        g.addColorStop(0.7, hsl(body));
        g.addColorStop(1, hsl(shade(body, -28)));
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // crisp rim
    ctx.strokeStyle = hsl(shade(body, -34), 0.85);
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath();
    ctx.arc(cx, cy, r - ctx.lineWidth * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // specular highlight
    ctx.fillStyle = 'hsl(0 0% 100% / 0.9)';
    ctx.beginPath();
    ctx.arc(hx, hy, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
}

function drawShape(ctx: CanvasRenderingContext2D, shape: BulletShape, r: number, body: Hsl): void {
    const cx = 0;
    const cy = 0;
    switch (shape) {
        case 'pellet': {
            softGlow(ctx, cx, cy, r * 2.0, body);
            ballGradient(ctx, cx, cy, r, body);
            break;
        }
        case 'orb':
        case 'orbL':
        case 'orbXL': {
            softGlow(ctx, cx, cy, r * 1.9, body);
            ballGradient(ctx, cx, cy, r, body);
            break;
        }
        case 'rice': {
            softGlow(ctx, cx, cy, r * 2.2, body);
            ctx.save();
            ctx.scale(1.85, 1); // elongate along +X
            ballGradient(ctx, cx, cy, r, body);
            ctx.restore();
            break;
        }
        case 'kunai': {
            softGlow(ctx, cx, cy, r * 2.0, body);
            const L = r * 2.5;
            const W = r * 1.05;
            ctx.beginPath();
            ctx.moveTo(L, 0);
            ctx.lineTo(-L * 0.55, -W);
            ctx.lineTo(-L * 0.85, 0);
            ctx.lineTo(-L * 0.55, W);
            ctx.closePath();
            const g = ctx.createLinearGradient(-L, 0, L, 0);
            g.addColorStop(0, hsl(shade(body, -22)));
            g.addColorStop(0.55, hsl(body));
            g.addColorStop(1, 'hsl(0 0% 100%)');
            ctx.fillStyle = g;
            ctx.fill();
            ctx.strokeStyle = hsl(shade(body, -34), 0.85);
            ctx.lineWidth = Math.max(1, r * 0.16);
            ctx.stroke();
            break;
        }
        case 'knife': {
            softGlow(ctx, cx, cy, r * 1.7, body);
            const L = r * 3.2;
            const W = r * 0.7;
            ctx.beginPath();
            ctx.moveTo(L, 0);
            ctx.lineTo(-L, -W);
            ctx.lineTo(-L * 0.86, 0);
            ctx.lineTo(-L, W);
            ctx.closePath();
            const g = ctx.createLinearGradient(-L, 0, L, 0);
            g.addColorStop(0, hsl(shade(body, -18)));
            g.addColorStop(0.7, hsl(shade(body, 8)));
            g.addColorStop(1, 'hsl(0 0% 100%)');
            ctx.fillStyle = g;
            ctx.fill();
            ctx.strokeStyle = hsl(shade(body, -30), 0.8);
            ctx.lineWidth = Math.max(1, r * 0.14);
            ctx.stroke();
            break;
        }
        case 'star': {
            softGlow(ctx, cx, cy, r * 2.1, body);
            const spikes = 5;
            const outer = r * 1.35;
            const inner = r * 0.6;
            const drawStar = (rad1: number, rad2: number, fill: string) => {
                ctx.beginPath();
                for (let i = 0; i < spikes * 2; i++) {
                    const rad = i % 2 === 0 ? rad1 : rad2;
                    const a = (Math.PI / spikes) * i - Math.PI / 2;
                    const px = Math.cos(a) * rad;
                    const py = Math.sin(a) * rad;
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fillStyle = fill;
                ctx.fill();
            };
            drawStar(outer, inner, hsl(body));
            ctx.strokeStyle = hsl(shade(body, -28), 0.9);
            ctx.lineWidth = Math.max(1, r * 0.14);
            ctx.stroke();
            drawStar(outer * 0.6, inner * 0.6, 'hsl(0 0% 100% / 0.95)');
            break;
        }
        case 'bubble': {
            softGlow(ctx, cx, cy, r * 1.7, body);
            const g = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
            g.addColorStop(0, hsl(body, 0.05));
            g.addColorStop(0.72, hsl(body, 0.12));
            g.addColorStop(0.86, hsl(shade(body, 12)));
            g.addColorStop(1, hsl(shade(body, -10), 0.7));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = hsl(shade(body, 18), 0.9);
            ctx.lineWidth = Math.max(1.5, r * 0.13);
            ctx.beginPath();
            ctx.arc(cx, cy, r - ctx.lineWidth * 0.5, 0, Math.PI * 2);
            ctx.stroke();
            // glossy arc highlight
            ctx.strokeStyle = 'hsl(0 0% 100% / 0.8)';
            ctx.lineWidth = Math.max(1, r * 0.1);
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.66, Math.PI * 1.05, Math.PI * 1.5);
            ctx.stroke();
            break;
        }
        case 'amulet': {
            softGlow(ctx, cx, cy, r * 1.9, body);
            const w = r * 2.6;
            const h = r * 1.7;
            const rad = r * 0.35;
            const rr = (x: number, y: number, ww: number, hh: number, cr: number) => {
                ctx.beginPath();
                ctx.moveTo(x + cr, y);
                ctx.arcTo(x + ww, y, x + ww, y + hh, cr);
                ctx.arcTo(x + ww, y + hh, x, y + hh, cr);
                ctx.arcTo(x, y + hh, x, y, cr);
                ctx.arcTo(x, y, x + ww, y, cr);
                ctx.closePath();
            };
            rr(-w / 2, -h / 2, w, h, rad);
            const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
            g.addColorStop(0, hsl(shade(body, 20)));
            g.addColorStop(1, hsl(shade(body, -16)));
            ctx.fillStyle = g;
            ctx.fill();
            ctx.strokeStyle = 'hsl(0 0% 100% / 0.85)';
            ctx.lineWidth = Math.max(1, r * 0.16);
            ctx.stroke();
            // central glyph stripe
            ctx.fillStyle = 'hsl(0 0% 100% / 0.85)';
            ctx.fillRect(-w * 0.06, -h * 0.3, w * 0.12, h * 0.6);
            break;
        }
    }
}

function buildSprite(shape: BulletShape, color: BulletColorName): BulletSpriteInfo {
    const r = SHAPE_RADIUS[shape];
    const body = BULLET_COLORS[color];
    // generous padding for glow + elongated/rotated shapes
    const extent = r * 3.4 * SS;
    const size = Math.ceil(extent * 2);
    const surface = createSurface(size, size);
    const ctx = surface.ctx;
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.scale(SS, SS);
    drawShape(ctx, shape, r, body);
    ctx.restore();
    return { surface, designRadius: r, directional: DIRECTIONAL[shape] };
}

export class BulletAtlas {
    // Nested maps avoid a per-bullet string-key allocation on the render hot path.
    private cache = new Map<BulletShape, Map<BulletColorName, BulletSpriteInfo>>();

    get(shape: BulletShape, color: BulletColorName): BulletSpriteInfo {
        let byColor = this.cache.get(shape);
        if (!byColor) {
            byColor = new Map();
            this.cache.set(shape, byColor);
        }
        let info = byColor.get(color);
        if (!info) {
            info = buildSprite(shape, color);
            byColor.set(color, info);
        }
        return info;
    }

    /** Pre-render every shape/colour combination up front. */
    preload(): void {
        for (const shape of BULLET_SHAPES) {
            for (const color of BULLET_COLOR_NAMES) this.get(shape, color);
        }
    }
}
