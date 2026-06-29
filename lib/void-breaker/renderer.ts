/**
 * renderer.ts — Void Breaker Visual Overhaul
 * Neon dystopian aesthetic inspired by WKW Fallen Angels.
 * Features: neon glow, scanlines, parallax silhouettes, void dust particles,
 * bloom, player/boss glow, telegraph rings, phase indicators.
 */
import type { VoidBreakerEngine } from './game';
import type { Enemy } from './types';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  ARENA_W, ARENA_H, ARENA_HW, ARENA_HH,
  MAX_SHARDS, BOSS_WAVE_INTERVAL, SHIELD_HALF_ARC,
  SPAWN_ANIM_TIME, DEATH_ANIM_TIME,
} from './constants';
import { drawSprite, drawPickupSprite } from './drawSprite';
import { PLAYER_SPRITE, ENEMY_SPRITES, BOSS_SPRITES, HEART_PICKUP_SPRITE } from './sprites';

// ── Neon Palette ──────────────────────────────────────────────────────────────
const NEON_CYAN = '#00f5ff';
const NEON_MAGENTA = '#ff00cc';
const NEON_GOLD = '#d4af37';
const PLAYER_GLOW = '#44ddff';
const BOSS_RED = '#ff2244';

// ── Seeded pseudo-random for deterministic per-frame visuals ─────────────────
const seed = (n: number) => Math.abs(Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1;

// ── Parallax city silhouette segments ────────────────────────────────────────
interface Building { x: number; w: number; h: number; depth: number; }
const CITY_BUILDINGS: Building[] = (() => {
  const buildings: Building[] = [];
  for (let i = 0; i < 44; i++) {
    buildings.push({
      x: seed(i * 3) * CANVAS_WIDTH,
      w: 24 + seed(i * 3 + 1) * 58,
      h: 80 + seed(i * 3 + 2) * 220,
      depth: 0.15 + seed(i) * 0.28,
    });
  }
  return buildings;
})();

// ── Second parallax layer (distant, dimmer) ──────────────────────────────────
const CITY_BUILDINGS_FAR: Building[] = (() => {
  const buildings: Building[] = [];
  for (let i = 0; i < 30; i++) {
    buildings.push({
      x: seed(i * 5 + 100) * CANVAS_WIDTH,
      w: 18 + seed(i * 5 + 101) * 40,
      h: 50 + seed(i * 5 + 102) * 130,
      depth: 0.05 + seed(i + 100) * 0.1,
    });
  }
  return buildings;
})();

// ── Billboard ad texts ───────────────────────────────────────────────────────
const AD_TEXTS = ['零号区', 'VOID™', '夜市', 'ネオン', 'RUN.', '虚空', 'BREACH', '堕落', '███', 'NEON'];

// ── Void dust particle system (atmospheric bg) ───────────────────────────────
interface VoidDust { x: number; y: number; vy: number; alpha: number; size: number; }
const VOID_DUST: VoidDust[] = Array.from({ length: 30 }, (_, i) => ({
  x: (Math.abs(Math.sin(i * 47.1)) % 1) * CANVAS_WIDTH,
  y: (Math.abs(Math.sin(i * 91.7)) % 1) * CANVAS_HEIGHT,
  vy: 0.15 + (Math.abs(Math.sin(i * 3.7)) % 1) * 0.25,
  alpha: 0.1 + (Math.abs(Math.sin(i * 17.3)) % 1) * 0.25,
  size: 1 + (Math.abs(Math.sin(i * 53.1)) % 1) * 2,
}));

// ── Floor puddles (world-space neon reflections) ─────────────────────────────
const PUDDLES = Array.from({ length: 14 }, (_, i) => ({
  x: 120 + seed(i * 31 + 10) * (ARENA_W - 240),
  y: 120 + seed(i * 31 + 20) * (ARENA_H - 240),
  rx: 16 + seed(i * 31 + 30) * 34,
  ry: 7 + seed(i * 31 + 31) * 13,
}));

// ── Floating embers (screen-space ambient sparks that rise) ──────────────────
interface Ember { x: number; y: number; vy: number; drift: number; size: number; warm: boolean; }
const EMBERS: Ember[] = Array.from({ length: 24 }, (_, i) => ({
  x: seed(i * 61) * CANVAS_WIDTH,
  y: seed(i * 61 + 1) * CANVAS_HEIGHT,
  vy: 0.25 + seed(i * 61 + 2) * 0.5,
  drift: seed(i * 61 + 3) * 0.6 - 0.3,
  size: 0.8 + seed(i * 61 + 4) * 1.5,
  warm: seed(i * 61 + 5) > 0.5,
}));

export class VoidBreakerRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private time = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    this.ctx = ctx;
  }

  /** Accessibility: dampen screen shake. */
  private reducedFx = false;
  setReducedFx(on: boolean): void { this.reducedFx = on; }

  getAimPoint(canvasX: number, canvasY: number, game: VoidBreakerEngine): { x: number; y: number } {
    const p = game.player;
    const viewW = ARENA_W * 0.4;
    const viewH = ARENA_H * 0.4;
    const scale = Math.min(CANVAS_WIDTH / viewW, CANVAS_HEIGHT / viewH);
    const camX = p.x - viewW / 2;
    const camY = p.y - viewH / 2;
    const wx = camX + (canvasX - CANVAS_WIDTH / 2) / scale + viewW / 2;
    const wy = camY + (canvasY - CANVAS_HEIGHT / 2) / scale + viewH / 2;
    return {
      x: Math.max(0, Math.min(ARENA_W, wx)),
      y: Math.max(0, Math.min(ARENA_H, wy)),
    };
  }

  draw(game: VoidBreakerEngine, dt: number): void {
    this.time += dt;
    const p = game.player;
    const viewW = ARENA_W * 0.4;
    const viewH = ARENA_H * 0.4;
    const scale = Math.min(CANVAS_WIDTH / viewW, CANVAS_HEIGHT / viewH);
    const shakeMul = this.reducedFx ? 1 : 4;
    const camX = p.x - viewW / 2 + game.shakeX * shakeMul;
    const camY = p.y - viewH / 2 + game.shakeY * shakeMul;

    const toScreen = (wx: number, wy: number) => ({
      x: (wx - camX) * scale + (CANVAS_WIDTH - viewW * scale) / 2,
      y: (wy - camY) * scale + (CANVAS_HEIGHT - viewH * scale) / 2,
    });

    const ctx = this.ctx;

    // ── 1. Background gradient ──────────────────────────────────────────────
    const bgGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    bgGrad.addColorStop(0, '#03030a');
    bgGrad.addColorStop(0.5, '#08081a');
    bgGrad.addColorStop(1, '#050510');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // ── 2. Ambient moving gradient blobs ───────────────────────────────────
    const t = this.time;
    const blobX = CANVAS_WIDTH / 2 + Math.sin(t * 0.18) * 200;
    const blobY = CANVAS_HEIGHT / 2 + Math.cos(t * 0.12) * 100;
    const blob = ctx.createRadialGradient(blobX, blobY, 0, blobX, blobY, 320);
    blob.addColorStop(0, 'rgba(0, 200, 255, 0.04)');
    blob.addColorStop(1, 'rgba(0, 200, 255, 0)');
    ctx.fillStyle = blob;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const blobM = ctx.createRadialGradient(
      CANVAS_WIDTH - blobX, CANVAS_HEIGHT - blobY, 0,
      CANVAS_WIDTH - blobX, CANVAS_HEIGHT - blobY, 280
    );
    blobM.addColorStop(0, 'rgba(255, 0, 200, 0.03)');
    blobM.addColorStop(1, 'rgba(255, 0, 200, 0)');
    ctx.fillStyle = blobM;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // ── 3. Parallax city silhouettes ───────────────────────────────────────
    this.drawCitySilhouettes(ctx, game.arenaPhase);

    // ── 3b. Sky drama — sweeping searchlights + occasional lightning ────────
    this.drawSkyDrama(ctx, t, game);

    // ── 4. Void dust ───────────────────────────────────────────────────────
    this.updateAndDrawVoidDust(ctx, dt);

    // ── 5+6. Arena floor — puddles, energy pulses, reflective grid ──────────
    const tl = toScreen(0, 0);
    const br = toScreen(ARENA_W, ARENA_H);
    this.drawFloor(ctx, game, toScreen, scale, t);

    // ── 7. Arena border — glowing neon inset shadow ──────────────────────────
    const borderColor = game.currentMapConfig.borderColor;
    const borderPulse = 0.7 + Math.sin(t * 1.8) * 0.3;
    const bw = br.x - tl.x, bh = br.y - tl.y;
    // Multi-layer glow: outer → inner, decreasing alpha
    const glowLayers = [
      { offset: 4, alpha: 0.08 * borderPulse, lw: 8 },
      { offset: 2, alpha: 0.15 * borderPulse, lw: 4 },
      { offset: 1, alpha: 0.25 * borderPulse, lw: 2 },
      { offset: 0, alpha: 0.70 * borderPulse, lw: 1.5 },
    ];
    for (const g of glowLayers) {
      ctx.strokeStyle = borderColor + Math.floor(g.alpha * 255).toString(16).padStart(2, '0');
      ctx.lineWidth = g.lw;
      ctx.strokeRect(tl.x - g.offset, tl.y - g.offset, bw + g.offset * 2, bh + g.offset * 2);
    }

    // ── 8. Central rift — swirling void portal ──────────────────────────────
    this.drawRift(ctx, toScreen(ARENA_HW, ARENA_HH), scale, t);

    // ── 8a. Floating embers — ambient drifting sparks ───────────────────────
    this.drawEmbers(ctx, dt, t);

    // ── 8. Pre-pass: obstacle ground shadows (flat offset) ────────────────────
    for (const o of game.obstacles) {
      if (!o.active) continue;
      const stl = toScreen(o.x, o.y);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(stl.x + 3, stl.y + 3, o.w * scale, o.h * scale);
    }

    // ── 8b. Enemy detection glow pre-pass (always visible through buildings) ──
    for (const e of game.enemies) {
      if (!e.active) continue;
      const pos = toScreen(e.x, e.y);
      const r = e.radius * scale;
      const gc = e.isBoss ? BOSS_RED : e.isElite ? NEON_MAGENTA : (e.color || '#cc4466');
      const glowGrad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, r * 3.5);
      glowGrad.addColorStop(0, gc + '55');
      glowGrad.addColorStop(0.4, gc + '22');
      glowGrad.addColorStop(1, gc + '00');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r * 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── 9. Y-sorted drawable pass (painter's algorithm) ──────────────────────
    // Obstacles with sortY = o.y + o.h (south/front edge = building face)
    // Entities with sortY = entity.y
    // Objects drawn first (lower sortY) appear behind objects drawn later.
    type Drawable = { sortY: number; draw: () => void };
    const drawables: Drawable[] = [];
    const mapBorder = game.currentMapConfig.borderColor;

    // --- Obstacles ---
    for (const o of game.obstacles) {
      if (!o.active) continue;
      drawables.push({
        sortY: o.y + o.h,
        draw: () => {
          const otl = toScreen(o.x, o.y);
          const orw = o.w * scale;
          const orh = o.h * scale;
          switch (o.type) {
            case 'building': case 'barrier': {
              // Orthographic building — roof + south-facing wall for height
              const extH = (o.extrudeHeight ?? 0) * scale;
              const facadeH = Math.max(extH * 0.35, 8);

              // South-facing wall (facade) — drawn below the footprint
              ctx.fillStyle = '#0d0d16';
              ctx.fillRect(otl.x, otl.y + orh, orw, facadeH);
              // Facade window lights
              const fCols = Math.max(1, Math.floor(orw / 9));
              const fRows = Math.max(1, Math.floor(facadeH / 11));
              for (let wr = 0; wr < fRows; wr++) {
                for (let wc = 0; wc < fCols; wc++) {
                  const wSeed = seed(o.id * 100 + wr * 20 + wc + 500);
                  if (wSeed > 0.45) {
                    const wColors = [
                      `rgba(0,245,255,${0.3 + wSeed * 0.2})`,
                      `rgba(255,200,80,${0.25 + wSeed * 0.15})`,
                      `rgba(255,0,204,${0.2 + wSeed * 0.15})`,
                    ];
                    ctx.fillStyle = wColors[Math.floor(wSeed * 3)];
                    ctx.fillRect(otl.x + wc * 9 + 2, otl.y + orh + wr * 11 + 3, 4, 5);
                  }
                }
              }
              // Facade bottom neon strip
              ctx.fillStyle = mapBorder + '33';
              ctx.fillRect(otl.x, otl.y + orh + facadeH - 2, orw, 2);
              // Facade border
              ctx.strokeStyle = mapBorder + '33';
              ctx.lineWidth = 0.5;
              ctx.strokeRect(otl.x, otl.y + orh, orw, facadeH);

              // Left-edge darkening for depth
              ctx.fillStyle = '#08080f';
              ctx.fillRect(otl.x - 2, otl.y, 2, orh + facadeH);

              // Roof (top face)
              ctx.fillStyle = '#1a1a26';
              ctx.fillRect(otl.x, otl.y, orw, orh);
              // Roof window lights
              const wCols = Math.max(1, Math.floor(orw / 8));
              const wRows = Math.max(1, Math.floor(orh / 10));
              for (let wr = 0; wr < wRows; wr++) {
                for (let wc = 0; wc < wCols; wc++) {
                  const wSeed = seed(o.id * 100 + wr * 20 + wc);
                  if (wSeed > 0.5) {
                    const rColors = ['rgba(0,245,255,0.18)', 'rgba(255,200,80,0.14)', 'rgba(255,0,204,0.1)'];
                    ctx.fillStyle = rColors[Math.floor(wSeed * 3)];
                    ctx.fillRect(otl.x + wc * 8 + 2, otl.y + wr * 10 + 3, 3, 4);
                  }
                }
              }
              // Roof top-edge highlight
              ctx.fillStyle = mapBorder + '55';
              ctx.fillRect(otl.x, otl.y, orw, 2);
              // Roof border
              ctx.strokeStyle = mapBorder + '44';
              ctx.lineWidth = 1;
              ctx.strokeRect(otl.x, otl.y, orw, orh);
              break;
            }
            case 'debris': {
              ctx.fillStyle = '#1a1420';
              ctx.fillRect(otl.x, otl.y, orw, orh);
              ctx.strokeStyle = 'rgba(0,245,255,0.1)';
              ctx.lineWidth = 0.5;
              for (let dl = 0; dl < 3; dl++) {
                const dx = otl.x + seed(o.id * 30 + dl) * orw;
                const dy = otl.y + seed(o.id * 30 + dl + 10) * orh;
                ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + orw * 0.4, dy + orh * 0.3); ctx.stroke();
              }
              break;
            }
            case 'tree': {
              // Top-down canopy circle at footprint center
              const hp_frac = o.hp / o.maxHp;
              const cx = otl.x + orw / 2;
              const cy = otl.y + orh / 2;
              const canopyR = Math.max(orw, orh) * 0.55 * Math.max(0.4, hp_frac);
              const treeGr = ctx.createRadialGradient(cx, cy, 0, cx, cy, canopyR);
              treeGr.addColorStop(0, `rgba(20, 80, 20, ${0.9 * hp_frac})`);
              treeGr.addColorStop(0.6, `rgba(10, 50, 10, ${0.7 * hp_frac})`);
              treeGr.addColorStop(1, 'rgba(0, 30, 0, 0)');
              ctx.fillStyle = treeGr;
              ctx.beginPath();
              ctx.arc(cx, cy, canopyR, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = `rgba(0, 200, 60, ${hp_frac * 0.35})`;
              ctx.lineWidth = 1;
              ctx.stroke();
              break;
            }
            case 'terminal': {
              const tGlow = o.glowColor ?? '#00ff88';
              const tPulse = 0.6 + Math.sin(t * 3 + o.id) * 0.4;
              ctx.fillStyle = '#0a100a';
              ctx.fillRect(otl.x, otl.y, orw, orh);
              ctx.strokeStyle = tGlow;
              ctx.lineWidth = 1.5;
              ctx.strokeRect(otl.x, otl.y, orw, orh);
              ctx.fillStyle = tGlow + Math.floor(tPulse * 100).toString(16).padStart(2, '0');
              ctx.font = `${Math.ceil(7 * scale)}px monospace`;
              ctx.textAlign = 'center';
              ctx.fillText('LOG', otl.x + orw / 2, otl.y + orh / 2 + 3);
              ctx.textAlign = 'left';
              break;
            }
            case 'hazard': {
              const hglow = o.glowColor ?? '#ff00cc';
              const hpulse = 0.5 + Math.sin(t * 2.5 + o.id * 0.7) * 0.5;
              ctx.fillStyle = hglow + '22';
              ctx.fillRect(otl.x, otl.y, orw, orh);
              ctx.strokeStyle = hglow + Math.floor(hpulse * 136 + 50).toString(16).padStart(2, '0');
              ctx.lineWidth = 2;
              ctx.strokeRect(otl.x, otl.y, orw, orh);
              break;
            }
            case 'billboard': {
              // Flat billboard panel at footprint
              const bGlow = o.glowColor ?? NEON_CYAN;
              const bPulse = 0.7 + Math.sin(t * 2 + o.id * 1.3) * 0.3;
              ctx.fillStyle = '#0a0a18';
              ctx.fillRect(otl.x, otl.y, orw, orh);
              ctx.strokeStyle = bGlow;
              ctx.lineWidth = 1.5;
              ctx.strokeRect(otl.x, otl.y, orw, orh);
              const adIndex = o.id % AD_TEXTS.length;
              ctx.font = `bold ${Math.ceil(Math.min(orh * 0.55, 10 * scale))}px monospace`;
              ctx.fillStyle = bGlow + Math.floor(bPulse * 200 + 55).toString(16).padStart(2, '0');
              ctx.textAlign = 'center';
              ctx.fillText(AD_TEXTS[adIndex], otl.x + orw / 2, otl.y + orh * 0.65);
              ctx.textAlign = 'left';
              if (Math.sin(t * 7 + o.id * 3.7) > 0.92) {
                ctx.fillStyle = bGlow + '22';
                ctx.fillRect(otl.x, otl.y, orw, orh);
              }
              break;
            }
          }
        },
      });
    }

    // --- Shards ---
    for (const s of game.shards) {
      if (!s.active) continue;
      drawables.push({
        sortY: s.y,
        draw: () => {
          const pos = toScreen(s.x, s.y);
          const sz = (s.collected ? 3 : 5) * scale;
          const pulse = s.collected ? 1 : 0.7 + Math.sin(t * 4 + s.orbitAngle) * 0.3;
          ctx.globalAlpha = pulse;
          ctx.fillStyle = s.collected ? NEON_GOLD : NEON_CYAN;
          ctx.beginPath();
          ctx.moveTo(pos.x + sz, pos.y);
          ctx.lineTo(pos.x - sz * 0.5, pos.y + sz * 0.87);
          ctx.lineTo(pos.x - sz * 0.5, pos.y - sz * 0.87);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1;
        },
      });
    }

    // --- Enemies ---
    for (const e of game.enemies) {
      if (!e.active) continue;
      drawables.push({
        sortY: e.y,
        draw: () => {
          const pos = toScreen(e.x, e.y);
          const r = e.radius * scale;
          const baseColor = e.isElite ? NEON_MAGENTA : (e.color || '#cc4466');
          // Void form: boss is phased-out / intangible — render as a faint apparition.
          const voidPhased = e.isBoss && e.bossSpecialActive;
          const fxBoost = this.reducedFx ? 0.4 : 1;

          // Task 4 — spawn warp-in / death dissolve lifecycle.
          let animScale = 1, animAlpha = 1, animT = 1;
          if (e.anim === 'spawning') {
            animT = Math.max(0, Math.min(1, 1 - e.animTimer / SPAWN_ANIM_TIME));
            animScale = 0.3 + 0.7 * animT;
            animAlpha = animT;
          } else if (e.anim === 'dying') {
            animT = Math.max(0, Math.min(1, e.animTimer / DEATH_ANIM_TIME));
            animScale = 1 + (1 - animT) * 0.6;
            animAlpha = animT;
          }

          const prevAlpha = ctx.globalAlpha;

          // Expanding telegraph ring that resolves inward as the enemy warps in.
          if (e.anim === 'spawning') {
            ctx.globalAlpha = prevAlpha * (1 - animT) * 0.7 * fxBoost;
            ctx.strokeStyle = baseColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, r * (2 - animT), 0, Math.PI * 2);
            ctx.stroke();
          }

          ctx.globalAlpha = prevAlpha * (voidPhased ? 0.16 : 1) * animAlpha;
          ctx.save();
          if (animScale !== 1) {
            ctx.translate(pos.x, pos.y);
            ctx.scale(animScale, animScale);
            ctx.translate(-pos.x, -pos.y);
          }
          if (e.isBoss && e.telegraphTimer > 0) {
            const telegraphAlpha = Math.min(1, e.telegraphTimer * 2);
            ctx.strokeStyle = `rgba(255, 0, 80, ${telegraphAlpha})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 120 * scale, 0, Math.PI * 2);
            ctx.stroke();
          }
          // Sniper aim-line telegraph — brightens as the shot charges.
          if (e.type === 'sniper' && e.bossSpecialActive && e.telegraphTimer > 0) {
            const a = e.bossSpecialAngle;
            const len = 720 * scale;
            const alpha = 0.25 + 0.55 * (1 - e.telegraphTimer / 0.85);
            ctx.strokeStyle = `rgba(255, 80, 60, ${alpha})`;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
            ctx.lineTo(pos.x + Math.cos(a) * len, pos.y + Math.sin(a) * len);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          // Shielded enemy's frontal shield arc (where shots are deflected).
          if (e.type === 'shielded') {
            const a = e.bossSpecialAngle;
            ctx.strokeStyle = 'rgba(130, 165, 255, 0.9)';
            ctx.lineWidth = 3 * scale;
            ctx.shadowColor = '#5577ff';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, r + 5 * scale, a - SHIELD_HALF_ARC, a + SHIELD_HALF_ARC);
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
          if (e.isBoss && e.bossPhase > 1) {
            ctx.strokeStyle = (e.bossPhase === 3 ? '#ff0033' : '#ff6622') + '60';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, r + 8, 0, Math.PI * 2);
            ctx.stroke();
          }
          const spriteConfig = e.isBoss
            ? BOSS_SPRITES[Math.floor(game.wave / BOSS_WAVE_INTERVAL)]
            : ENEMY_SPRITES[e.type];
          const spriteDrawn = spriteConfig ? drawSprite(ctx, spriteConfig, {
            x: pos.x, y: pos.y, radius: r, angle: e.angle, vx: e.vx, vy: e.vy,
            hitFlashUntil: e.hitFlashUntil,
            aimAngle: Math.atan2(game.player.y - e.y, game.player.x - e.x),
          }, game.elapsedMs, 1) : false;
          if (!spriteDrawn) {
            // Distinct procedural silhouettes for the spriteless enemy archetypes
            // so they read as intentional, not placeholder circles.
            const faceAngle = Math.atan2(game.player.y - e.y, game.player.x - e.x);
            ctx.fillStyle = baseColor;
            ctx.shadowColor = baseColor;
            ctx.shadowBlur = 8;
            if (e.type === 'sniper') {
              this.drawSniperBody(ctx, e, pos.x, pos.y, r, faceAngle, baseColor, game.elapsedMs);
            } else if (e.type === 'shielded') {
              this.drawShieldedBody(ctx, pos.x, pos.y, r, baseColor, game.elapsedMs);
            } else if (e.type === 'healer') {
              // Round body with a bright medic cross.
              ctx.beginPath();
              ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
              ctx.fill();
              ctx.shadowBlur = 0;
              ctx.fillStyle = '#eafff4';
              const cw = r * 0.32, cl = r * 0.9;
              ctx.fillRect(pos.x - cw / 2, pos.y - cl, cw, cl * 2);
              ctx.fillRect(pos.x - cl, pos.y - cw / 2, cl * 2, cw);
            } else {
              ctx.beginPath();
              ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.shadowBlur = 0;
          }
          if (e.isBoss) {
            ctx.strokeStyle = NEON_GOLD + 'aa';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
            ctx.stroke();
            if (e.bossPhase > 1) {
              ctx.font = `bold ${Math.ceil(8 * scale)}px monospace`;
              ctx.fillStyle = e.bossPhase === 3 ? '#ff3355' : '#ff8844';
              ctx.textAlign = 'center';
              ctx.fillText(`P${e.bossPhase}`, pos.x, pos.y - r - 4);
              ctx.textAlign = 'left';
            }
          }
          if (e.isBoss && e.bossPhase === 3) {
            ctx.save();
            ctx.translate(pos.x, pos.y);
            ctx.rotate(e.tentacleAngle);
            ctx.strokeStyle = 'rgba(255, 0, 80, 0.35)';
            ctx.lineWidth = 4 * scale;
            ctx.beginPath();
            ctx.arc(0, 0, r + 20 * scale, -0.4, 0.4);
            ctx.stroke();
            ctx.restore();
          }
          if (!e.isBoss && e.hp < e.maxHp) {
            const barW = r * 2, barH = 3;
            const bx = pos.x - r, by = pos.y - r - 6;
            ctx.fillStyle = '#333';
            ctx.fillRect(bx, by, barW, barH);
            ctx.fillStyle = e.isElite ? NEON_MAGENTA : NEON_CYAN;
            ctx.fillRect(bx, by, barW * (e.hp / e.maxHp), barH);
          }
          // Death dissolve — flash toward white as the body scales out.
          if (e.anim === 'dying') {
            ctx.globalAlpha = prevAlpha * (1 - animT) * 0.6;
            const wg = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, r * 1.2);
            wg.addColorStop(0, 'rgba(255,255,255,0.9)');
            wg.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = wg;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, r * 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          ctx.globalAlpha = prevAlpha;
        },
      });
    }

    // --- Player ---
    drawables.push({
      sortY: p.y,
      draw: () => {
        const playerPos = toScreen(p.x, p.y);
        // Task 5 — recoil kick: shove the sprite backward along the aim (visual only).
        const recoilK = p.recoil * 6 * (this.reducedFx ? 0.5 : 1);
        playerPos.x -= Math.cos(p.aimAngle) * recoilK;
        playerPos.y -= Math.sin(p.aimAngle) * recoilK;
        const pr = p.radius * scale;
        const isInvincible = game.elapsedMs < p.invincibleUntil && Math.floor(game.elapsedMs / 80) % 2 === 0;
        if (!isInvincible) {
          if (p.focusActive) {
            const fGlow = ctx.createRadialGradient(playerPos.x, playerPos.y, 0, playerPos.x, playerPos.y, pr * 5);
            fGlow.addColorStop(0, 'rgba(0, 240, 255, 0.25)');
            fGlow.addColorStop(1, 'rgba(0, 240, 255, 0)');
            ctx.fillStyle = fGlow;
            ctx.beginPath();
            ctx.arc(playerPos.x, playerPos.y, pr * 5, 0, Math.PI * 2);
            ctx.fill();
          }
          const playerSpriteDrawn = drawSprite(ctx, PLAYER_SPRITE, {
            x: playerPos.x, y: playerPos.y, radius: pr,
            angle: p.aimAngle, aimAngle: p.aimAngle,
            hitFlashUntil: p.hitFlashUntil,
          }, game.elapsedMs, 1);
          if (!playerSpriteDrawn) {
            const playerColor = p.dashActive ? '#ffffff' : p.focusActive ? PLAYER_GLOW : NEON_GOLD;
            ctx.fillStyle = playerColor;
            ctx.beginPath();
            ctx.arc(playerPos.x, playerPos.y, pr, 0, Math.PI * 2);
            ctx.fill();
          }
          const wingScale = Math.min(p.shards / MAX_SHARDS, 1);
          if (wingScale > 0) {
            const wingPulse = wingScale * (0.8 + Math.sin(t * 4) * 0.2);
            ctx.strokeStyle = NEON_CYAN + Math.floor(wingPulse * 180).toString(16).padStart(2, '0');
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(playerPos.x - pr * 0.5, playerPos.y);
            ctx.lineTo(playerPos.x - pr * 1.4, playerPos.y - pr * wingScale * 1.2);
            ctx.moveTo(playerPos.x - pr * 0.5, playerPos.y);
            ctx.lineTo(playerPos.x - pr * 1.4, playerPos.y + pr * wingScale * 1.2);
            ctx.stroke();
          }
        }
      },
    });

    // --- Ally ---
    const ally = game.allyCtrl.ally;
    if (ally.active) {
      drawables.push({
        sortY: ally.y,
        draw: () => {
          const apos = toScreen(ally.x, ally.y);
          const ar = ally.radius * scale;
          const isDowned = ally.state === 'downed';
          const allyPulse = isDowned ? 0.4 + Math.sin(t * 6) * 0.4 : 0.8 + Math.sin(ally.phase * 4) * 0.2;
          ctx.fillStyle = isDowned ? `rgba(100, 100, 100, ${allyPulse})` : '#00ff88';
          ctx.beginPath();
          ctx.arc(apos.x, apos.y, ar, 0, Math.PI * 2);
          ctx.fill();
          if (!isDowned) {
            const barW = ar * 2.5, bx = apos.x - barW / 2, by = apos.y - ar - 7;
            ctx.fillStyle = '#333'; ctx.fillRect(bx, by, barW, 3);
            ctx.fillStyle = '#00ff88'; ctx.fillRect(bx, by, barW * (ally.hp / ally.maxHp), 3);
          }
          ctx.font = `bold ${Math.ceil(7 * scale)}px monospace`;
          ctx.fillStyle = isDowned ? '#888888' : '#00ff88';
          ctx.textAlign = 'center';
          ctx.fillText(isDowned ? 'DOWN' : 'LIN', apos.x, apos.y + ar + 10);
          ctx.textAlign = 'left';
        },
      });
    }

    // --- Heart pickups ---
    for (const h of game.heartPickups) {
      if (!h.active) continue;
      drawables.push({
        sortY: h.y,
        draw: () => {
          const hpos = toScreen(h.x, h.y);
          const fadeAlpha = Math.min(1, h.lifetime / 3);
          ctx.globalAlpha = fadeAlpha;
          const drawn = drawPickupSprite(ctx, HEART_PICKUP_SPRITE, hpos.x, hpos.y, t, scale);
          if (!drawn) {
            const bob = Math.sin(t * 3) * 3;
            ctx.fillStyle = '#ff00cc';
            ctx.save();
            ctx.translate(hpos.x, hpos.y + bob);
            ctx.rotate(Math.PI / 4);
            ctx.fillRect(-5 * scale, -5 * scale, 10 * scale, 10 * scale);
            ctx.restore();
          }
          ctx.globalAlpha = 1;
        },
      });
    }

    // Sort by world Y (ascending) and draw
    drawables.sort((a, b) => a.sortY - b.sortY);
    for (const d of drawables) d.draw();

    // ── Post-sort: Projectiles (always on top of world objects) ──────────────
    for (const pr of game.projectiles) {
      if (!pr.active) continue;
      const pos = toScreen(pr.x, pr.y);
      if (pr.fuse > 0) {
        // Bomb telegraph: a danger ring that fills in as the fuse runs out.
        const fill = 1 - Math.max(0, pr.fuse) / 1.3;
        const br = pr.blastRadius * scale;
        ctx.fillStyle = `rgba(255,120,40,${0.05 + fill * 0.18})`;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, br, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(255,150,60,${0.5 + fill * 0.5})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, br, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffcc66';
        ctx.beginPath(); ctx.arc(pos.x, pos.y, Math.max(2, 5 * scale), 0, Math.PI * 2); ctx.fill();
        continue;
      }
      const r = Math.max(2, pr.radius * scale);
      const projColor = pr.isPlayer ? NEON_CYAN : NEON_MAGENTA;
      // Task 5 — build-distinct projectiles: piercing rounds elongate into a
      // beam; high-caliber (large) rounds are bigger with a heavier glow.
      const heavy = pr.radius >= 6;
      const piercing = pr.pierce > 0;
      if (piercing || heavy) {
        ctx.save();
        ctx.shadowColor = projColor;
        ctx.shadowBlur = (heavy ? 14 : 8) * (this.reducedFx ? 0.5 : 1);
        if (piercing) {
          const ang = Math.atan2(pr.vy, pr.vx);
          const len = r * 4;
          ctx.strokeStyle = projColor;
          ctx.lineCap = 'round';
          ctx.lineWidth = r * 1.5;
          ctx.beginPath();
          ctx.moveTo(pos.x - Math.cos(ang) * len, pos.y - Math.sin(ang) * len);
          ctx.lineTo(pos.x + Math.cos(ang) * len * 0.3, pos.y + Math.sin(ang) * len * 0.3);
          ctx.stroke();
        }
        ctx.fillStyle = projColor;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, heavy ? r * 1.4 : r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = projColor;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── Post-sort: Particles ─────────────────────────────────────────────────
    for (const pt of game.particles) {
      if (!pt.active) continue;
      const pos = toScreen(pt.x, pt.y);
      const alpha = pt.life / pt.maxLife;
      ctx.fillStyle = pt.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, pt.size * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Post-sort: Shockwaves (expanding rings) ──────────────────────────────
    for (const sw of game.shockwaves) {
      const pos = toScreen(sw.x, sw.y);
      const alpha = sw.life / sw.maxLife;
      ctx.strokeStyle = sw.color + Math.floor(alpha * 200).toString(16).padStart(2, '0');
      ctx.lineWidth = Math.max(1, sw.width * scale * (0.4 + alpha * 0.6));
      ctx.shadowColor = sw.color;
      ctx.shadowBlur = 14 * alpha;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, Math.max(1, sw.radius * scale), 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // ── Post-sort: Player HP Bar (always on top) ─────────────────────────────
    if (game.state === 'playing') {
      const playerPos = toScreen(p.x, p.y);
      const pr = p.radius * scale;
      const hpBarWidth = 40 * scale;
      const hpBarHeight = 4 * scale;
      const hpBarX = playerPos.x - hpBarWidth / 2;
      const hpBarY = playerPos.y + pr + 6;
      const hpFraction = p.hp / p.maxHp;
      ctx.fillStyle = 'rgba(20, 20, 30, 0.7)';
      ctx.fillRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);
      let hpBarColor: string;
      if (hpFraction > 0.6) hpBarColor = '#00ff88';
      else if (hpFraction > 0.3) hpBarColor = '#ffaa00';
      else hpBarColor = '#ff2244';
      ctx.fillStyle = hpBarColor;
      ctx.fillRect(hpBarX, hpBarY, hpBarWidth * hpFraction, hpBarHeight);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);
      ctx.font = `bold ${Math.ceil(7 * scale)}px monospace`;
      ctx.fillStyle = hpBarColor;
      ctx.textAlign = 'center';
      ctx.fillText(`${p.hp}/${p.maxHp}`, playerPos.x, hpBarY + hpBarHeight + 9);
      ctx.textAlign = 'left';
      const recentlyHit = game.elapsedMs < p.hitFlashUntil + 200;
      if (recentlyHit) {
        const flashAlpha = 0.3 + Math.sin(game.elapsedMs * 0.02) * 0.3;
        ctx.fillStyle = `rgba(255, 0, 50, ${flashAlpha})`;
        ctx.fillRect(hpBarX - 2, hpBarY - 1, hpBarWidth + 4, hpBarHeight + 2);
      }
    }

    // ── Task 6: hit sparks on freshly-hit enemies (cheap, capped) ─────────────
    let sparkBudget = this.reducedFx ? 6 : 16;
    const sparkN = this.reducedFx ? 2 : 4;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < game.enemies.length && sparkBudget > 0; i++) {
      const e = game.enemies[i];
      if (!e.active || e.anim !== 'alive' || game.elapsedMs >= e.hitFlashUntil) continue;
      const pos = toScreen(e.x, e.y);
      const er = e.radius * scale;
      for (let k = 0; k < sparkN && sparkBudget > 0; k++, sparkBudget--) {
        const a = seed(i * 7.3 + k * 2.1) * Math.PI * 2;
        const d0 = er * 0.8;
        const d1 = d0 + (4 + seed(i * 3.1 + k) * 7) * scale;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(pos.x + Math.cos(a) * d0, pos.y + Math.sin(a) * d0);
        ctx.lineTo(pos.x + Math.cos(a) * d1, pos.y + Math.sin(a) * d1);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // ── 16. Popups — damage numbers scaled/colored by magnitude, CRIT pop-in ──
    for (const pop of game.popups) {
      const pos = toScreen(pop.x, pop.y);
      const lifeFrac = pop.life / pop.maxLife;   // 1 → 0
      const age = 1 - lifeFrac;                   // 0 → 1
      const alpha = Math.min(1, lifeFrac * 1.5);  // hold then fade out
      const isCrit = pop.text.includes('CRIT');
      const m = /([+-]?\d+)/.exec(pop.text);
      const mag = m ? Math.abs(parseInt(m[1], 10)) : 0;
      let size = 13 + Math.min(18, mag / 12);     // bigger hits read bigger
      let scl = 1;
      let color = pop.color;
      if (isCrit) {
        // Punchy pop-in: scale from 1.6 → 1 over the first third of life.
        scl = 1 + Math.max(0, 1 - age / 0.35) * 0.6;
        size += 4;
        color = '#ffe24a';
      } else if (mag >= 80) color = '#ff7b3a';
      else if (mag >= 30) color = '#ffd24a';
      const drift = age * 22 * scale;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${Math.round(size * scl)}px monospace`;
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      if (isCrit) { ctx.shadowColor = color; ctx.shadowBlur = 8; }
      ctx.fillText(pop.text, pos.x, pos.y - drift);
      ctx.restore();
    }
    ctx.textAlign = 'left';

    // ── 17. Scanline overlay ─────────────────────────────────────────────────
    this.drawScanlines(ctx);

    // ── 18. Vignette ─────────────────────────────────────────────────────────
    this.drawVignette(ctx, game);

    // ── 19. Combat escalation glow + boss-death flash (Tasks 6 & 8) ──────────
    this.drawCombatGlow(ctx, game);
  }

  /**
   * Screen-space combat juice: a white boss-death flash driven by slowMoTimer,
   * plus a combo/surge escalation edge-glow that intensifies (and shifts hue on
   * a surge takeover) as the streak climbs. Presentation only; honors reducedFx.
   */
  private drawCombatGlow(ctx: CanvasRenderingContext2D, game: VoidBreakerEngine): void {
    const fx = this.reducedFx ? 0.4 : 1;

    // Task 8 — boss-death white flash (the slow-mo "moment").
    if (game.slowMoTimer > 0) {
      const f = game.slowMoTimer / 0.6;
      ctx.fillStyle = `rgba(255,255,255,${(f * f * 0.5 * fx).toFixed(3)})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // Task 6/8 — combo + surge escalation edge-glow.
    const combo = game.comboMultiplier, surge = game.surgeMultiplier;
    const escal = Math.max(0, Math.min(1, (Math.max(combo, surge) - 1.4) / 1.6));
    if (escal <= 0.001) return;
    const surgeHot = Math.max(0, Math.min(1, (surge - 1.4) / 1.6));
    const pulse = 0.6 + 0.4 * Math.sin(this.time * 8);
    const cx = CANVAS_WIDTH / 2, cy = CANVAS_HEIGHT / 2;
    // Surge takeover dials up intensity and shifts the hue cyan → magenta.
    const col = surgeHot > 0.5 ? '255,90,210' : '0,230,255';
    const a = escal * (0.1 + 0.12 * surgeHot) * pulse * fx;
    const g = ctx.createRadialGradient(cx, cy, CANVAS_HEIGHT * 0.45, cx, cy, CANVAS_HEIGHT * 0.95);
    g.addColorStop(0, `rgba(${col},0)`);
    g.addColorStop(1, `rgba(${col},${a.toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  /**
   * Sniper "predator drone" — swept hunter body with a spinning targeting
   * reticle and a charging eye that flares red as it locks a shot.
   */
  private drawSniperBody(
    ctx: CanvasRenderingContext2D, e: Enemy,
    x: number, y: number, r: number, faceAngle: number, color: string, timeMs: number,
  ): void {
    const tt = timeMs / 1000;
    const charging = e.bossSpecialActive;
    const chargeFrac = charging ? 1 - Math.max(0, e.telegraphTimer) / 0.85 : 0;
    const ringColor = charging ? '#ff3b30' : color;

    // Spinning targeting reticle — contracts toward the body as the shot charges.
    const reticleR = r * (charging ? 1.5 - chargeFrac * 0.5 : 1.55);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tt * 2.2);
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 1.4;
    ctx.shadowColor = ringColor;
    ctx.shadowBlur = 6;
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      ctx.arc(0, 0, reticleR, k * Math.PI - 0.55, k * Math.PI + 0.55);
      ctx.stroke();
    }
    ctx.restore();

    // Hunter body — swept fins + forward fuselage.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(faceAngle);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(r * 0.2, 0);
    ctx.lineTo(-r * 0.95, r * 1.05);
    ctx.lineTo(-r * 0.5, 0);
    ctx.lineTo(-r * 0.95, -r * 1.05);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(r * 1.55, 0);
    ctx.lineTo(-r * 0.35, r * 0.42);
    ctx.lineTo(-r * 0.35, -r * 0.42);
    ctx.closePath();
    ctx.fill();
    // Front lens / eye.
    const lensPulse = charging ? 0.55 + 0.45 * Math.sin(timeMs * 0.03) : 0.45 + 0.3 * Math.sin(tt * 4);
    ctx.shadowBlur = charging ? 18 : 10;
    ctx.fillStyle = charging ? `rgba(255,70,50,${lensPulse})` : `rgba(255,225,150,${lensPulse})`;
    ctx.beginPath();
    ctx.arc(r * 1.0, 0, r * (0.26 + chargeFrac * 0.12), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;
  }

  /**
   * Shielded "bastion core" — an armored octagon with rotating plate segments
   * and a pulsing energy heart (its frontal shield arc is drawn separately).
   */
  private drawShieldedBody(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, r: number, color: string, timeMs: number,
  ): void {
    const tt = timeMs / 1000;
    // Octagon core.
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * (Math.PI / 4) + Math.PI / 8;
      const X = Math.cos(a) * r * 0.72, Y = Math.sin(a) * r * 0.72;
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    // Rotating armor plates (thick arc segments with a bright leading edge).
    ctx.rotate(tt * 0.6);
    for (let k = 0; k < 4; k++) {
      const a0 = k * (Math.PI / 2) + 0.28;
      ctx.strokeStyle = color;
      ctx.lineWidth = r * 0.34;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.96, a0, a0 + Math.PI / 2 - 0.5);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.12, a0, a0 + Math.PI / 2 - 0.5);
      ctx.stroke();
    }
    ctx.restore();
    // Pulsing energy heart.
    const corePulse = 0.4 + 0.4 * Math.sin(tt * 3);
    ctx.fillStyle = `rgba(190,215,255,${corePulse})`;
    ctx.shadowColor = '#9cc0ff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  /** Animated arena floor — puddle reflections, energy pulse rings, reflective grid. */
  private drawFloor(
    ctx: CanvasRenderingContext2D, game: VoidBreakerEngine,
    toScreen: (wx: number, wy: number) => { x: number; y: number },
    scale: number, t: number,
  ): void {
    const tl = toScreen(0, 0);
    const br = toScreen(ARENA_W, ARENA_H);
    const fw = br.x - tl.x, fh = br.y - tl.y;
    const amb = game.currentMapConfig.borderColor;
    ctx.fillStyle = game.currentMapConfig.floorColor;
    ctx.fillRect(tl.x, tl.y, fw, fh);

    ctx.save();
    ctx.beginPath();
    ctx.rect(tl.x, tl.y, fw, fh);
    ctx.clip();

    // Puddle reflections shimmering with the ambient neon.
    for (let i = 0; i < PUDDLES.length; i++) {
      const pu = PUDDLES[i];
      const c = toScreen(pu.x, pu.y);
      const shimmer = Math.max(0, 0.05 + 0.035 * Math.sin(t * 1.5 + i * 1.3));
      ctx.fillStyle = amb + Math.floor(shimmer * 255).toString(16).padStart(2, '0');
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, pu.rx * scale, pu.ry * scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Energy pulse rings radiating from the central rift.
    const ctr = toScreen(ARENA_HW, ARENA_HH);
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.22 + k / 3) % 1;
      const rad = ph * ARENA_W * 0.62 * scale;
      const a = (1 - ph) * 0.1;
      ctx.strokeStyle = amb + Math.floor(a * 255).toString(16).padStart(2, '0');
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ctr.x, ctr.y, rad, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Grid — every 4th line is a brighter infrastructure seam.
    const gridColor = game.currentMapConfig.gridColor;
    for (let x = 0; x <= ARENA_W; x += 80) {
      const s = toScreen(x, 0), e = toScreen(x, ARENA_H);
      const major = (x / 80) % 4 === 0;
      ctx.strokeStyle = major ? amb + '2e' : gridColor;
      ctx.lineWidth = major ? 1.1 : 0.7;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    }
    for (let y = 0; y <= ARENA_H; y += 80) {
      const s = toScreen(0, y), e = toScreen(ARENA_W, y);
      const major = (y / 80) % 4 === 0;
      ctx.strokeStyle = major ? amb + '2e' : gridColor;
      ctx.lineWidth = major ? 1.1 : 0.7;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    }
    ctx.restore();
  }

  /** Swirling void portal at arena center — rotating spiral arms + pulsing core. */
  private drawRift(ctx: CanvasRenderingContext2D, center: { x: number; y: number }, scale: number, t: number): void {
    const R = 55 * scale;
    const pulse = 0.7 + Math.sin(t * 2.5) * 0.3;
    const grad = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, R);
    grad.addColorStop(0, `rgba(150,90,255,${0.4 * pulse})`);
    grad.addColorStop(0.5, `rgba(0,200,255,${0.16 * pulse})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(center.x, center.y, R, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(t * 0.6);
    ctx.strokeStyle = `rgba(190,130,255,${0.38 * pulse})`;
    ctx.lineWidth = 1.4;
    for (let arm = 0; arm < 4; arm++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      for (let s = 0; s <= 1.0001; s += 0.1) {
        const ang = s * 3.2;
        const rr = s * R * 0.92;
        const X = Math.cos(ang) * rr, Y = Math.sin(ang) * rr;
        if (s === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      }
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = `rgba(225,232,255,${0.6 * pulse})`;
    ctx.shadowColor = '#9cc0ff';
    ctx.shadowBlur = 20 * pulse;
    ctx.beginPath();
    ctx.arc(center.x, center.y, 6 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  /** Sweeping searchlight cones + an occasional lightning strike (storms harder in boss fights). */
  private drawSkyDrama(ctx: CanvasRenderingContext2D, t: number, game: VoidBreakerEngine): void {
    const lights = [
      { ox: CANVAS_WIDTH * 0.2, base: -0.18, sweep: 0.5, speed: 0.25, hue: 'rgba(120,200,255,' },
      { ox: CANVAS_WIDTH * 0.8, base: 0.18, sweep: 0.5, speed: 0.19, hue: 'rgba(255,120,220,' },
    ];
    for (const L of lights) {
      const ang = Math.PI / 2 + L.base + Math.sin(t * L.speed) * L.sweep;
      const len = CANVAS_HEIGHT * 1.1;
      const hw = 0.06;
      const x1 = L.ox + Math.cos(ang - hw) * len, y1 = Math.sin(ang - hw) * len;
      const x2 = L.ox + Math.cos(ang + hw) * len, y2 = Math.sin(ang + hw) * len;
      const g = ctx.createLinearGradient(L.ox, 0, (x1 + x2) / 2, (y1 + y2) / 2);
      g.addColorStop(0, L.hue + '0.10)');
      g.addColorStop(1, L.hue + '0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(L.ox, 0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.closePath();
      ctx.fill();
    }

    // Lightning — more frequent and brighter while a boss is alive.
    const bossActive = game.enemies.some((e) => e.active && e.isBoss);
    const period = bossActive ? 0.16 : 0.07; // cycles/sec
    const cycle = (t * period) % 1;
    if (cycle < 0.045) {
      const flash = 1 - cycle / 0.045;
      const intensity = bossActive ? 0.2 : 0.12;
      ctx.fillStyle = bossActive
        ? `rgba(255,150,170,${intensity * flash})`
        : `rgba(170,210,255,${intensity * flash})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      const strike = Math.floor(t * period);
      const bx = seed(strike * 7) * CANVAS_WIDTH;
      ctx.strokeStyle = `rgba(225,238,255,${0.5 * flash})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      for (let s = 1; s <= 6; s++) {
        ctx.lineTo(bx + (seed(strike * 7 + s) - 0.5) * 64, CANVAS_HEIGHT * 0.45 * (s / 6));
      }
      ctx.stroke();
    }
  }

  /** Ambient embers that drift upward through the scene. */
  private drawEmbers(ctx: CanvasRenderingContext2D, dt: number, t: number): void {
    for (let i = 0; i < EMBERS.length; i++) {
      const e = EMBERS[i];
      e.y -= e.vy * dt * 60;
      e.x += e.drift * dt * 60;
      if (e.y < -4) e.y = CANVAS_HEIGHT + 4;
      if (e.x < -4) e.x = CANVAS_WIDTH + 4;
      else if (e.x > CANVAS_WIDTH + 4) e.x = -4;
      const flick = 0.4 + 0.5 * Math.abs(Math.sin(t * 3 + i * 1.7));
      ctx.fillStyle = e.warm ? `rgba(255,180,90,${0.5 * flick})` : `rgba(120,220,255,${0.45 * flick})`;
      ctx.shadowColor = e.warm ? '#ffb45a' : '#78dcff';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  /** Parallax city silhouettes — all 4 sides of the canvas for full atmosphere. */
  private drawCitySilhouettes(ctx: CanvasRenderingContext2D, phase: number): void {
    const t = this.time;

    const drawBuildingRow = (
      b: Building, i: number,
      x: number, baseY: number, dir: 1 | -1, // dir: 1=down from top, -1=up from bottom
    ) => {
      const h = b.h;
      const buildY = dir === -1 ? baseY - h : baseY;
      const alpha = 0.55 + b.depth * 0.35;
      ctx.fillStyle = `rgba(10, 10, 22, ${alpha})`;
      if (i % 3 === 0) {
        // Stepped profile
        ctx.fillRect(x, buildY, b.w * 0.6, h);
        ctx.fillRect(x + b.w * 0.25, buildY + (dir === -1 ? h * 0.35 : 0), b.w * 0.75, h * 0.65);
      } else {
        ctx.fillRect(x, buildY, b.w, h);
      }
      // Antenna
      if (i % 3 === 0) {
        ctx.fillStyle = 'rgba(20, 20, 40, 0.85)';
        const antennaY = dir === -1 ? buildY - 16 : buildY + h;
        ctx.fillRect(x + b.w * 0.4, antennaY + (dir === -1 ? 0 : -16), 2, 16);
        // Antenna blink
        if (Math.sin(t * 1.5 + i) > 0.7) {
          ctx.fillStyle = 'rgba(255, 80, 80, 0.8)';
          ctx.beginPath();
          ctx.arc(x + b.w * 0.4 + 1, antennaY + (dir === -1 ? 0 : -16), 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Window lights
      const windowY = dir === -1 ? buildY : buildY;
      for (let wl = 0; wl < 8; wl++) {
        const ws = seed(i * 50 + wl);
        if (ws > 0.38) {
          let wColor: string;
          if (ws > 0.82) wColor = `rgba(255, 140, 30, ${0.55 + ws * 0.2})`; // amber
          else if (ws > 0.65) wColor = `rgba(0, 255, 200, ${0.45 + ws * 0.15})`; // cyan
          else wColor = `rgba(255, 80, 200, ${0.35 + ws * 0.2})`; // magenta
          ctx.fillStyle = wColor;
          ctx.fillRect(
            x + seed(i * 50 + wl + 5) * (b.w - 4),
            windowY + seed(i * 50 + wl + 20) * h * 0.75,
            3, 4,
          );
        }
      }
      // Neon sign
      if (i % 4 === 0) {
        const signColors = ['rgba(0,245,255,0.35)', 'rgba(255,0,204,0.3)', 'rgba(255,140,30,0.3)'];
        ctx.fillStyle = signColors[i % 3];
        ctx.fillRect(x + 2, windowY + h * 0.15, Math.min(b.w - 4, 22), 6);
      }
    };

    // ── BOTTOM edge — far layer ───────────────────────────────────────────────
    for (const b of CITY_BUILDINGS_FAR) {
      const scrollX = (phase * 4 * b.depth) % (CANVAS_WIDTH + b.w) - b.w;
      const x = (b.x + scrollX) % (CANVAS_WIDTH + b.w);
      ctx.fillStyle = `rgba(6, 6, 16, ${0.45 + b.depth * 0.25})`;
      ctx.fillRect(x, CANVAS_HEIGHT - b.h, b.w, b.h);
    }

    // ── BOTTOM edge — near layer ──────────────────────────────────────────────
    for (let i = 0; i < CITY_BUILDINGS.length; i++) {
      const b = CITY_BUILDINGS[i];
      const scrollX = (phase * 12 * b.depth) % (CANVAS_WIDTH + b.w) - b.w;
      const x = (b.x + scrollX) % (CANVAS_WIDTH + b.w);
      drawBuildingRow(b, i, x, CANVAS_HEIGHT, -1);
    }

    // ── TOP edge — near layer (mirrored, slower parallax) ────────────────────
    for (let i = 0; i < CITY_BUILDINGS.length; i++) {
      const b = CITY_BUILDINGS[i];
      const scrollX = -(phase * 8 * b.depth) % (CANVAS_WIDTH + b.w) + b.w;
      const x = ((b.x + scrollX) % (CANVAS_WIDTH + b.w) + CANVAS_WIDTH + b.w) % (CANVAS_WIDTH + b.w);
      const bTop = { ...b, h: b.h * 0.7 }; // top buildings slightly shorter
      drawBuildingRow(bTop, i + 200, x, 0, 1);
    }

    // ── LEFT edge — vertical strip ────────────────────────────────────────────
    const leftW = 80;
    ctx.fillStyle = 'rgba(6, 6, 18, 0.85)';
    ctx.fillRect(0, 0, leftW, CANVAS_HEIGHT);
    for (let i = 0; i < 12; i++) {
      const bh = 60 + seed(i * 7 + 400) * 200;
      const by = seed(i * 7 + 401) * (CANVAS_HEIGHT - bh);
      const bw = 30 + seed(i * 7 + 402) * 40;
      ctx.fillStyle = `rgba(12, 12, 24, ${0.6 + seed(i * 7) * 0.3})`;
      ctx.fillRect(leftW - bw, by, bw, bh);
      // window lights
      for (let wl = 0; wl < 5; wl++) {
        const ws = seed(i * 70 + wl + 500);
        if (ws > 0.45) {
          ctx.fillStyle = ws > 0.75 ? `rgba(0,245,255,0.4)` : `rgba(255,140,30,0.35)`;
          ctx.fillRect(leftW - bw + seed(i * 70 + wl + 10) * (bw - 4), by + seed(i * 70 + wl + 20) * bh * 0.8, 3, 4);
        }
      }
    }

    // ── RIGHT edge — vertical strip ───────────────────────────────────────────
    const rightX = CANVAS_WIDTH - leftW;
    ctx.fillStyle = 'rgba(6, 6, 18, 0.85)';
    ctx.fillRect(rightX, 0, leftW, CANVAS_HEIGHT);
    for (let i = 0; i < 12; i++) {
      const bh = 60 + seed(i * 11 + 600) * 200;
      const by = seed(i * 11 + 601) * (CANVAS_HEIGHT - bh);
      const bw = 30 + seed(i * 11 + 602) * 40;
      ctx.fillStyle = `rgba(12, 12, 24, ${0.6 + seed(i * 11) * 0.3})`;
      ctx.fillRect(rightX, by, bw, bh);
      for (let wl = 0; wl < 5; wl++) {
        const ws = seed(i * 80 + wl + 700);
        if (ws > 0.45) {
          ctx.fillStyle = ws > 0.75 ? `rgba(255,0,204,0.4)` : `rgba(255,200,80,0.35)`;
          ctx.fillRect(rightX + seed(i * 80 + wl + 10) * (bw - 4), by + seed(i * 80 + wl + 20) * bh * 0.8, 3, 4);
        }
      }
    }

    // ── Rain streaks (denser, varied opacity) ─────────────────────────────────
    for (let i = 0; i < 80; i++) {
      const opacity = 0.03 + seed(i * 13 + 900) * 0.05;
      ctx.strokeStyle = `rgba(100, 200, 255, ${opacity})`;
      ctx.lineWidth = 0.5;
      const rx = (seed(i * 17 + 200) * CANVAS_WIDTH + t * 55) % CANVAS_WIDTH;
      const ry = (seed(i * 23 + 200) * CANVAS_HEIGHT + t * 110) % CANVAS_HEIGHT;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 4, ry + 18);
      ctx.stroke();
    }
  }

  /** Update and draw atmospheric void dust particles. */
  private updateAndDrawVoidDust(ctx: CanvasRenderingContext2D, dt: number): void {
    for (let i = 0; i < VOID_DUST.length; i++) {
      const d = VOID_DUST[i];
      d.y += d.vy * dt * 60;
      if (d.y > CANVAS_HEIGHT) d.y = 0;
      // Color variety: cyan, magenta, white
      let dustColor: string;
      if (i % 5 === 0) dustColor = `rgba(255, 0, 204, ${d.alpha * 0.4})`;
      else if (i % 7 === 0) dustColor = `rgba(255, 255, 255, ${d.alpha * 0.3})`;
      else dustColor = `rgba(0, 200, 255, ${d.alpha * 0.5})`;
      ctx.fillStyle = dustColor;
      // Brief flare for every 11th particle
      const sz = (i % 11 === 0 && Math.sin(this.time * 3 + i) > 0.8) ? d.size * 2 : d.size;
      ctx.beginPath();
      ctx.arc(d.x, d.y, sz, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Subtle CRT scanline overlay — DISABLED for performance. */
  private drawScanlines(_ctx: CanvasRenderingContext2D): void {
    // Disabled: drawing 135+ rects per frame tanks FPS
  }

  /** Radial vignette to darken corners, tinted by mood (red boss / cyan focus). */
  private drawVignette(ctx: CanvasRenderingContext2D, game: VoidBreakerEngine): void {
    const cx = CANVAS_WIDTH / 2, cy = CANVAS_HEIGHT / 2;
    const vGrad = ctx.createRadialGradient(cx, cy, CANVAS_HEIGHT * 0.3, cx, cy, CANVAS_HEIGHT * 0.85);
    vGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vGrad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Mood tint creeping in from the edges.
    const bossActive = game.enemies.some((e) => e.active && e.isBoss);
    const tint = bossActive ? 'rgba(255,30,60,' : game.player?.focusActive ? 'rgba(0,220,255,' : null;
    if (tint) {
      const pulse = 0.06 + 0.04 * Math.sin(this.time * 3);
      const tGrad = ctx.createRadialGradient(cx, cy, CANVAS_HEIGHT * 0.35, cx, cy, CANVAS_HEIGHT * 0.9);
      tGrad.addColorStop(0, tint + '0)');
      tGrad.addColorStop(1, tint + pulse.toFixed(3) + ')');
      ctx.fillStyle = tGrad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
  }

  dispose(): void {
    // No-op for 2D canvas
  }
}
