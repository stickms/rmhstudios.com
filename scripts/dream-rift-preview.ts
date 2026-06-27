/**
 * Offline preview renderer for Dream Rift art direction.
 *
 * Renders representative danmaku gameplay frames per stage, a character-select
 * roster (all four playable chibis + portraits) and an animation contact sheet
 * to PNGs so the Touhou-style art can be reviewed without booting the game.
 * Run: pnpm exec tsx scripts/dream-rift-preview.ts [outDir]
 */

import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'node:fs';
import { setCanvasFactory } from '../lib/dream-rift/render/surface';
import { BulletAtlas, type BulletShape } from '../lib/dream-rift/render/bullets';
import { Background } from '../lib/dream-rift/render/background';
import { playerSprites, buildBoss, buildFairy, CHARACTERS, PLAYER_IDS } from '../lib/dream-rift/render/sprites';
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
    const SS = 3;
    const f = b.r / info.designRadius;
    const drawW = (info.surface.width / SS) * f;
    ctx.save();
    ctx.translate(b.x, b.y);
    if (info.directional) ctx.rotate(b.a);
    ctx.drawImage(info.surface.canvas as any, -drawW / 2, -drawW / 2, drawW, drawW);
    ctx.restore();
}

function buildScene(theme: StageTheme): B[] {
    const bullets: B[] = [];
    const cols = theme.bulletColors;
    const bossX = PF_W / 2;
    const bossY = 96;
    const playerX = PF_W / 2 + 6;
    const playerY = 360;

    for (let arm = 0; arm < 4; arm++) {
        for (let i = 0; i < 22; i++) {
            const a = arm * (Math.PI / 2) + i * 0.42 + 0.3;
            const rad = 24 + i * 13;
            bullets.push({ x: bossX + Math.cos(a) * rad, y: bossY + Math.sin(a) * rad * 0.95, a, r: 6, shape: 'orb', color: cols[(arm + i) % cols.length] });
        }
    }
    for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        bullets.push({ x: bossX + Math.cos(a) * 130, y: bossY + Math.sin(a) * 130, a, r: 4, shape: 'rice', color: cols[1 % cols.length] });
    }
    for (let s = 0; s < 5; s++) {
        const baseA = Math.atan2(playerY - bossY, playerX - bossX) + (s - 2) * 0.16;
        for (let i = 0; i < 7; i++) {
            const dist = 60 + i * 34;
            bullets.push({ x: bossX + Math.cos(baseA) * dist, y: bossY + Math.sin(baseA) * dist, a: baseA, r: 6, shape: 'kunai', color: cols[2 % cols.length] });
        }
    }
    for (let i = 0; i < 6; i++) bullets.push({ x: 50 + i * 58, y: 180 + (i % 2) * 40, a: 0, r: 13, shape: 'bubble', color: cols[(i + 3) % cols.length] });
    for (let i = 0; i < 14; i++) bullets.push({ x: 30 + ((i * 53) % (PF_W - 40)), y: 230 + ((i * 71) % 140), a: 0, r: 7, shape: 'star', color: cols[(i + 1) % cols.length] });
    for (const fx of [70, PF_W - 70]) {
        for (let i = 0; i < 9; i++) {
            const a = Math.PI / 2 + (i - 4) * 0.2;
            bullets.push({ x: fx + Math.cos(a) * 36, y: 150 + Math.sin(a) * 36, a, r: 3, shape: 'pellet', color: cols[0] });
        }
    }
    return bullets;
}

