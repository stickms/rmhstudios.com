/**
 * Canvas2D renderer for Dream Rift.
 *
 * Draws the simulation, the STG sidebar HUD and the Nico Nico–style scrolling
 * danmaku comments. The whole 568×448 internal frame (playfield + sidebar) is
 * letterboxed to whatever canvas size it's given — every player sees an
 * identical field with black bars, so screen size confers no advantage.
 *
 * Bullet sprites are blitted from a pre-rendered atlas (smoothing on, they're
 * supersampled); character/boss pixel art is drawn with smoothing off so it
 * stays crisp.
 */

import { CANVAS_H, CANVAS_W, PLAYFIELD_H, PLAYFIELD_W, SIDEBAR_W, POWER_MAX } from '../constants';
import type { World } from '../sim/world';
import type { Bullet, BulletColorName, Enemy, Shot } from '../types';
import { BulletAtlas } from './bullets';
import { Background } from './background';
import { stageTheme, type StageTheme } from './palette';
import { playerSprites, buildBoss, buildFairy, CHARACTERS, type BossSprite, type CharacterSprites, type FairyVariant } from './sprites';
import type { Surface } from './surface';
import type { BossSheetDef, LoadedSheet, LoadedSpriteAssets, SpriteSheetDef } from '../assets';

const SS = 3;

interface Comment {
    text: string;
    x: number;
    y: number;
    speed: number;
    color: string;
    size: number;
}

export interface HudView {
    stageIndex: number;
    stageName: string;
    bossActive: boolean;
    bossName: string;
    bossHp: number;
    bossMaxHp: number;
    bossCards: number;
    bossCardIndex: number;
    spellName: string;
    spellTimeLeft: number; // seconds, -1 hidden
    hiScore: number;
    coop: boolean;
}

export class Renderer {
    private ctx: CanvasRenderingContext2D;
    private atlas = new BulletAtlas();
    private bg: Background;
    private theme: StageTheme;
    private bossSprites: BossSprite;
    private fairyCache = new Map<string, Surface[]>();
    private comments: Comment[] = [];
    private commentLane = 0;
    private scroll = 0;
    private time = 0;
    private cssW = CANVAS_W;
    private cssH = CANVAS_H;
    private flash = 0;
    private flashColor = '#ffffff';
    /** When true, always draw a thin hitbox box on the local player (setting). */
    showHitboxAlways = false;
    /** Optional external sprite sheets; when present they replace procedural art. */
    private spriteAssets: LoadedSpriteAssets | null = null;
    /** Sprite-sheet key for the boss currently on screen. */
    private currentBossSheet: string | null = null;

