/**
 * renderer.ts — Void Breaker Visual Overhaul
 * Neon dystopian aesthetic inspired by WKW Fallen Angels.
 * Features: neon glow, scanlines, parallax silhouettes, void dust particles,
 * bloom, player/boss glow, telegraph rings, phase indicators.
 */
import type { VoidBreakerEngine } from './game';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  ARENA_W, ARENA_H, ARENA_HW, ARENA_HH,
  MAX_SHARDS, BOSS_WAVE_INTERVAL, SHIELD_HALF_ARC,
} from './constants';
import { drawSprite, drawPickupSprite } from './drawSprite';
import { PLAYER_SPRITE, ENEMY_SPRITES, BOSS_SPRITES, HEART_PICKUP_SPRITE } from './sprites';

// ── Neon Palette ──────────────────────────────────────────────────────────────
const BG_DEEP = '#050508';
const FLOOR_DARK = '#0a0a12';
const GRID_COLOR = '#1a1a2a';
const NEON_CYAN = '#00f5ff';
const NEON_MAGENTA = '#ff00cc';
const NEON_ORANGE = '#ff6820';
const NEON_GOLD = '#d4af37';
const NEON_GREEN = '#39ff14';
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
    const camX = p.x - viewW / 2 + game.shakeX * 4;
    const camY = p.y - viewH / 2 + game.shakeY * 4;

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

    // ── 4. Void dust ───────────────────────────────────────────────────────
    this.updateAndDrawVoidDust(ctx, dt);

    // ── 5. Arena floor ─────────────────────────────────────────────────────
    const tl = toScreen(0, 0);
    const br = toScreen(ARENA_W, ARENA_H);
    ctx.fillStyle = game.currentMapConfig.floorColor;
    ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

    // ── 6. Grid ─────────────────────────────────────────────────────────────
    ctx.strokeStyle = game.currentMapConfig.gridColor;
    ctx.lineWidth = 0.8;
    for (let x = 0; x <= ARENA_W; x += 80) {
      const s = toScreen(x, 0), e = toScreen(x, ARENA_H);
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    }
    for (let y = 0; y <= ARENA_H; y += 80) {
      const s = toScreen(0, y), e = toScreen(ARENA_W, y);
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    }

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

    // ── Map transition door (right edge, wave == transitionWave) ────────────
    if (game.currentMapConfig.transitionWave === game.wave && game.state === 'playing') {
      const doorX = ARENA_W * 0.95;
      const doorY = ARENA_HH;
      const dpos = toScreen(doorX, doorY);
      const pulse = 0.6 + Math.sin(t * 4) * 0.4;
      ctx.fillStyle = `rgba(0, 245, 255, ${0.15 * pulse})`;
      const dw = 24 * scale, dh = 56 * scale;
      ctx.fillRect(dpos.x - dw / 2, dpos.y - dh / 2, dw, dh);
      ctx.strokeStyle = NEON_CYAN;
      ctx.lineWidth = 2;
      ctx.strokeRect(dpos.x - dw / 2, dpos.y - dh / 2, dw, dh);
      ctx.font = `bold ${Math.ceil(8 * scale)}px monospace`;
      ctx.fillStyle = NEON_CYAN;
      ctx.textAlign = 'center';
      ctx.fillText('ADVANCE', dpos.x, dpos.y - dh / 2 - 6);
      ctx.textAlign = 'left';
    }

    // ── 8. Central rift ────────────────────────────────────────────────────
    const rift = toScreen(ARENA_HW, ARENA_HH);
    const riftPulse = 0.7 + Math.sin(t * 2.5) * 0.3;
    const grad = ctx.createRadialGradient(rift.x, rift.y, 0, rift.x, rift.y, 50 * scale);
    grad.addColorStop(0, `rgba(0, 200, 255, ${0.35 * riftPulse})`);
    grad.addColorStop(0.5, `rgba(200, 0, 255, ${0.15 * riftPulse})`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(rift.x, rift.y, 50 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = NEON_CYAN + '44';
    ctx.lineWidth = 1;
    ctx.stroke();

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
          const prevAlpha = ctx.globalAlpha;
          if (voidPhased) ctx.globalAlpha = prevAlpha * 0.16;
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
            ctx.fillStyle = baseColor;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
            ctx.fill();
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
          if (voidPhased) ctx.globalAlpha = prevAlpha;
        },
      });
    }

    // --- Player ---
    drawables.push({
      sortY: p.y,
      draw: () => {
        const playerPos = toScreen(p.x, p.y);
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
      const r = Math.max(2, pr.radius * scale);
      ctx.fillStyle = pr.isPlayer ? NEON_CYAN : NEON_MAGENTA;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fill();
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

    // ── 16. Popups ────────────────────────────────────────────────────────────

    for (const pop of game.popups) {
      const pos = toScreen(pop.x, pop.y);
      const alpha = pop.life / pop.maxLife;
      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = pop.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
      ctx.textAlign = 'center';
      ctx.fillText(pop.text, pos.x, pos.y);
    }
    ctx.textAlign = 'left';

    // ── 17. Scanline overlay ─────────────────────────────────────────────────
    this.drawScanlines(ctx);

    // ── 18. Vignette ─────────────────────────────────────────────────────────
    this.drawVignette(ctx);
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

  /** Radial vignette to darken corners. */
  private drawVignette(ctx: CanvasRenderingContext2D): void {
    const vGrad = ctx.createRadialGradient(
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_HEIGHT * 0.3,
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_HEIGHT * 0.85
    );
    vGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vGrad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  dispose(): void {
    // No-op for 2D canvas
  }
}
