import type { NeonDriftwayEngine } from './game';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  V_MIN, V_MAX_NORMAL, V_MAX_BOOST, BOOST_MAX,
  STREAK_WINDOW_MS,
  roadLeft, roadRight, laneWidth,
  CAR_WIDTH, CAR_HEIGHT,
} from './constants';
import { SpriteSheet, setPixelArt } from './sprites';
import { VEHICLE_SPRITES, type VehicleSpriteKey } from './spriteAtlas';
import type { RemoteCar } from './types';

export class NeonDriftwayRenderer {
  private ctx: CanvasRenderingContext2D;
  private sheet: SpriteSheet | null;

  constructor(ctx: CanvasRenderingContext2D, sheet?: SpriteSheet) {
    this.ctx = ctx;
    this.sheet = sheet ?? null;
    setPixelArt(ctx);
  }

  draw(game: NeonDriftwayEngine): void {
    const ctx = this.ctx;
    ctx.save();

    // Screen shake
    ctx.translate(game.shakeX, game.shakeY);

    this.drawBackground(game);
    this.drawRoad(game);
    this.drawObstacles(game);
    this.drawParticles(game);

    // Remote players (behind local car)
    if (game.isMultiplayer) {
      this.drawRemotePlayers(game);
    }

    this.drawCar(game);
    this.drawPopups(game);

    // Slowdown overlay
    if (game.isSlowed && (game.state === 'playing' || game.state === 'paused')) {
      this.drawSlowdownOverlay();
    }

    // Headlight overlay for Level 3
    if (game.level.headlightsEnabled && game.state === 'playing') {
      this.drawHeadlightOverlay(game);
    }

    ctx.restore();

    // HUD drawn without shake
    if (game.state === 'playing' || game.state === 'paused') {
      this.drawHUD(game);

      // Multiplayer HUD additions
      if (game.isMultiplayer) {
        this.drawMultiplayerScoreboard(game);
        this.drawAbilityHUD(game);
      }
    }

    // Countdown
    if (game.state === 'countdown') {
      this.drawCountdown(game);
    }
  }

  // ── Background ──

