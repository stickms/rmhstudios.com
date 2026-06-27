/**
 * Offline preview renderer for Dream Rift art direction.
 *
 * Renders a representative danmaku gameplay frame per stage theme to a PNG so
 * the Touhou-style sprites / bullets / background can be reviewed without
 * booting the full game. Run: pnpm exec tsx scripts/dream-rift-preview.ts
 */

import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'node:fs';
import { setCanvasFactory } from '../lib/dream-rift/render/surface';
import { BulletAtlas, type BulletShape } from '../lib/dream-rift/render/bullets';
import { Background } from '../lib/dream-rift/render/background';
import { playerSprites, buildBoss, buildFairy } from '../lib/dream-rift/render/sprites';
import { STAGE_THEMES, BULLET_COLORS, type BulletColorName, type StageTheme } from '../lib/dream-rift/render/palette';

setCanvasFactory((w, h) => {
    const canvas = createCanvas(w, h);
    return { canvas, ctx: canvas.getContext('2d') };
});

const PF_W = 384;
const PF_H = 448;
const BAR_W = 192;
const W = PF_W + BAR_W;
const H = PF_H;

const atlas = new BulletAtlas();

interface B {
    x: number;
    y: number;
    a: number;
    r: number;
    shape: BulletShape;
    color: BulletColorName;
}

function drawBullet(ctx: any, b: B): void {
    const info = atlas.get(b.shape, b.color);
    const surf = info.surface;
    const SS = 3;
    const f = b.r / info.designRadius;
    const drawW = (surf.width / SS) * f;
    ctx.save();
    ctx.translate(b.x, b.y);
    if (info.directional) ctx.rotate(b.a);
    ctx.drawImage(surf.canvas as any, -drawW / 2, -drawW / 2, drawW, drawW);
    ctx.restore();
}

function buildScene(theme: StageTheme): B[] {
    const bullets: B[] = [];
    const cols = theme.bulletColors;
    const bossX = PF_W / 2;
    const bossY = 96;
    const playerX = PF_W / 2 + 6;
    const playerY = 360;

    // Spiral arms of orbs
    for (let arm = 0; arm < 4; arm++) {
        for (let i = 0; i < 22; i++) {
            const a = arm * (Math.PI / 2) + i * 0.42 + 0.3;
            const rad = 24 + i * 13;
            bullets.push({
                x: bossX + Math.cos(a) * rad,
                y: bossY + Math.sin(a) * rad * 0.95,
                a,
                r: 6,
                shape: 'orb',
                color: cols[(arm + i) % cols.length],
            });
        }
    }

    // Radial ring of rice
    for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const rad = 130;
        bullets.push({
            x: bossX + Math.cos(a) * rad,
            y: bossY + Math.sin(a) * rad,
            a,
            r: 4,
            shape: 'rice',
            color: cols[1 % cols.length],
        });
    }

    // Aimed kunai streams toward the player
    for (let s = 0; s < 5; s++) {
        const baseA = Math.atan2(playerY - bossY, playerX - bossX) + (s - 2) * 0.16;
        for (let i = 0; i < 7; i++) {
            const dist = 60 + i * 34;
            bullets.push({
                x: bossX + Math.cos(baseA) * dist,
                y: bossY + Math.sin(baseA) * dist,
                a: baseA,
                r: 6,
                shape: 'kunai',
                color: cols[2 % cols.length],
            });
        }
    }

    // Big bubble bullets drifting
    for (let i = 0; i < 6; i++) {
        bullets.push({
            x: 50 + i * 58,
            y: 180 + (i % 2) * 40,
            a: 0,
            r: 13,
            shape: 'bubble',
            color: cols[(i + 3) % cols.length],
        });
    }

    // Stars scattered mid-field
    for (let i = 0; i < 14; i++) {
        bullets.push({
            x: 30 + ((i * 53) % (PF_W - 40)),
            y: 230 + ((i * 71) % 140),
            a: 0,
            r: 7,
            shape: 'star',
            color: cols[(i + 1) % cols.length],
        });
    }

    // Side fairy pellet fans
    for (const fx of [70, PF_W - 70]) {
        for (let i = 0; i < 9; i++) {
            const a = Math.PI / 2 + (i - 4) * 0.2;
            bullets.push({
                x: fx + Math.cos(a) * 36,
                y: 150 + Math.sin(a) * 36,
                a,
                r: 3,
                shape: 'pellet',
                color: cols[0],
            });
        }
    }

    return bullets;
}

