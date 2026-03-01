// ============================================================
// Background Renderer — 90s Hong Kong Neon Cityscape
// ============================================================

import { CANVAS_WIDTH, CANVAS_HEIGHT, GROUND_Y } from './fighters/types';

interface NeonSign {
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    text: string;
    flickerRate: number;
    flickerOffset: number;
}

// Pre-defined neon signs for the Hong Kong backdrop
const NEON_SIGNS: NeonSign[] = [
    { x: 15, y: 25, width: 55, height: 18, color: '#ff3366', text: '功夫', flickerRate: 120, flickerOffset: 0 },
    { x: 85, y: 15, width: 45, height: 14, color: '#33ccff', text: 'BAR', flickerRate: 90, flickerOffset: 30 },
    { x: 340, y: 20, width: 60, height: 16, color: '#ffcc00', text: '夜總會', flickerRate: 150, flickerOffset: 60 },
    { x: 410, y: 30, width: 50, height: 14, color: '#ff6633', text: 'HOTEL', flickerRate: 100, flickerOffset: 45 },
    { x: 155, y: 10, width: 40, height: 12, color: '#cc33ff', text: '茶', flickerRate: 80, flickerOffset: 15 },
    { x: 220, y: 22, width: 65, height: 15, color: '#33ff99', text: 'NOODLE', flickerRate: 110, flickerOffset: 50 },
    { x: 300, y: 8, width: 35, height: 12, color: '#ff99cc', text: '酒', flickerRate: 95, flickerOffset: 20 },
];

// Building silhouette data: [x, width, height]
const BUILDINGS: [number, number, number][] = [
    [0, 35, 140],
    [30, 40, 165],
    [65, 30, 130],
    [90, 45, 175],
    [130, 35, 145],
    [160, 50, 180],
    [205, 30, 125],
    [230, 45, 160],
    [270, 35, 150],
    [300, 40, 170],
    [335, 30, 135],
    [360, 50, 185],
    [405, 35, 155],
    [435, 45, 140],
];

let backgroundCache: ImageData | null = null;
let lastFrame = -1;

/**
 * Render the Hong Kong night scene background
 */
export function drawBackground(ctx: CanvasRenderingContext2D, frame: number): void {
    // Night sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    skyGrad.addColorStop(0, '#0a0015');
    skyGrad.addColorStop(0.4, '#1a0030');
    skyGrad.addColorStop(0.7, '#150025');
    skyGrad.addColorStop(1, '#0d001a');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, GROUND_Y);

    // Stars
    drawStars(ctx, frame);

    // Buildings
    drawBuildings(ctx, frame);

    // Neon signs
    drawNeonSigns(ctx, frame);

    // Ring/ground
    drawRing(ctx, frame);
}

