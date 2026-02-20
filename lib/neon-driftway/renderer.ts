import type { NeonDriftwayEngine } from './game';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  V_MIN, V_MAX_NORMAL, V_MAX_BOOST, BOOST_MAX,
  STREAK_WINDOW_MS,
  roadLeft, roadRight, laneWidth,
} from './constants';

export class NeonDriftwayRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
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
    this.drawCar(game);
    this.drawPopups(game);

    // Headlight overlay for Level 3
    if (game.level.headlightsEnabled && game.state === 'playing') {
      this.drawHeadlightOverlay(game);
    }

    ctx.restore();

    // HUD drawn without shake
    if (game.state === 'playing' || game.state === 'paused') {
      this.drawHUD(game);
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
      } else if (o.type === 'debris') {
        this.drawDebris(o.x, o.y, o.width, o.height, o.color);
      } else if (o.isTraffic) {
        this.drawTrafficCar(o.x, o.y, o.width, o.height, o.color, o.signaling);
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
}
