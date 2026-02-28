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
  MAX_SHARDS, BOSS_WAVE_INTERVAL,
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
  for (let i = 0; i < 28; i++) {
    buildings.push({
      x: seed(i * 3) * CANVAS_WIDTH,
      w: 20 + seed(i * 3 + 1) * 40,
      h: 40 + seed(i * 3 + 2) * 80,
      depth: 0.15 + seed(i) * 0.25,
    });
  }
  return buildings;
})();

// ── Second parallax layer (distant, dimmer) ──────────────────────────────────
const CITY_BUILDINGS_FAR: Building[] = (() => {
  const buildings: Building[] = [];
  for (let i = 0; i < 20; i++) {
    buildings.push({
      x: seed(i * 5 + 100) * CANVAS_WIDTH,
      w: 15 + seed(i * 5 + 101) * 25,
      h: 20 + seed(i * 5 + 102) * 40,
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

    // ── 7. Arena border — map-themed ────────────────────────────────────────
    const borderColor = game.currentMapConfig.borderColor;
    ctx.strokeStyle = borderColor + '88';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

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

    // ── 8. Obstacles ─────────────────────────────────────────────────────────────────
    for (const o of game.obstacles) {
      if (!o.active) continue;
      const otl = toScreen(o.x, o.y);
      const orw = (o.w) * scale, orh = (o.h) * scale;
      switch (o.type) {
        case 'building': case 'barrier': {
          // Shadow offset for depth
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillRect(otl.x + 3, otl.y + 3, orw, orh);
          // Building fill (flat, no per-frame gradient)
          ctx.fillStyle = '#111118';
          ctx.fillRect(otl.x, otl.y, orw, orh);
          // Procedural window lights (seeded by obstacle ID)
          const wCols = Math.floor(orw / 8);
          const wRows = Math.floor(orh / 10);
          for (let wr = 0; wr < wRows; wr++) {
            for (let wc = 0; wc < wCols; wc++) {
              const wSeed = seed(o.id * 100 + wr * 20 + wc);
              if (wSeed > 0.5) {
                const colors = ['rgba(0,245,255,0.4)', 'rgba(255,200,80,0.35)', 'rgba(255,0,204,0.25)'];
                ctx.fillStyle = colors[Math.floor(wSeed * 3)];
                ctx.fillRect(otl.x + wc * 8 + 2, otl.y + wr * 10 + 3, 3, 4);
              }
            }
          }
          // Border
          ctx.strokeStyle = game.currentMapConfig.borderColor + '55';
          ctx.lineWidth = 1;
          ctx.strokeRect(otl.x, otl.y, orw, orh);
          // Neon rooftop strip
          ctx.fillStyle = game.currentMapConfig.borderColor + '44';
          ctx.fillRect(otl.x, otl.y, orw, 2);
          break;
        }
        case 'debris': {
          ctx.fillStyle = '#1a1420';
          ctx.fillRect(otl.x, otl.y, orw, orh);
          // Faint embedded circuit lines
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
          const hp_frac = o.hp / o.maxHp;
          ctx.fillStyle = `rgba(10, 31, 10, ${0.5 + hp_frac * 0.5})`;
          ctx.fillRect(otl.x, otl.y, orw, orh);
          // Green border glow substitute
          ctx.strokeStyle = `rgba(0, 200, 60, ${hp_frac * 0.4})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(otl.x, otl.y, orw, orh);
          break;
        }
        case 'terminal': {
          const glow = o.glowColor ?? '#00ff88';
          const pulse = 0.6 + Math.sin(t * 3 + o.id) * 0.4;
          ctx.fillStyle = '#0a100a';
          ctx.fillRect(otl.x, otl.y, orw, orh);
          ctx.strokeStyle = glow;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(otl.x, otl.y, orw, orh);
          ctx.fillStyle = glow + Math.floor(pulse * 100).toString(16).padStart(2, '0');
          const cx = otl.x + orw / 2, cy = otl.y + orh / 2;
          ctx.font = `${Math.ceil(7 * scale)}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText('LOG', cx, cy + 3);
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
          const bGlow = o.glowColor ?? NEON_CYAN;
          const bPulse = 0.7 + Math.sin(t * 2 + o.id * 1.3) * 0.3;
          // Panel background
          ctx.fillStyle = '#0a0a18';
          ctx.fillRect(otl.x, otl.y, orw, orh);
          // Glowing border (no shadowBlur)
          ctx.strokeStyle = bGlow;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(otl.x, otl.y, orw, orh);
          // Neon text ad
          const adIndex = o.id % AD_TEXTS.length;
          ctx.font = `bold ${Math.ceil(Math.min(orh * 0.55, 10 * scale))}px monospace`;
          ctx.fillStyle = bGlow + Math.floor(bPulse * 200 + 55).toString(16).padStart(2, '0');
          ctx.textAlign = 'center';
          ctx.fillText(AD_TEXTS[adIndex], otl.x + orw / 2, otl.y + orh * 0.72);
          ctx.textAlign = 'left';
          // Occasional flicker
          if (Math.sin(t * 7 + o.id * 3.7) > 0.92) {
            ctx.fillStyle = bGlow + '22';
            ctx.fillRect(otl.x, otl.y, orw, orh);
          }
          break;
        }
      }
    }

    // ── 9. Shards ──────────────────────────────────────────────────────────
    for (const s of game.shards) {
      if (!s.active) continue;
      const pos = toScreen(s.x, s.y);
      const sz = (s.collected ? 3 : 5) * scale;
      const pulse = s.collected ? 1 : 0.7 + Math.sin(t * 4 + s.orbitAngle) * 0.3;
      ctx.fillStyle = s.collected ? NEON_GOLD : NEON_CYAN;
      ctx.beginPath();
      ctx.moveTo(pos.x + sz, pos.y);
      ctx.lineTo(pos.x - sz * 0.5, pos.y + sz * 0.87);
      ctx.lineTo(pos.x - sz * 0.5, pos.y - sz * 0.87);
      ctx.closePath();
      ctx.fill();
    }

    // ── 10. Enemies ─────────────────────────────────────────────────────────
    for (const e of game.enemies) {
      if (!e.active) continue;
      const pos = toScreen(e.x, e.y);
      const r = e.radius * scale;

      // Elite glow
      const baseColor = e.isElite ? NEON_MAGENTA : (e.color || '#cc4466');
      const glowColor = e.isBoss ? BOSS_RED : (e.isElite ? NEON_MAGENTA : baseColor);

      // Boss telegraph ring (phase 3 slam warning)
      if (e.isBoss && e.telegraphTimer > 0) {
        const telegraphRadius = 120 * scale;
        const telegraphAlpha = Math.min(1, e.telegraphTimer * 2);
        ctx.strokeStyle = `rgba(255, 0, 80, ${telegraphAlpha})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, telegraphRadius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Boss phase ring indicator
      if (e.isBoss && e.bossPhase > 1) {
        const phaseColor = e.bossPhase === 3 ? '#ff0033' : '#ff6622';
        ctx.strokeStyle = phaseColor + '60';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r + 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Attempt sprite rendering first
      const spriteConfig = e.isBoss
        ? BOSS_SPRITES[Math.floor(game.wave / BOSS_WAVE_INTERVAL)]
        : ENEMY_SPRITES[e.type];

      const spriteDrawn = spriteConfig ? drawSprite(ctx, spriteConfig, {
        x: pos.x, y: pos.y,
        radius: r,
        angle: e.angle,
        vx: e.vx, vy: e.vy,
        hitFlashUntil: e.hitFlashUntil,
        aimAngle: Math.atan2(game.player.y - e.y, game.player.x - e.x),
      }, game.elapsedMs, 1) : false;

      if (!spriteDrawn) {
        // Fallback: original shape rendering
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Boss crown effect
      if (e.isBoss) {
        ctx.strokeStyle = NEON_GOLD + 'aa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.stroke();
        // Phase text badge
        if (e.bossPhase > 1) {
          ctx.font = `bold ${Math.ceil(8 * scale)}px monospace`;
          ctx.fillStyle = e.bossPhase === 3 ? '#ff3355' : '#ff8844';
          ctx.textAlign = 'center';
          ctx.fillText(`P${e.bossPhase}`, pos.x, pos.y - r - 4);
        }
      }

      // Boss tentacle sweep (phase 3) — visual arc
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

      // HP bar for enemies with scaled HP (wave 3+)
      if (!e.isBoss && e.hp < e.maxHp) {
        const barW = r * 2;
        const barH = 3;
        const bx = pos.x - r;
        const by = pos.y - r - 6;
        ctx.fillStyle = '#333';
        ctx.fillRect(bx, by, barW, barH);
        ctx.fillStyle = e.isElite ? NEON_MAGENTA : NEON_CYAN;
        ctx.fillRect(bx, by, barW * (e.hp / e.maxHp), barH);
      }

      ctx.textAlign = 'left';
    }

    // ── 11. Projectiles ─────────────────────────────────────────────────────
    for (const pr of game.projectiles) {
      if (!pr.active) continue;
      const pos = toScreen(pr.x, pr.y);
      const r = Math.max(2, pr.radius * scale);
      ctx.fillStyle = pr.isPlayer ? NEON_CYAN : NEON_MAGENTA;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── 12. Particles ────────────────────────────────────────────────────────
    for (const pt of game.particles) {
      if (!pt.active) continue;
      const pos = toScreen(pt.x, pt.y);
      const alpha = pt.life / pt.maxLife;
      ctx.fillStyle = pt.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, pt.size * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── 13. Player ───────────────────────────────────────────────────────────
    const playerPos = toScreen(p.x, p.y);
    const pr = p.radius * scale;
    const isInvincible = game.elapsedMs < p.invincibleUntil && Math.floor(game.elapsedMs / 80) % 2 === 0;
    if (!isInvincible) {
      // Player glow burst when focus is active
      if (p.focusActive) {
        const fGlow = ctx.createRadialGradient(playerPos.x, playerPos.y, 0, playerPos.x, playerPos.y, pr * 5);
        fGlow.addColorStop(0, 'rgba(0, 240, 255, 0.25)');
        fGlow.addColorStop(1, 'rgba(0, 240, 255, 0)');
        ctx.fillStyle = fGlow;
        ctx.beginPath();
        ctx.arc(playerPos.x, playerPos.y, pr * 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Attempt sprite rendering for player
      const playerSpriteDrawn = drawSprite(ctx, PLAYER_SPRITE, {
        x: playerPos.x, y: playerPos.y,
        radius: pr,
        angle: p.aimAngle,
        aimAngle: p.aimAngle,
        hitFlashUntil: p.hitFlashUntil,
      }, game.elapsedMs, 1);

      if (!playerSpriteDrawn) {
        // Fallback: original shape rendering
        const playerColor = p.dashActive ? '#ffffff' : p.focusActive ? PLAYER_GLOW : NEON_GOLD;
        ctx.fillStyle = playerColor;
        ctx.beginPath();
        ctx.arc(playerPos.x, playerPos.y, pr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Wings
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

    // ── Player HP Bar (always visible, drawn after player) ───────────────────
    if (game.state === 'playing') {
      const hpBarWidth = 40 * scale;
      const hpBarHeight = 4 * scale;
      const hpBarX = playerPos.x - hpBarWidth / 2;
      const hpBarY = playerPos.y + pr + 6;
      const hpFraction = p.hp / p.maxHp;
      // Background
      ctx.fillStyle = 'rgba(20, 20, 30, 0.7)';
      ctx.fillRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);
      // HP fill — color by level
      let hpBarColor: string;
      if (hpFraction > 0.6) hpBarColor = '#00ff88';
      else if (hpFraction > 0.3) hpBarColor = '#ffaa00';
      else hpBarColor = '#ff2244';
      ctx.fillStyle = hpBarColor;
      ctx.fillRect(hpBarX, hpBarY, hpBarWidth * hpFraction, hpBarHeight);
      // Border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);
      // Numeric readout
      ctx.font = `bold ${Math.ceil(7 * scale)}px monospace`;
      ctx.fillStyle = hpBarColor;
      ctx.textAlign = 'center';
      ctx.fillText(`${p.hp}/${p.maxHp}`, playerPos.x, hpBarY + hpBarHeight + 9);
      ctx.textAlign = 'left';
      // Hit flash pulse
      const recentlyHit = game.elapsedMs < p.hitFlashUntil + 200;
      if (recentlyHit) {
        const flashAlpha = 0.3 + Math.sin(game.elapsedMs * 0.02) * 0.3;
        ctx.fillStyle = `rgba(255, 0, 50, ${flashAlpha})`;
        ctx.fillRect(hpBarX - 2, hpBarY - 1, hpBarWidth + 4, hpBarHeight + 2);
      }
    }

    // ── 14. Ally ────────────────────────────────────────────────────────────
    const ally = game.allyCtrl.ally;
    if (ally.active) {
      const apos = toScreen(ally.x, ally.y);
      const ar = ally.radius * scale;
      const isDowned = ally.state === 'downed';
      const allyPulse = isDowned
        ? 0.4 + Math.sin(t * 6) * 0.4
        : 0.8 + Math.sin(ally.phase * 4) * 0.2;

      ctx.fillStyle = isDowned ? `rgba(100, 100, 100, ${allyPulse})` : '#00ff88';
      ctx.beginPath();
      ctx.arc(apos.x, apos.y, ar, 0, Math.PI * 2);
      ctx.fill();

      // HP bar
      if (!isDowned) {
        const barW = ar * 2.5;
        const bx = apos.x - barW / 2;
        const by = apos.y - ar - 7;
        ctx.fillStyle = '#333';
        ctx.fillRect(bx, by, barW, 3);
        ctx.fillStyle = '#00ff88';
        ctx.fillRect(bx, by, barW * (ally.hp / ally.maxHp), 3);
      }

      // Name tag
      ctx.font = `bold ${Math.ceil(7 * scale)}px monospace`;
      ctx.fillStyle = isDowned ? '#888888' : '#00ff88';
      ctx.textAlign = 'center';
      ctx.fillText(isDowned ? 'DOWN' : 'LIN', apos.x, apos.y + ar + 10);
      ctx.textAlign = 'left';
    }

    // ── 15. Heart Pickups ─────────────────────────────────────────────────────
    for (const h of game.heartPickups) {
      if (!h.active) continue;
      const hpos = toScreen(h.x, h.y);
      const fadeAlpha = Math.min(1, h.lifetime / 3);
      ctx.globalAlpha = fadeAlpha;
      const drawn = drawPickupSprite(ctx, HEART_PICKUP_SPRITE, hpos.x, hpos.y, t, scale);
      if (!drawn) {
        // Fallback: draw a simple magenta diamond
        const bob = Math.sin(t * 3) * 3;
        ctx.fillStyle = '#ff00cc';
        ctx.save();
        ctx.translate(hpos.x, hpos.y + bob);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-5 * scale, -5 * scale, 10 * scale, 10 * scale);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
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

  /** Parallax city silhouettes — two depth layers, scroll with arenaPhase. */
  private drawCitySilhouettes(ctx: CanvasRenderingContext2D, phase: number): void {
    // Far layer (dimmer, slower)
    for (const b of CITY_BUILDINGS_FAR) {
      const scrollX = (phase * 4 * b.depth) % (CANVAS_WIDTH + b.w) - b.w;
      const x = (b.x + scrollX) % (CANVAS_WIDTH + b.w);
      ctx.fillStyle = `rgba(6, 6, 16, ${0.5 + b.depth * 0.3})`;
      ctx.fillRect(x, CANVAS_HEIGHT - b.h, b.w, b.h);
    }
    // Near layer
    for (let i = 0; i < CITY_BUILDINGS.length; i++) {
      const b = CITY_BUILDINGS[i];
      const scrollX = (phase * 12 * b.depth) % (CANVAS_WIDTH + b.w) - b.w;
      const x = (b.x + scrollX) % (CANVAS_WIDTH + b.w);
      // Building silhouette with stepped profile for some
      ctx.fillStyle = `rgba(10, 10, 22, ${0.6 + b.depth * 0.4})`;
      if (i % 4 === 0) {
        // Stepped building
        ctx.fillRect(x, CANVAS_HEIGHT - b.h, b.w * 0.6, b.h);
        ctx.fillRect(x + b.w * 0.3, CANVAS_HEIGHT - b.h * 0.7, b.w * 0.7, b.h * 0.7);
      } else {
        ctx.fillRect(x, CANVAS_HEIGHT - b.h, b.w, b.h);
      }
      // Antenna spike on every 3rd building
      if (i % 3 === 0) {
        ctx.fillStyle = 'rgba(20, 20, 40, 0.8)';
        ctx.fillRect(x + b.w * 0.4, CANVAS_HEIGHT - b.h - 12, 2, 12);
      }
      // Window lights (seeded, deterministic)
      for (let wl = 0; wl < 5; wl++) {
        const ws = seed(i * 50 + wl);
        if (ws > 0.4) {
          const wColor = ws > 0.7 ? 'rgba(0, 255, 200, 0.5)' : 'rgba(255, 100, 200, 0.4)';
          ctx.fillStyle = wColor;
          ctx.fillRect(
            x + ws * b.w * 0.8,
            CANVAS_HEIGHT - b.h + seed(i * 50 + wl + 20) * b.h * 0.7,
            2, 3
          );
        }
      }
      // Neon sign patch on every 5th building
      if (i % 5 === 0) {
        const signColor = i % 2 === 0 ? 'rgba(0, 245, 255, 0.3)' : 'rgba(255, 0, 204, 0.25)';
        ctx.fillStyle = signColor;
        ctx.fillRect(x + 2, CANVAS_HEIGHT - b.h + 4, Math.min(b.w - 4, 18), 5);
      }
    }
    // Rain streaks
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.04)';
    ctx.lineWidth = 0.5;
    const t = this.time;
    for (let i = 0; i < 40; i++) {
      const rx = (seed(i * 17 + 200) * CANVAS_WIDTH + t * 60) % CANVAS_WIDTH;
      const ry = (seed(i * 23 + 200) * CANVAS_HEIGHT + t * 120) % CANVAS_HEIGHT;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 3, ry + 15);
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