function drawStars(ctx: CanvasRenderingContext2D, frame: number): void {
    const starPositions = [
        [25, 8], [80, 15], [145, 5], [200, 12], [260, 8],
        [310, 18], [370, 6], [420, 14], [460, 10], [50, 20],
        [175, 18], [350, 3], [450, 22],
    ];

    for (let i = 0; i < starPositions.length; i++) {
        const [sx, sy] = starPositions[i];
        const twinkle = Math.sin(frame * 0.05 + i * 1.7) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + twinkle * 0.5})`;
        ctx.fillRect(sx, sy, 1, 1);
    }
}

function drawBuildings(ctx: CanvasRenderingContext2D, frame: number): void {
    for (const [bx, bw, bh] of BUILDINGS) {
        const by = GROUND_Y - bh;

        // Building body
        ctx.fillStyle = '#0d0d1a';
        ctx.fillRect(bx, by, bw, bh);

        // Building outline
        ctx.strokeStyle = '#1a1a30';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

        // Windows
        const windowCols = Math.floor((bw - 6) / 6);
        const windowRows = Math.floor((bh - 8) / 8);

        for (let wy = 0; wy < windowRows; wy++) {
            for (let wx = 0; wx < windowCols; wx++) {
                // Some windows are lit, some dark — based on position seed
                const seed = (bx * 7 + wx * 13 + wy * 19) % 10;
                const isLit = seed < 4;
                const flicker = Math.sin(frame * 0.02 + seed * 2.5) > 0.8;

                if (isLit || flicker) {
                    const warmth = seed % 3;
                    const colors = ['#ffcc44', '#ff9944', '#44ccff'];
                    ctx.fillStyle = colors[warmth];
                    ctx.globalAlpha = 0.4 + Math.sin(frame * 0.015 + seed) * 0.15;
                } else {
                    ctx.fillStyle = '#151525';
                    ctx.globalAlpha = 0.8;
                }

                ctx.fillRect(bx + 4 + wx * 6, by + 5 + wy * 8, 3, 4);
            }
        }
        ctx.globalAlpha = 1;
    }
}

function drawNeonSigns(ctx: CanvasRenderingContext2D, frame: number): void {
    for (const sign of NEON_SIGNS) {
        const flickerPhase = (frame + sign.flickerOffset) % sign.flickerRate;
        const isFlickering = flickerPhase < 4 || (flickerPhase > sign.flickerRate * 0.7 && flickerPhase < sign.flickerRate * 0.7 + 3);
        const brightness = isFlickering ? 0.3 : 1.0;

        // Glow behind sign
        ctx.save();
        ctx.shadowColor = sign.color;
        ctx.shadowBlur = 12 * brightness;
        ctx.globalAlpha = 0.4 * brightness;
        ctx.fillStyle = sign.color;
        ctx.fillRect(sign.x - 3, sign.y - 3, sign.width + 6, sign.height + 6);
        ctx.restore();

        // Sign background
        ctx.fillStyle = '#0a0a0a';
        ctx.globalAlpha = 0.9;
        ctx.fillRect(sign.x, sign.y, sign.width, sign.height);
        ctx.globalAlpha = 1;

        // Sign border
        ctx.strokeStyle = sign.color;
        ctx.globalAlpha = brightness;
        ctx.lineWidth = 1;
        ctx.strokeRect(sign.x + 0.5, sign.y + 0.5, sign.width - 1, sign.height - 1);
        ctx.globalAlpha = 1;

        // Sign text
        ctx.save();
        ctx.fillStyle = sign.color;
        ctx.globalAlpha = brightness;
        ctx.shadowColor = sign.color;
        ctx.shadowBlur = 6 * brightness;
        ctx.font = `${Math.min(sign.height - 4, 10)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sign.text, sign.x + sign.width / 2, sign.y + sign.height / 2 + 1);
        ctx.restore();
    }
}

function drawRing(ctx: CanvasRenderingContext2D, frame: number): void {
    // Ground / ring floor
    const ringGrad = ctx.createLinearGradient(0, GROUND_Y, 0, CANVAS_HEIGHT);
    ringGrad.addColorStop(0, '#1a1a2e');
    ringGrad.addColorStop(0.3, '#16162a');
    ringGrad.addColorStop(1, '#0d0d1a');
    ctx.fillStyle = ringGrad;
    ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);

    // Ring ropes (top and bottom)
    const ropeColors = ['#ff3366', '#ffcc00', '#33ccff'];
    for (let r = 0; r < 3; r++) {
        const ry = GROUND_Y - 55 + r * 18;
        ctx.strokeStyle = ropeColors[r];
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.6 + Math.sin(frame * 0.03 + r) * 0.1;

        // Glow
        ctx.save();
        ctx.shadowColor = ropeColors[r];
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.moveTo(20, ry);
        ctx.lineTo(CANVAS_WIDTH - 20, ry);
        ctx.stroke();
        ctx.restore();
    }
    ctx.globalAlpha = 1;

    // Ring posts
    const postColor = '#cccccc';
    const posts = [22, CANVAS_WIDTH - 22];
    for (const px of posts) {
        ctx.fillStyle = postColor;
        ctx.fillRect(px - 2, GROUND_Y - 60, 4, 62);
        // Post top cap
        ctx.fillStyle = '#ff3366';
        ctx.fillRect(px - 3, GROUND_Y - 62, 6, 4);
    }

    // Ring floor texture lines
    ctx.strokeStyle = '#222244';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
        const ly = GROUND_Y + 8 + i * 7;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(25, ly);
        ctx.lineTo(CANVAS_WIDTH - 25, ly);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

/**
 * Draw atmospheric fog/haze at the bottom
 */
export function drawAtmosphere(ctx: CanvasRenderingContext2D, frame: number): void {
    // Scanline effect
    ctx.fillStyle = '#000000';
    for (let y = 0; y < CANVAS_HEIGHT; y += 3) {
        ctx.globalAlpha = 0.04;
        ctx.fillRect(0, y, CANVAS_WIDTH, 1);
    }
    ctx.globalAlpha = 1;

    // Subtle vignette
    const vignette = ctx.createRadialGradient(
        CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.3,
        CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.7
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}