  private drawBackground(game: NeonDriftwayEngine): void {
    const ctx = this.ctx;
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    grad.addColorStop(0, game.level.skyTop);
    grad.addColorStop(1, game.level.skyBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  // ── Road ──

  private drawRoad(game: NeonDriftwayEngine): void {
    const ctx = this.ctx;
    const rL = roadLeft();
    const rR = roadRight();
    const rW = rR - rL;
    const lanes = game.level.lanes;

    // Road surface
    ctx.fillStyle = game.level.roadColor;
    ctx.fillRect(rL, 0, rW, CANVAS_HEIGHT);

    // Guardrails
    ctx.fillStyle = game.level.guardrailColor;
    ctx.fillRect(rL - 6, 0, 6, CANVAS_HEIGHT);
    ctx.fillRect(rR, 0, 6, CANVAS_HEIGHT);

    // Neon edge glow for Level 3
    if (game.levelId === 3) {
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#3333ff';
      ctx.fillStyle = '#2222aa';
      ctx.fillRect(rL - 2, 0, 2, CANVAS_HEIGHT);
      ctx.fillRect(rR, 0, 2, CANVAS_HEIGHT);
      ctx.shadowBlur = 0;
    }

    // Lane markings (scrolling dashes)
    ctx.fillStyle = game.level.laneColor;
    const lw = laneWidth(lanes);
    const dashLen = 30;
    const gapLen = 50;
    const totalLen = dashLen + gapLen;
    const offset = game.roadScrollOffset % totalLen;

    for (let i = 1; i < lanes; i++) {
      const x = rL + lw * i - 1;
      for (let y = -totalLen + offset; y < CANVAS_HEIGHT; y += totalLen) {
        ctx.fillRect(x, y, 2, dashLen);
      }
    }

    // Rain streaks on road for Level 2
    if (game.levelId === 2) {
      ctx.fillStyle = 'rgba(100,140,200,0.08)';
      for (let i = 0; i < 8; i++) {
        const rx = rL + ((game.roadScrollOffset * 3 + i * 137) % rW);
        ctx.fillRect(rx, 0, 40, CANVAS_HEIGHT);
      }
    }
  }

  // ── Obstacles ──

  private drawObstacles(game: NeonDriftwayEngine): void {
    const ctx = this.ctx;

    for (const o of game.obstacles) {
      if (!o.active) continue;

      // Level 3 dim: obstacles outside headlight cone
      let alpha = 1;
      if (game.level.headlightsEnabled) {
        const dist = game.car.y - o.y;
        const coneLen = game.headlightFlickerDim ? 180 : 280;
        if (dist > 0 && dist > coneLen) {
          alpha = 0.15;
        } else if (dist > 0) {
          alpha = 0.3 + 0.7 * (1 - dist / coneLen);
        }
      }

      ctx.globalAlpha = alpha;

      if (o.type === 'cone') {
        this.drawCone(o.x, o.y, o.width, o.height, o.color);
      } else if (o.type === 'puddle') {
        this.drawPuddle(o.x, o.y, o.width, o.height);
      } else if (o.type === 'hydro_strip') {
        this.drawHydroStrip(o.x, o.y, o.width, o.height);
      } else if (o.type === 'boost_pad') {
        this.drawBoostPad(o.x, o.y, o.width, o.height);
      } else if (o.type === 'ability_slowdown') {
        this.drawAbilityPickup(o.x, o.y, o.width, o.height);
      } else if (o.type === 'debris') {
        this.drawDebris(o.x, o.y, o.width, o.height, o.color);
      } else if (o.isTraffic) {
        // Try sprite rendering for traffic vehicles (cars & trucks)
        if (!this.tryDrawSprite(o.spriteKey, o.x, o.y, o.width, o.height)) {
          this.drawTrafficCar(o.x, o.y, o.width, o.height, o.color, o.signaling);
        }
      } else {
        // Barrier
        this.drawBarrier(o.x, o.y, o.width, o.height, o.color);
      }

      ctx.globalAlpha = 1;
    }
  }

  private drawCone(x: number, y: number, w: number, h: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - h / 2);
    ctx.lineTo(x - w / 2, y + h / 2);
    ctx.lineTo(x + w / 2, y + h / 2);
    ctx.closePath();
    ctx.fill();
    // White stripe
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - w / 4, y, w / 2, 3);
  }

  private drawBarrier(x: number, y: number, w: number, h: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    // White stripes
    ctx.fillStyle = '#ffffff';
    const stripeW = 8;
    for (let sx = x - w / 2; sx < x + w / 2; sx += stripeW * 2) {
      ctx.fillRect(sx, y - h / 2, stripeW, h);
    }
  }

  private drawTrafficCar(x: number, y: number, w: number, h: number, color: string, signaling: boolean): void {
    const ctx = this.ctx;
    // Body
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    // Windshield
    ctx.fillStyle = 'rgba(100,180,255,0.4)';
    ctx.fillRect(x - w / 2 + 4, y - h / 2, w - 8, h * 0.2);
    // Tail lights
    ctx.fillStyle = '#ff2222';
    ctx.fillRect(x - w / 2 + 2, y + h / 2 - 6, 6, 4);
    ctx.fillRect(x + w / 2 - 8, y + h / 2 - 6, 6, 4);
    // Signal indicator
    if (signaling) {
      ctx.fillStyle = Math.sin(Date.now() * 0.02) > 0 ? '#ffdd00' : 'transparent';
      ctx.fillRect(x - w / 2 - 3, y - h / 4, 3, 8);
      ctx.fillRect(x + w / 2, y - h / 4, 3, 8);
    }
  }