function drawHud(ctx: any, theme: StageTheme, idx: number): void {
    const grd = ctx.createLinearGradient(PF_W, 0, W, 0);
    grd.addColorStop(0, '#0a0614');
    grd.addColorStop(1, '#140c24');
    ctx.fillStyle = grd;
    ctx.fillRect(PF_W, 0, BAR_W, H);
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
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '11px sans-serif';
    ctx.fillText('Player', x, y);
    drawStars(ctx, x + 4, y + 6, 3, '#ffd34d');
    y += 32;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('Bomb', x, y);
    drawStars(ctx, x + 4, y + 6, 2, '#7fdcff');
    y += 36;
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

function drawStars(ctx: any, x: number, y: number, n: number, color: string): void {
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

function renderGameplay(theme: StageTheme, idx: number): Buffer {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d') as any;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, PF_W, PF_H);
    ctx.clip();

    new Background(theme, PF_W, PF_H, idx + 1).draw(ctx, 600, 1200);

    const fg = ctx.createRadialGradient(PF_W / 2, 96, 10, PF_W / 2, 96, 220);
    fg.addColorStop(0, hexA(theme.glow, 0.22));
    fg.addColorStop(1, hexA(theme.glow, 0));
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, PF_W, PF_H);

    const boss = buildBoss(idx % 3);
    const bossScale = 1.7;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(boss.frames[1].canvas as any, PF_W / 2 - (boss.nativeW * bossScale) / 2, 96 - (boss.nativeH * bossScale) / 2, boss.nativeW * bossScale, boss.nativeH * bossScale);

    const fairy = buildFairy('sprite', hexFromHsl(theme.bulletColors[0]), '#3a2030', theme.glow);
    for (const fx of [70, PF_W - 70]) ctx.drawImage(fairy[0].canvas as any, fx - 28, 150 - 28, 56, 56);
    ctx.imageSmoothingEnabled = true;

    for (const b of buildScene(theme)) drawBullet(ctx, b);

    const ps = playerSprites(PLAYER_IDS[idx % PLAYER_IDS.length]);
    const pScale = 1.4;
    const px = PF_W / 2 + 6;
    const py = 360;
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
    ctx.drawImage(ps.idle[1].canvas as any, px - (ps.nativeW * pScale) / 2, py - (ps.nativeH * pScale) / 2, ps.nativeW * pScale, ps.nativeH * pScale);
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(px, py + 4, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff5577';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px, py + 4, 7, 0, Math.PI * 2);
    ctx.stroke();

    const vg = ctx.createRadialGradient(PF_W / 2, PF_H / 2, PF_H * 0.3, PF_W / 2, PF_H / 2, PF_H * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, PF_W, PF_H);
    ctx.restore();

    drawHud(ctx, theme, idx);
    return canvas.toBuffer('image/png');
}

function renderRoster(): Buffer {
    const cardW = 200;
    const cardH = 300;
    const cols = 4;
    const pad = 16;
    const rw = cols * cardW + (cols + 1) * pad;
    const rh = cardH + pad * 2 + 50;
    const canvas = createCanvas(rw, rh);
    const ctx = canvas.getContext('2d') as any;
    const bg = ctx.createLinearGradient(0, 0, 0, rh);
    bg.addColorStop(0, '#0a0618');
    bg.addColorStop(1, '#1a0f2e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, rw, rh);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('Dream Rift — Choose Your Dreamer  (up to 4 players)', pad, 36);

    PLAYER_IDS.forEach((id, i) => {
        const c = CHARACTERS[id];
        const x = pad + i * (cardW + pad);
        const y = 56;
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        roundRect(ctx, x, y, cardW, cardH, 12);
        ctx.fill();
        ctx.strokeStyle = c.accent;
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, cardW, cardH, 12);
        ctx.stroke();
        const ps = playerSprites(id);
        ctx.imageSmoothingEnabled = false;
        const pw = ps.portrait.width * 1.4;
        ctx.drawImage(ps.portrait.canvas as any, x + cardW / 2 - pw / 2, y + 16, pw, ps.portrait.height * 1.4);
        ctx.imageSmoothingEnabled = true;
        ctx.fillStyle = c.accent;
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(c.name, x + 16, y + 222);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '11px sans-serif';
        ctx.fillText(c.title, x + 16, y + 240);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '11px sans-serif';
        wrap(ctx, c.shotType, x + 16, y + 262, cardW - 32, 14);
    });
    return canvas.toBuffer('image/png');
}

function renderAnimSheet(): Buffer {
    const cell = 80;
    const cols = 8; // 4 idle + 2 left + 2 right
    const rows = PLAYER_IDS.length;
    const labelW = 90;
    const aw = labelW + cols * cell;
    const ah = 40 + rows * cell;
    const canvas = createCanvas(aw, ah);
    const ctx = canvas.getContext('2d') as any;
    ctx.fillStyle = '#120a22';
    ctx.fillRect(0, 0, aw, ah);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('Animation frames — idle (×4) · bank-left (×2) · bank-right (×2)', 12, 26);
    PLAYER_IDS.forEach((id, r) => {
        const ps = playerSprites(id);
        const frames = [...ps.idle, ...ps.left, ...ps.right];
        const y = 40 + r * cell;
        ctx.fillStyle = CHARACTERS[id].accent;
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(CHARACTERS[id].name, 12, y + cell / 2);
        ctx.imageSmoothingEnabled = false;
        frames.forEach((f, ci) => {
            const x = labelW + ci * cell;
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.strokeRect(x, y, cell, cell);
            const sc = 1.5;
            ctx.drawImage(f.canvas as any, x + cell / 2 - (ps.nativeW * sc) / 2, y + cell / 2 - (ps.nativeH * sc) / 2, ps.nativeW * sc, ps.nativeH * sc);
        });
        ctx.imageSmoothingEnabled = true;
    });
    return canvas.toBuffer('image/png');
}

function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}
function wrap(ctx: any, text: string, x: number, y: number, maxW: number, lh: number): void {
    const words = text.split(' ');
    let line = '';
    for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (ctx.measureText(test).width > maxW && line) {
            ctx.fillText(line, x, y);
            line = w;
            y += lh;
        } else line = test;
    }
    if (line) ctx.fillText(line, x, y);
}

function hexA(hex: string, a: number): string {
    const c = hex.replace('#', '');
    return `rgba(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)},${a})`;
}
function hexFromHsl(name: BulletColorName): string {
    const { h, s, l } = BULLET_COLORS[name];
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
    writeFileSync(`${outDir}/stage-${idx + 1}-${theme.id}.png`, renderGameplay(theme, idx));
    console.log('wrote gameplay', idx + 1);
});
writeFileSync(`${outDir}/roster.png`, renderRoster());
console.log('wrote roster');
writeFileSync(`${outDir}/animations.png`, renderAnimSheet());
console.log('wrote animations');
console.log('done');
