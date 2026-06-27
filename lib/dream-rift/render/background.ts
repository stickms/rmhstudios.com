/**
 * Procedural themed backgrounds for Dream Rift.
 *
 * Each stage gets a layered, slowly scrolling dreamscape: a sky gradient, soft
 * nebula blobs, parallax star fields, a moon and a distant torii/spire
 * silhouette. Star fields are generated once from a seeded RNG so the scroll is
 * cheap and deterministic across clients.
 */

import { type StageTheme } from './palette';
import { mulberry32 } from '../rng';

interface Star {
    x: number;
    y: number;
    r: number;
    speed: number;
    phase: number;
}

interface Nebula {
    x: number;
    y: number;
    r: number;
    speed: number;
}

export class Background {
    private stars: Star[] = [];
    private nebulae: Nebula[] = [];
    private moonX: number;
    private moonY: number;

    constructor(
        private theme: StageTheme,
        private width: number,
        private height: number,
        seed = 1,
    ) {
        const rng = mulberry32(seed ^ 0x9e3779b9);
        const count = Math.round((width * height) / 1400);
        for (let i = 0; i < count; i++) {
            const layer = rng();
            this.stars.push({
                x: rng() * width,
                y: rng() * height * 2,
                r: 0.4 + layer * 1.6,
                speed: 0.15 + layer * 0.9,
                phase: rng() * Math.PI * 2,
            });
        }
        for (let i = 0; i < 5; i++) {
            this.nebulae.push({
                x: rng() * width,
                y: rng() * height * 2,
                r: width * (0.4 + rng() * 0.7),
                speed: 0.08 + rng() * 0.25,
            });
        }
        this.moonX = width * (0.62 + rng() * 0.2);
        this.moonY = height * (0.16 + rng() * 0.14);
    }

    setTheme(theme: StageTheme): void {
        this.theme = theme;
    }

    draw(ctx: CanvasRenderingContext2D, scroll: number, time: number): void {
        const { width: w, height: h } = this;
        const t = this.theme;

        // sky gradient
        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, t.sky[0]);
        sky.addColorStop(0.55, t.sky[1]);
        sky.addColorStop(1, t.sky[2]);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);

        // moon
        const mg = ctx.createRadialGradient(this.moonX, this.moonY, 2, this.moonX, this.moonY, 34);
        mg.addColorStop(0, 'rgba(255,255,255,0.95)');
        mg.addColorStop(0.5, 'rgba(255,247,230,0.8)');
        mg.addColorStop(1, 'rgba(255,247,230,0)');
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.arc(this.moonX, this.moonY, 34, 0, Math.PI * 2);
        ctx.fill();

        // nebulae (additive glow)
        ctx.globalCompositeOperation = 'lighter';
        for (const n of this.nebulae) {
            const ny = ((n.y - scroll * n.speed) % (h * 2) + h * 2) % (h * 2);
            const g = ctx.createRadialGradient(n.x, ny - h * 0.5, 0, n.x, ny - h * 0.5, n.r);
            g.addColorStop(0, hexA(t.glow, 0.16));
            g.addColorStop(0.5, hexA(t.glow, 0.06));
            g.addColorStop(1, hexA(t.glow, 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(n.x, ny - h * 0.5, n.r, 0, Math.PI * 2);
            ctx.fill();
        }

        // stars
        for (const s of this.stars) {
            const sy = ((s.y - scroll * s.speed) % (h * 1.1) + h * 1.1) % (h * 1.1);
            const tw = 0.55 + 0.45 * Math.sin(time * 0.004 * s.speed + s.phase);
            ctx.fillStyle = hexA(t.star, tw * (0.5 + s.r * 0.3));
            ctx.beginPath();
            ctx.arc(s.x, sy, s.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';

        // distant torii / spire silhouette band along the bottom, parallax
        this.drawSilhouette(ctx, scroll);
    }

    private drawSilhouette(ctx: CanvasRenderingContext2D, scroll: number): void {
        const { width: w, height: h } = this;
        const t = this.theme;
        const baseY = h - 18 + Math.sin(scroll * 0.002) * 4;
        ctx.fillStyle = t.silhouette;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(0, baseY);
        const segments = 6;
        for (let i = 0; i <= segments; i++) {
            const x = (i / segments) * w;
            const peak = baseY - (8 + ((i * 37) % 26));
            ctx.lineTo(x, peak);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();

        // a torii gate centred low
        const gx = w * 0.5;
        const gy = h - 6;
        ctx.fillStyle = t.silhouette;
        ctx.fillRect(gx - 26, gy - 30, 4, 30); // left pillar
        ctx.fillRect(gx + 22, gy - 30, 4, 30); // right pillar
        ctx.fillRect(gx - 34, gy - 32, 68, 4); // top lintel
        ctx.fillRect(gx - 30, gy - 24, 60, 3); // second beam
        ctx.globalAlpha = 1;
    }
}

function hexA(hex: string, a: number): string {
    const c = hex.replace('#', '');
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
}