  private drawPuddle(x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(60,120,200,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(100,160,240,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private drawHydroStrip(x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(100,160,240,0.3)';
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    // Sheen
    ctx.fillStyle = 'rgba(200,220,255,0.15)';
    ctx.fillRect(x - w / 2, y - h / 2, w, h / 3);
  }

  private drawDebris(x: number, y: number, w: number, h: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    // Irregular shape — several offset rects
    ctx.fillRect(x - w / 2, y - h / 3, w * 0.6, h * 0.5);
    ctx.fillRect(x - w / 4, y - h / 2, w * 0.5, h * 0.4);
    ctx.fillRect(x, y - h / 4, w * 0.4, h * 0.6);
  }

  private drawBoostPad(x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u26A1', x, y + 2);
  }

  // ── Player Car ──

  private drawCar(game: NeonDriftwayEngine): void {
    const ctx = this.ctx;
    const car = game.car;

    // Blink during invincibility
    if (game.elapsedMs < car.invincibleUntil) {
      if (Math.floor(game.elapsedMs / 80) % 2 === 0) return;
    }

    const x = car.x;
    const y = car.y;
    const w = car.width;
    const h = car.height;

    // Boost flame (visible when speed exceeds normal cap, i.e. actively boosting)
    if (car.speed > V_MAX_NORMAL && (game.state as string) === 'playing') {
      const flameH = 10 + Math.random() * 8;
      const grad = ctx.createLinearGradient(x, y + h / 2, x, y + h / 2 + flameH);
      grad.addColorStop(0, '#ff6600');
      grad.addColorStop(0.5, '#ffaa00');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(x - 6, y + h / 2, 12, flameH);
    }

    // Try sprite rendering for player car
    if (this.tryDrawSprite(car.spriteKey, x, y, w, h)) {
      return; // Sprite drawn successfully
    }

    // ── Fallback: rectangle-based player car ──

    // Body
    ctx.fillStyle = '#00ccff';
    ctx.fillRect(x - w / 2, y - h / 2, w, h);

    // Windshield
    ctx.fillStyle = 'rgba(0,200,255,0.3)';
    ctx.fillRect(x - w / 2 + 4, y - h / 2 + 4, w - 8, h * 0.22);

    // Racing stripe
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x - 3, y - h / 2, 6, h);

    // Headlights
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - w / 2 + 2, y - h / 2, 5, 3);
    ctx.fillRect(x + w / 2 - 7, y - h / 2, 5, 3);

    // Tail lights
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(x - w / 2 + 2, y + h / 2 - 4, 6, 3);
    ctx.fillRect(x + w / 2 - 8, y + h / 2 - 4, 6, 3);
  }

  /**
   * Attempt to draw a vehicle sprite from the atlas.
   * Returns true if sprite was drawn, false if fallback is needed.
   */
  private tryDrawSprite(
    spriteKey: string | undefined,
    x: number, y: number, w: number, h: number,
  ): boolean {
    if (!spriteKey || !this.sheet || !this.sheet.ready) return false;

    const def = VEHICLE_SPRITES[spriteKey as VehicleSpriteKey];
    if (!def) return false;

    // Skip if rects are still placeholder (sw/sh = 1)
    if (def.rect.sw <= 1 || def.rect.sh <= 1) return false;

    this.sheet.draw(this.ctx, def, x, y, w, h);
    return true;
  }

  // ── Headlight Overlay (Level 3) ──

  private drawHeadlightOverlay(game: NeonDriftwayEngine): void {
    const ctx = this.ctx;
    const car = game.car;
    const coneLen = game.headlightFlickerDim ? 180 : 280;

    // Dark overlay with cutout cone
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Clear the headlight cone
    ctx.globalCompositeOperation = 'destination-out';
    const grad = ctx.createRadialGradient(car.x, car.y - 20, 10, car.x, car.y - coneLen / 2, coneLen);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0.8)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(car.x, car.y - 10);
    ctx.lineTo(car.x - coneLen * 0.45, car.y - coneLen);
    ctx.lineTo(car.x + coneLen * 0.45, car.y - coneLen);
    ctx.closePath();
    ctx.fill();

    // Also clear area around car so the player car is visible
    ctx.beginPath();
    ctx.arc(car.x, car.y, 60, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ── Particles ──

  private drawParticles(game: NeonDriftwayEngine): void {
    const ctx = this.ctx;
    for (const p of game.particles) {
      if (!p.active) continue;
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;

      if (p.size <= 1.5) {
        // Speed line / rain
        ctx.fillRect(p.x, p.y, 1, 8);
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── Popups ──

  private drawPopups(game: NeonDriftwayEngine): void {
    const ctx = this.ctx;
    for (const p of game.popups) {
      const alpha = Math.min(1, p.life / (p.maxLife * 0.3));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  // ── HUD ──

  private drawHUD(game: NeonDriftwayEngine): void {
    const ctx = this.ctx;
    const car = game.car;

    // Score + Distance (top left)
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(8, 8, 170, 52);
    ctx.fillStyle = '#00ffff';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`SCORE  ${Math.round(game.score).toString().padStart(7, '0')}`, 16, 14);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`DIST   ${Math.round(game.distance).toString().padStart(7, '0')}m`, 16, 32);

    // Time (top center)
    const secs = Math.floor(game.elapsedMs / 1000);
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(CANVAS_WIDTH / 2 - 40, 8, 80, 24);
    ctx.fillStyle = '#cccccc';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${mins}:${s.toString().padStart(2, '0')}`, CANVAS_WIDTH / 2, 14);

    // Speed + HP (top right)
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(CANVAS_WIDTH - 178, 8, 170, 52);
    const speedKmh = Math.round(car.speed * 0.5);
    ctx.fillStyle = car.speed > V_MAX_NORMAL ? '#ff4444' : '#ffffff';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${speedKmh} km/h`, CANVAS_WIDTH - 16, 14);

    // HP hearts
    ctx.textAlign = 'right';
    ctx.font = '16px sans-serif';
    let hpStr = '';
    for (let i = 0; i < car.maxHp; i++) {
      hpStr += i < car.hp ? '❤️' : '🖤';
    }
    ctx.fillText(hpStr, CANVAS_WIDTH - 16, 34);

    // Boost meter (bottom)
    const boostW = 120;
    const boostH = 8;
    const boostX = CANVAS_WIDTH / 2 - boostW / 2;
    const boostY = CANVAS_HEIGHT - 24;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(boostX - 2, boostY - 2, boostW + 4, boostH + 4);
    ctx.fillStyle = '#333333';
    ctx.fillRect(boostX, boostY, boostW, boostH);
    const boostFill = car.boostMeter / BOOST_MAX;
    ctx.fillStyle = boostFill > 0.3 ? '#ff8800' : '#ff3300';
    ctx.fillRect(boostX, boostY, boostW * boostFill, boostH);
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('BOOST', CANVAS_WIDTH / 2, boostY - 4);

    // Grip indicator (Level 2)
    if (game.level.gripEnabled && game.grip < 1) {
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('LOW GRIP', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 44);
    }

    // Streak
    if (game.closeCallStreak > 1 && game.elapsedMs - game.lastCloseCallTime < STREAK_WINDOW_MS) {
      ctx.fillStyle = '#ffff00';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`STREAK x${game.closeCallStreak}`, CANVAS_WIDTH / 2, 46);
    }

    // Pause overlay
    if (game.state === 'paused') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PAUSED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
      ctx.font = '16px monospace';
      ctx.fillStyle = '#aaaaaa';
      ctx.fillText('Press ESC to resume', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
    }
  }

  // ── Countdown ──

  private drawCountdown(game: NeonDriftwayEngine): void {
    const ctx = this.ctx;
    const n = Math.ceil(game.countdownTimer);
    const text = n > 0 ? String(n) : 'GO!';
    const scale = 1 + (game.countdownTimer % 1) * 0.3;

    ctx.save();
    ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 72px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  // ── Ability Pickup ──

  private drawAbilityPickup(x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    const t = Date.now() * 0.003;
    const pulse = 0.8 + Math.sin(t) * 0.2;
    const r = (w / 2) * pulse;

    // Glow
    const grad = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 1.5);
    grad.addColorStop(0, 'rgba(176,64,255,0.6)');
    grad.addColorStop(1, 'rgba(176,64,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Orb
    ctx.fillStyle = '#b040ff';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Inner highlight
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Remote Players ──

  private drawRemotePlayers(game: NeonDriftwayEngine): void {
    const ctx = this.ctx;
    const now = Date.now();

    for (const [, remote] of game.remotePlayers) {
      // Interpolate x position
      const elapsed = now - remote.lastUpdate;
      const t = Math.min(elapsed / 100, 1); // 100ms interpolation window
      const drawX = remote.prevX + (remote.targetX - remote.prevX) * t;
      const drawY = game.car.y; // Same Y as local car (top-down view)

      ctx.save();
      ctx.globalAlpha = 0.5;

      // Try sprite, fallback to ghost rect
      if (!this.tryDrawSprite(remote.spriteKey, drawX, drawY, CAR_WIDTH, CAR_HEIGHT)) {
        // Ghost rectangle
        ctx.fillStyle = 'rgba(100,180,255,0.4)';
        ctx.fillRect(drawX - CAR_WIDTH / 2, drawY - CAR_HEIGHT / 2, CAR_WIDTH, CAR_HEIGHT);
        ctx.strokeStyle = 'rgba(100,180,255,0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(drawX - CAR_WIDTH / 2, drawY - CAR_HEIGHT / 2, CAR_WIDTH, CAR_HEIGHT);
      }

      ctx.globalAlpha = 1;

      // Name label
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(drawX - 30, drawY - CAR_HEIGHT / 2 - 18, 60, 14);
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(remote.name.slice(0, 10), drawX, drawY - CAR_HEIGHT / 2 - 11);

      ctx.restore();
    }
  }

  // ── Multiplayer Scoreboard ──

  private drawMultiplayerScoreboard(game: NeonDriftwayEngine): void {
    const ctx = this.ctx;
    const entries: { name: string; score: number; isSelf: boolean }[] = [];

    // Add local player
    entries.push({ name: 'You', score: Math.round(game.score), isSelf: true });

    // Add remote players
    for (const [, remote] of game.remotePlayers) {
      entries.push({ name: remote.name, score: Math.round(remote.score), isSelf: false });
    }

    // Sort descending
    entries.sort((a, b) => b.score - a.score);

    const x = CANVAS_WIDTH - 10;
    const startY = 68;
    const lineH = 16;
    const boxW = 160;
    const boxH = 20 + entries.length * lineH;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - boxW, startY, boxW, boxH);

    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#888888';
    ctx.fillText('SCOREBOARD', x - boxW + 8, startY + 4);

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const ey = startY + 18 + i * lineH;
      ctx.fillStyle = e.isSelf ? '#00ffff' : '#cccccc';
      ctx.font = e.isSelf ? 'bold 11px monospace' : '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}. ${e.name}`, x - boxW + 8, ey);
      ctx.textAlign = 'right';
      ctx.fillText(e.score.toLocaleString(), x - 8, ey);
    }
  }

  // ── Ability HUD ──

  private drawAbilityHUD(game: NeonDriftwayEngine): void {
    const ctx = this.ctx;
    const charges = game.car.abilityCharges;
    const maxCharges = 3;

    const x = 16;
    const y = CANVAS_HEIGHT - 60;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - 4, y - 4, 80, 28);

    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#b040ff';
    ctx.fillText('ABILITY [E]', x, y);

    // Charge dots
    for (let i = 0; i < maxCharges; i++) {
      const dx = x + 4 + i * 20;
      const dy = y + 14;
      ctx.beginPath();
      ctx.arc(dx + 6, dy, 5, 0, Math.PI * 2);
      if (i < charges) {
        ctx.fillStyle = '#b040ff';
        ctx.fill();
      } else {
        ctx.strokeStyle = '#555555';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  // ── Slowdown Overlay ──

  private drawSlowdownOverlay(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(40,80,200,0.15)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // "SLOWED!" text
    ctx.fillStyle = 'rgba(68,136,255,0.8)';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SLOWED!', CANVAS_WIDTH / 2, 80);
    ctx.restore();
  }
}