    constructor(
        canvas: HTMLCanvasElement,
        stageIndex = 0,
    ) {
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) throw new Error('2d context unavailable');
        this.ctx = ctx;
        this.theme = stageTheme(stageIndex);
        this.bg = new Background(this.theme, PLAYFIELD_W, PLAYFIELD_H, stageIndex + 1);
        this.bossSprites = buildBoss(stageIndex);
        this.atlas.preload();
    }

    setSpriteAssets(a: LoadedSpriteAssets | null): void {
        this.spriteAssets = a;
    }

    setBossSheet(key: string | null): void {
        this.currentBossSheet = key;
    }

    /** Draw one frame from an external sheet, centred at (cx,cy), scaled to targetH. */
    private drawSheet(sheet: LoadedSheet<SpriteSheetDef | BossSheetDef>, frameIdx: number, cx: number, cy: number, targetH: number): void {
        const { image, def } = sheet;
        const cols = Math.max(1, Math.floor(image.width / def.frameW));
        const fx = (frameIdx % cols) * def.frameW;
        const fy = Math.floor(frameIdx / cols) * def.frameH;
        const scale = targetH / def.frameH;
        const w = def.frameW * scale;
        const h = def.frameH * scale;
        const ctx = this.ctx;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image as CanvasImageSource, fx, fy, def.frameW, def.frameH, cx - w / 2, cy - h / 2, w, h);
        ctx.imageSmoothingEnabled = true;
    }

    setStage(stageIndex: number, bossThemeIndex: number): void {
        this.theme = stageTheme(stageIndex);
        this.bg = new Background(this.theme, PLAYFIELD_W, PLAYFIELD_H, stageIndex + 1);
        this.bossSprites = buildBoss(bossThemeIndex);
    }

    resize(cssW: number, cssH: number, dpr: number): void {
        this.cssW = cssW;
        this.cssH = cssH;
        const canvas = this.ctx.canvas;
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        this.dpr = dpr;
    }
    private dpr = 1;

    addComment(text: string, color = '#ffffff'): void {
        const lanes = 7;
        this.commentLane = (this.commentLane + 1) % lanes;
        const y = 28 + this.commentLane * ((PLAYFIELD_H - 80) / lanes);
        this.comments.push({ text, x: PLAYFIELD_W + 10, y, speed: 1.6 + Math.random() * 0.8, color, size: 13 + Math.floor(Math.random() * 3) });
        if (this.comments.length > 40) this.comments.shift();
    }

    flashScreen(color: string, amount = 0.5): void {
        this.flash = amount;
        this.flashColor = color;
    }

    private fairy(variant: FairyVariant, color: BulletColorName): Surface[] {
        const key = `${variant}:${color}`;
        let f = this.fairyCache.get(key);
        if (!f) {
            const hex = colorHex(color);
            f = buildFairy(variant, hex, '#2a1b30', this.theme.glow);
            this.fairyCache.set(key, f);
        }
        return f;
    }

    render(world: World, hud: HudView, localSlot: number): void {
        const ctx = this.ctx;
        this.time += 16;
        this.scroll += 1.4;

        const dpr = this.dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, this.cssW, this.cssH);

        // letterbox transform
        const scale = Math.min(this.cssW / CANVAS_W, this.cssH / CANVAS_H);
        const ox = (this.cssW - CANVAS_W * scale) / 2;
        const oy = (this.cssH - CANVAS_H * scale) / 2;
        ctx.setTransform(scale * dpr, 0, 0, scale * dpr, ox * dpr, oy * dpr);

        // ── playfield ──
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, PLAYFIELD_W, PLAYFIELD_H);
        ctx.clip();

        this.bg.draw(ctx, this.scroll, this.time);

        // boss spell backdrop glow
        if (world.boss?.active && world.boss.introFrames <= 0) {
            const b = world.boss;
            const g = ctx.createRadialGradient(b.x, b.y, 8, b.x, b.y, 240);
            g.addColorStop(0, hexA(this.theme.glow, 0.18));
            g.addColorStop(1, hexA(this.theme.glow, 0));
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, PLAYFIELD_W, PLAYFIELD_H);
        }

        this.drawEnemies(world);
        this.drawBoss(world);
        this.drawItems(world);
        this.drawShots(world);
        this.drawBullets(world);
        this.drawPlayers(world, localSlot);
        this.drawEffects(world);
        this.drawComments();

        // vignette
        const vg = ctx.createRadialGradient(PLAYFIELD_W / 2, PLAYFIELD_H / 2, PLAYFIELD_H * 0.3, PLAYFIELD_W / 2, PLAYFIELD_H / 2, PLAYFIELD_H * 0.78);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.42)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, PLAYFIELD_W, PLAYFIELD_H);

        // boss hp bar across the top
        if (world.boss?.active && world.boss.introFrames <= 0 && hud.bossMaxHp > 0) {
            this.drawBossBar(hud);
        }

        if (this.flash > 0) {
            ctx.fillStyle = hexA(this.flashColor, this.flash * 0.5);
            ctx.fillRect(0, 0, PLAYFIELD_W, PLAYFIELD_H);
            this.flash *= 0.86;
            if (this.flash < 0.02) this.flash = 0;
        }
        ctx.restore();

        this.drawHud(world, hud, localSlot);
    }

    private drawBullets(world: World): void {
        const ctx = this.ctx;
        ctx.imageSmoothingEnabled = true;
        world.bullets.forEach((b: Bullet) => {
            const info = this.atlas.get(b.shape, b.color);
            const f = b.drawRadius / info.designRadius;
            const drawW = (info.surface.width / SS) * f;
            ctx.save();
            ctx.globalAlpha = b.dying > 0 ? Math.max(0, 1 - b.dying / 10) : 1;
            ctx.translate(b.x, b.y);
            if (info.directional) ctx.rotate(b.angle);
            else if (b.spin) ctx.rotate(b.spin * 0.04);
            ctx.drawImage(info.surface.canvas as CanvasImageSource, -drawW / 2, -drawW / 2, drawW, drawW);
            ctx.restore();
        });
        ctx.globalAlpha = 1;
    }

    private drawShots(world: World): void {
        const ctx = this.ctx;
        world.shots.forEach((s: Shot) => {
            ctx.save();
            ctx.globalAlpha = 0.92;
            ctx.translate(s.x, s.y);
            const col = colorHex(s.color);
            if (s.kind === 'star') {
                ctx.fillStyle = col;
                star(ctx, 0, 0, 7, 3, 5);
                ctx.fill();
            } else if (s.kind === 'lance') {
                ctx.fillStyle = col;
                ctx.fillRect(-2, -8, 4, 16);
                ctx.fillStyle = '#fff';
                ctx.fillRect(-1, -8, 2, 6);
            } else if (s.kind === 'wave') {
                ctx.fillStyle = col;
                ctx.beginPath();
                ctx.ellipse(0, 0, 3, 6, Math.atan2(s.vy, s.vx) + Math.PI / 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // amulet / spark
                ctx.fillStyle = hexA(col, 0.85);
                ctx.fillRect(-3, -6, 6, 12);
                ctx.fillStyle = '#fff';
                ctx.fillRect(-1, -6, 2, 12);
            }
            ctx.restore();
        });
        ctx.globalAlpha = 1;
    }

    private drawItems(world: World): void {
        const ctx = this.ctx;
        world.items.forEach((it) => {
            const c =
                it.kind === 'power' ? '#ff4d6d' :
                it.kind === 'point' ? '#5fd0ff' :
                it.kind === 'life' ? '#ffd34d' :
                it.kind === 'bomb' ? '#9a6bff' : '#ffffff';
            ctx.fillStyle = c;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.rect(it.x - 5, it.y - 5, 10, 10);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#1a1024';
            ctx.font = '7px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(it.kind === 'power' ? 'P' : it.kind === 'point' ? 'pt' : it.kind === 'life' ? '1↑' : it.kind === 'bomb' ? 'B' : '★', it.x, it.y + 0.5);
        });
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }

    private drawEnemies(world: World): void {
        const ctx = this.ctx;
        ctx.imageSmoothingEnabled = false;
        world.enemies.forEach((e: Enemy) => {
            const frames = this.fairy(e.variant, e.color);
            const fr = frames[Math.floor(this.time / 140) % frames.length];
            const sc = e.variant === 'sentinel' ? 1.5 : 1.2;
            ctx.save();
            if (e.hitFlash > 0) {
                ctx.globalCompositeOperation = 'lighter';
            }
            ctx.drawImage(fr.canvas as CanvasImageSource, e.x - (fr.width * sc) / 2, e.y - (fr.height * sc) / 2, fr.width * sc, fr.height * sc);
            ctx.restore();
        });
        ctx.imageSmoothingEnabled = true;
    }

    private drawBoss(world: World): void {
        const b = world.boss;
        if (!b || !b.active) return;
        const ctx = this.ctx;
        const sheet = this.currentBossSheet ? this.spriteAssets?.bosses[this.currentBossSheet] : undefined;
        ctx.save();
        if (b.introFrames > 0) ctx.globalAlpha = Math.min(1, (180 - b.introFrames) / 60);
        if (b.hitFlash > 0) ctx.globalCompositeOperation = 'lighter';
        if (sheet && sheet.def.frames.length) {
            const idx = sheet.def.frames[Math.floor(this.time / 130) % sheet.def.frames.length];
            // boss cells carry transparent padding, so scale generously
            this.drawSheet(sheet, idx, b.x, b.y, 210);
        } else {
            ctx.imageSmoothingEnabled = false;
            const frame = this.bossSprites.frames[Math.floor(this.time / 130) % this.bossSprites.frames.length];
            const sc = 1.7;
            ctx.drawImage(frame.canvas as CanvasImageSource, b.x - (this.bossSprites.nativeW * sc) / 2, b.y - (this.bossSprites.nativeH * sc) / 2, this.bossSprites.nativeW * sc, this.bossSprites.nativeH * sc);
            ctx.imageSmoothingEnabled = true;
        }
        ctx.restore();
    }

    private drawPlayers(world: World, localSlot: number): void {
        const ctx = this.ctx;
        for (const p of world.players) {
            if (!p.joined) continue;
            const x = p.isLocal ? p.x : p.renderX;
            const y = p.isLocal ? p.y : p.renderY;
            if (p.dead) {
                // respawn ghost
                continue;
            }
            const blink = p.invuln > 0 && Math.floor(p.invuln / 4) % 2 === 0;
            const sheet = this.spriteAssets?.players[p.charId];

            // option orbs
            const tier = p.power >= 64 ? 2 : p.power >= 32 ? 1 : 0;
            for (let i = 0; i < tier; i++) {
                const ox = (i + 1) * (p.focus ? 9 : 15) * (i % 2 === 0 ? -1 : 1);
                const og = ctx.createRadialGradient(x + ox, y - 2, 0, x + ox, y - 2, 5);
                og.addColorStop(0, '#fff');
                og.addColorStop(1, hexA(CHARACTERS[p.charId].accent, 0));
                ctx.fillStyle = og;
                ctx.beginPath();
                ctx.arc(x + ox, y - 2, 5, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.save();
            ctx.globalAlpha = blink ? 0.4 : p.isLocal ? 1 : 0.92;
            if (sheet) {
                const frames = p.moveDir < 0 ? sheet.def.left : p.moveDir > 0 ? sheet.def.right : sheet.def.idle;
                const idx = frames[Math.floor(p.animTime / 9) % frames.length];
                this.drawSheet(sheet, idx, x, y - 2, 58);
            } else {
                const sprites: CharacterSprites = playerSprites(p.charId);
                let frameSet = sprites.idle;
                if (p.moveDir < 0) frameSet = sprites.left;
                else if (p.moveDir > 0) frameSet = sprites.right;
                const fr = frameSet[Math.floor(p.animTime / 7) % frameSet.length];
                const sc = 1.2;
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(fr.canvas as CanvasImageSource, x - (sprites.nativeW * sc) / 2, y - (sprites.nativeH * sc) / 2 + 2, sprites.nativeW * sc, sprites.nativeH * sc);
                ctx.imageSmoothingEnabled = true;
            }
            ctx.restore();

            // name tag for co-op peers
            if (!p.isLocal) {
                ctx.fillStyle = hexA(CHARACTERS[p.charId].accent, 0.95);
                ctx.font = '8px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(p.name.slice(0, 10), x, y - 26);
                ctx.textAlign = 'left';
            }

            // hitbox indicator for the local player
            if (p.isLocal && (p.focus || this.showHitboxAlways)) {
                if (p.focus) {
                    // rotating focus reticle
                    ctx.save();
                    ctx.translate(x, y);
                    ctx.rotate(this.time * 0.004);
                    ctx.strokeStyle = '#ff5577';
                    ctx.lineWidth = 1.4;
                    ctx.beginPath();
                    for (let i = 0; i < 8; i++) {
                        const a = (Math.PI / 4) * i;
                        const r = 8;
                        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
                    }
                    ctx.closePath();
                    ctx.stroke();
                    ctx.restore();
                }
                if (this.showHitboxAlways) {
                    // thin square box outlining the true hitbox (always visible)
                    const r = p.hitboxR + 1.4;
                    ctx.strokeStyle = '#ff3b6b';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(Math.round(x - r) + 0.5, Math.round(y - r) + 0.5, Math.round(r * 2), Math.round(r * 2));
                }
                // bright core dot
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(x, y, p.hitboxR + 0.6, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        void localSlot;
        ctx.textAlign = 'left';
    }

    private drawEffects(world: World): void {
        const ctx = this.ctx;
        world.effects.forEach((e) => {
            const t = e.age / e.ttl;
            const a = 1 - t;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            if (e.kind === 'pop' || e.kind === 'ring' || e.kind === 'death' || e.kind === 'graze' || e.kind === 'spell') {
                ctx.strokeStyle = hexA(e.color, a);
                ctx.lineWidth = e.kind === 'spell' ? 4 : 2;
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.size * (0.4 + t), 0, Math.PI * 2);
                ctx.stroke();
            } else {
                ctx.fillStyle = hexA(e.color, a);
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.size * (1 - t * 0.5), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        });
    }

    private drawComments(): void {
        const ctx = this.ctx;
        ctx.save();
        ctx.font = 'bold 14px "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';
        ctx.textBaseline = 'middle';
        for (let i = this.comments.length - 1; i >= 0; i--) {
            const c = this.comments[i];
            c.x -= c.speed;
            ctx.font = `bold ${c.size}px "Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif`;
            const w = ctx.measureText(c.text).width;
            // outline for readability over danmaku
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(0,0,0,0.7)';
            ctx.strokeText(c.text, c.x, c.y);
            ctx.fillStyle = c.color;
            ctx.fillText(c.text, c.x, c.y);
            if (c.x + w < -10) this.comments.splice(i, 1);
        }
        ctx.restore();
        ctx.textBaseline = 'alphabetic';
    }

    private drawBossBar(hud: HudView): void {
        const ctx = this.ctx;
        const pad = 24;
        const w = PLAYFIELD_W - pad * 2;
        const frac = Math.max(0, Math.min(1, hud.bossHp / hud.bossMaxHp));
        // card pips
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(pad, 8, w, 5);
        const g = ctx.createLinearGradient(pad, 0, pad + w, 0);
        g.addColorStop(0, this.theme.glow);
        g.addColorStop(1, '#ffffff');
        ctx.fillStyle = g;
        ctx.fillRect(pad, 8, w * frac, 5);
        // card count pips
        for (let i = 0; i < hud.bossCards; i++) {
            ctx.fillStyle = i <= hud.bossCardIndex ? '#fff' : 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.arc(pad + 4 + (i * (w - 8)) / Math.max(1, hud.bossCards - 1), 5, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        // spell name + timer
        if (hud.spellName) {
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = 'italic 11px serif';
            ctx.textAlign = 'right';
            ctx.fillText(hud.spellName, PLAYFIELD_W - pad, 28);
            ctx.textAlign = 'left';
        }
        if (hud.spellTimeLeft >= 0) {
            ctx.fillStyle = hud.spellTimeLeft < 6 ? '#ff5577' : '#fff';
            ctx.font = 'bold 13px monospace';
            ctx.fillText(hud.spellTimeLeft.toFixed(1), pad, 28);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(hud.bossName, PLAYFIELD_W / 2, 28);
        ctx.textAlign = 'left';
    }

    private drawHud(world: World, hud: HudView, localSlot: number): void {
        const ctx = this.ctx;
        const x0 = PLAYFIELD_W;
        const g = ctx.createLinearGradient(x0, 0, CANVAS_W, 0);
        g.addColorStop(0, '#0a0614');
        g.addColorStop(1, '#140c24');
        ctx.fillStyle = g;
        ctx.fillRect(x0, 0, SIDEBAR_W, CANVAS_H);
        ctx.fillStyle = this.theme.glow;
        ctx.fillRect(x0, 0, 2, CANVAS_H);

        const x = x0 + 14;
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText('Dream', x, 36);
        ctx.fillStyle = this.theme.glow;
        ctx.fillText('Rift', x, 58);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '10px sans-serif';
        ctx.fillText(`STAGE ${hud.stageIndex + 1} · ${hud.stageName}`, x, 76);

        const local = world.players[localSlot] ?? world.players.find((p) => p.isLocal) ?? world.players[0];
        let y = 104;
        const stat = (label: string, value: string) => {
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '10px sans-serif';
            ctx.fillText(label, x, y);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 15px monospace';
            ctx.fillText(value, x + 2, y + 17);
            y += 40;
        };
        stat('HiScore', pad9(hud.hiScore));
        stat('Score', pad9(local?.score ?? 0));

        // lives / bombs
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '10px sans-serif';
        ctx.fillText('Player', x, y);
        drawIcons(ctx, x + 2, y + 4, local?.lives ?? 0, '#ffd34d');
        y += 26;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('Bomb', x, y);
        drawIcons(ctx, x + 2, y + 4, local?.bombs ?? 0, '#7fdcff');
        y += 30;

        // power
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('Power', x, y);
        const pw = SIDEBAR_W - 34;
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(x, y + 6, pw, 7);
        const pg = ctx.createLinearGradient(x, 0, x + pw, 0);
        pg.addColorStop(0, this.theme.glow);
        pg.addColorStop(1, '#fff');
        ctx.fillStyle = pg;
        ctx.fillRect(x, y + 6, pw * Math.min(1, (local?.power ?? 0) / POWER_MAX), 7);
        ctx.fillStyle = '#fff';
        ctx.font = '9px monospace';
        ctx.fillText(`${local?.power ?? 0}/${POWER_MAX}`, x + pw - 38, y + 4);
        y += 34;

        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '10px sans-serif';
        ctx.fillText('Graze', x, y);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(String(local?.graze ?? 0), x + 2, y + 16);
        y += 36;

        // co-op roster
        if (hud.coop) {
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '10px sans-serif';
            ctx.fillText('Dreamers', x, y);
            y += 14;
            for (const p of world.players) {
                if (!p.joined) continue;
                ctx.fillStyle = CHARACTERS[p.charId].accent;
                ctx.beginPath();
                ctx.arc(x + 4, y + 4, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = p.dead ? 'rgba(255,120,140,0.8)' : '#fff';
                ctx.font = p.isLocal ? 'bold 11px sans-serif' : '11px sans-serif';
                ctx.fillText(`${p.name.slice(0, 9)}`, x + 14, y + 8);
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
                ctx.font = '9px monospace';
                ctx.textAlign = 'right';
                ctx.fillText(`♥${p.lives}`, CANVAS_W - 12, y + 8);
                ctx.textAlign = 'left';
                y += 18;
            }
        }
    }
}

// ── helpers ──

function pad9(n: number): string {
    const s = Math.floor(n).toString();
    return s.padStart(9, '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function drawIcons(ctx: CanvasRenderingContext2D, x: number, y: number, n: number, color: string): void {
    ctx.fillStyle = color;
    for (let i = 0; i < Math.min(n, 8); i++) {
        star(ctx, x + i * 16 + 6, y + 6, 5, 2.2, 5);
        ctx.fill();
    }
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, spikes: number): void {
    ctx.beginPath();
    for (let k = 0; k < spikes * 2; k++) {
        const r = k % 2 === 0 ? outer : inner;
        const a = (Math.PI / spikes) * k - Math.PI / 2;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
}

const COLOR_HEX: Record<BulletColorName, string> = {
    red: '#ff3a5e', orange: '#ff8a30', yellow: '#ffe14d', green: '#4cd964', mint: '#5fe0b0',
    cyan: '#46e0ff', blue: '#4d8aff', indigo: '#7a78ff', purple: '#b06bff', magenta: '#ff5ccd', white: '#eef0ff',
};
function colorHex(c: BulletColorName): string {
    return COLOR_HEX[c] ?? '#fff';
}

function hexA(hex: string, a: number): string {
    const c = hex.replace('#', '');
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
}