function drawHud(ctx: any, theme: StageTheme, idx: number): void {
    // panel
    const grd = ctx.createLinearGradient(PF_W, 0, W, 0);
    grd.addColorStop(0, '#0a0614');
    grd.addColorStop(1, '#140c24');
    ctx.fillStyle = grd;
    ctx.fillRect(PF_W, 0, BAR_W, H);

    // ornate divider
    ctx.fillStyle = theme.glow;
    ctx.fillRect(PF_W, 0, 2, H);
    ctx.globalAlpha = 0.4;
    ctx.fillRect(PF_W + 3, 0, 1, H);
    ctx.globalAlpha = 1;

    const x = PF_W + 16;
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('Dream', x, 44);
    ctx.fillStyle = theme.glow;
    ctx.fillText('Rift', x, 68);

    ctx.font = '11px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(`STAGE ${idx + 1} — ${theme.name.toUpperCase()}`, x, 92);

    let y = 130;
    const label = (s: string, v: string) => {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '11px sans-serif';
        ctx.fillText(s, x, y);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(v, x + 4, y + 20);
        y += 44;
    };
    label('HiScore', '012,480,990');
    label('Score', '004,127,360');

    // lives as stars
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '11px sans-serif';
    ctx.fillText('Player', x, y);
    drawIcons(ctx, x + 4, y + 6, 3, '#ffd34d', 'star');
    y += 32;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('Bomb', x, y);
    drawIcons(ctx, x + 4, y + 6, 2, '#7fdcff', 'star');
    y += 36;

    // power gauge
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('Power', x, y);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y + 8, BAR_W - 36, 8);
    const pg = ctx.createLinearGradient(x, 0, x + BAR_W - 36, 0);
    pg.addColorStop(0, theme.glow);
    pg.addColorStop(1, '#fff');
    ctx.fillStyle = pg;
    ctx.fillRect(x, y + 8, (BAR_W - 36) * 0.78, 8);
    y += 40;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('Graze', x, y);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('1,284', x + 4, y + 20);
}

function drawIcons(ctx: any, x: number, y: number, n: number, color: string, _shape: string): void {
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
        const cx = x + i * 18 + 6;
        const cy = y + 6;
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
            const rad = k % 2 === 0 ? 6 : 2.6;
            const a = (Math.PI / 5) * k - Math.PI / 2;
            const px = cx + Math.cos(a) * rad;
            const py = cy + Math.sin(a) * rad;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
    }
}

function render(theme: StageTheme, idx: number): Buffer {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d') as any;

    // playfield clip
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, PF_W, PF_H);
    ctx.clip();

    const bg = new Background(theme, PF_W, PF_H, idx + 1);
    bg.draw(ctx, 600, 1200);

    // spell-card radial flash behind boss
    const fg = ctx.createRadialGradient(PF_W / 2, 96, 10, PF_W / 2, 96, 220);
    fg.addColorStop(0, hexA(theme.glow, 0.22));
    fg.addColorStop(1, hexA(theme.glow, 0));
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, PF_W, PF_H);

    // boss
    const bossColors: any = [
        { hair: '#3a2233', outfit: '#d33a55', outfitShade: '#9c2440', accent: '#ffd34d' },
        { hair: '#1f5e7a', outfit: '#2a86b0', outfitShade: '#185a78', accent: '#9ff0ff' },
        { hair: '#3a2a66', outfit: '#7d4bd6', outfitShade: '#532f95', accent: '#e0b3ff' },
    ];
    const boss = buildBoss(bossColors[idx % 3]);
    const bossScale = 1.6;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
        boss.surface.canvas as any,
        PF_W / 2 - (boss.nativeW * bossScale) / 2,
        96 - (boss.nativeH * bossScale) / 2,
        boss.nativeW * bossScale,
        boss.nativeH * bossScale,
    );

    // fairies
    const fairy = buildFairy(BULLET_COLORS[theme.bulletColors[0]].h ? hexFromHsl(theme.bulletColors[0]) : '#fff', '#3a2030');
    for (const fx of [70, PF_W - 70]) {
        ctx.drawImage(fairy.canvas as any, fx - 24, 150 - 24, 48, 48);
    }
    ctx.imageSmoothingEnabled = true;

    // bullets
    const bullets = buildScene(theme);
    for (const b of bullets) drawBullet(ctx, b);

    // player
    const ps = playerSprites(idx % 2 === 0 ? 'reika' : 'mira');
    const pf = ps.frames[1];
    const pScale = 1.5;
    ctx.imageSmoothingEnabled = false;
    const px = PF_W / 2 + 6;
    const py = 360;
    // option orbs
    ctx.imageSmoothingEnabled = true;
    for (const ox of [-14, 14]) {
        const og = ctx.createRadialGradient(px + ox, py - 4, 0, px + ox, py - 4, 6);
        og.addColorStop(0, '#fff');
        og.addColorStop(1, hexA(theme.glow, 0));
        ctx.fillStyle = og;
        ctx.beginPath();
        ctx.arc(px + ox, py - 4, 6, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pf.canvas as any, px - (ps.nativeW * pScale) / 2, py - (ps.nativeH * pScale) / 2, ps.nativeW * pScale, ps.nativeH * pScale);
    ctx.imageSmoothingEnabled = true;
    // focus hitbox indicator
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(px, py + 4, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff5577';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px, py + 4, 7, 0, Math.PI * 2);
    ctx.stroke();

    // playfield vignette + border
    const vg = ctx.createRadialGradient(PF_W / 2, PF_H / 2, PF_H * 0.3, PF_W / 2, PF_H / 2, PF_H * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, PF_W, PF_H);
    ctx.restore();

    drawHud(ctx, theme, idx);

    return canvas.toBuffer('image/png');
}

function hexA(hex: string, a: number): string {
    const c = hex.replace('#', '');
    return `rgba(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)},${a})`;
}
function hexFromHsl(name: BulletColorName): string {
    const { h, s, l } = BULLET_COLORS[name];
    // quick hsl->hex
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const col = l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
        return Math.round(255 * col).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

const outDir = process.argv[2] || '/tmp/dream-rift-preview';
mkdirSync(outDir, { recursive: true });
STAGE_THEMES.forEach((theme, idx) => {
    const buf = render(theme, idx);
    const file = `${outDir}/stage-${idx + 1}-${theme.id}.png`;
    writeFileSync(file, buf);
    console.log('wrote', file);
});
console.log('done');
