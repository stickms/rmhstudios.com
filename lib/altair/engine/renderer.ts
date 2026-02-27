// =============================================================================
// ALTAIR ENGINE -- Renderer
// =============================================================================
// Full canvas 2D rendering system. Draws every layer of the game world each
// frame: tiles, pickups, auras, melee hitboxes, enemies, projectiles, player,
// summons, particles, pools, and boss warning arrows.
//
// Sprite-first: draws pixel-art sprites when loaded, otherwise falls back to
// the original vector primitives.
// =============================================================================

import {
  GameWorld,
  Camera,
  EnemyEntity,
  ProjectileEntity,
  PickupEntity,
  ParticleEntity,
  MeleeHitbox,
  AuraEffect,
  SummonEntity,
  StatusEffect,
} from './types';
import { worldToScreen, isVisible } from './camera';
import { TileGenerator } from './tile-generator';
import { getMovementVector } from './input';
import { ENEMIES } from '../data/enemies';

// Sprite imports
import {
  getPlayerSprites,
  getEnemySprites,
  getBossSprites,
  getPickupSheet,
  getProjectileSheet,
  getSummonSprites,
  PICKUP_FRAMES,
  PLAYER_SCALE,
  getEnemyScale,
  getBossScale,
  PICKUP_SCALE,
  SUMMON_SCALE,
  getProjectileScale,
} from './sprites/sprite-defs';
import { drawSprite, drawAnimatedSprite } from './sprites/sprite-renderer';
import {
  pickDirectionalAnim,
  createAnimState,
  updateAnimation,
  getCurrentFrameIndex,
  type AnimationState,
  type EntitySpriteSet,
} from './sprites/sprite-animator';

// ---- Enemy lookup cache (built once) ----------------------------------------

const ENEMY_COLOR_MAP = new Map<string, string>();
const ENEMY_SHAPE_MAP = new Map<string, string>();
for (const def of ENEMIES) {
  ENEMY_COLOR_MAP.set(def.id, def.color);
  ENEMY_SHAPE_MAP.set(def.id, def.shape);
}

const STATUS_TINT: Record<StatusEffect['type'], string> = {
  poison: 'rgba(0,200,0,0.3)',
  slow: 'rgba(100,100,255,0.3)',
  stun: 'rgba(255,255,0,0.4)',
  freeze: 'rgba(100,200,255,0.4)',
  curse: 'rgba(100,0,100,0.3)',
  mark: 'rgba(255,100,0,0.3)',
  empower: 'rgba(255,200,0,0.2)',
  intangible: 'rgba(200,200,255,0.2)',
};

// ---- Main entry point -------------------------------------------------------

/**
 * Render a complete frame to the canvas.
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  tileGen: TileGenerator,
): void {
  const { camera } = world;

  // Ensure pixel art stays crisp on any DPR/resolution
  ctx.imageSmoothingEnabled = false;

  // Clear
  ctx.clearRect(0, 0, camera.width, camera.height);
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, camera.width, camera.height);

  // --- World-space layers (camera-relative) ---

  // 1. Tiles & props
  tileGen.renderTiles(ctx, camera);
  tileGen.renderProps(ctx, camera);

  // 2. Auras (below entities)
  renderAuras(ctx, world.auras, camera);

  // 3. Pool effects (lingering projectiles)
  renderPools(ctx, world.projectiles, camera);

  // 4. Pickups
  renderPickups(ctx, world.pickups, camera);

  // 5. Melee hitboxes
  renderMeleeHitboxes(ctx, world.meleeHitboxes, camera);

  // 6. Summons
  renderSummons(ctx, world.summons, camera);

  // 7. Enemies
  renderEnemies(ctx, world.enemies, camera);

  // 8. Projectiles
  renderProjectiles(ctx, world.projectiles, camera);

  // 9. Player
  renderPlayer(ctx, world, camera);

  // 10. Particles (on top of everything)
  renderParticles(ctx, world.particles, camera);

  // --- Screen-space overlays ---

  // 11. Boss warning arrows
  if (world.bossWarning) {
    renderBossWarning(ctx, world, camera);
  }

  // 12. Minimap (shown while Tab is held)
  if (world.inputState.keys.has('tab')) {
    renderMinimap(ctx, world, camera);
  }
}

// ---- Pickups ----------------------------------------------------------------

/** Get XP orb color based on accumulated value (combined orbs look different). */
function getXPOrbColor(value: number): string {
  if (value >= 50) return '#ff4444'; // red — massive combined
  if (value >= 25) return '#ff8800'; // orange — large
  if (value >= 10) return '#ffcc00'; // yellow — combined medium
  if (value >= 5) return '#44cc44';  // green — medium
  if (value >= 3) return '#66bbff';  // bright blue — combined small
  return '#4488ff';                  // blue — single small
}

/** Get XP orb render size based on accumulated value. */
function getXPOrbSize(value: number): number {
  if (value >= 50) return 7;
  if (value >= 25) return 6;
  if (value >= 10) return 5;
  if (value >= 5) return 4;
  return 3;
}

function isXPPickup(p: PickupEntity): boolean {
  return p.type === 'xp_small' || p.type === 'xp_medium' || p.type === 'xp_large';
}

function renderPickups(
  ctx: CanvasRenderingContext2D,
  pickups: PickupEntity[],
  camera: Camera,
): void {
  const pickupSheet = getPickupSheet();

  // Two-pass: XP orbs first (below), then non-XP pickups on top
  for (let pass = 0; pass < 2; pass++) {
    for (const p of pickups) {
      const isXP = isXPPickup(p);
      if (pass === 0 && !isXP) continue;  // first pass: XP only
      if (pass === 1 && isXP) continue;   // second pass: non-XP only

      if (!isVisible(camera, p.x, p.y, 20)) continue;
      const s = worldToScreen(camera, p.x, p.y);

      // For non-XP pickups, try sprite rendering
      if (!isXP && pickupSheet) {
        const frameIndex = PICKUP_FRAMES[p.type];
        if (frameIndex !== undefined) {
          drawSprite(ctx, pickupSheet, frameIndex, s.x, s.y, PICKUP_SCALE, false);
          continue;
        }
      }

      // Vector rendering
      ctx.save();
      ctx.translate(s.x, s.y);

      if (isXP) {
        // XP orbs: color and size based on accumulated value
        const color = getXPOrbColor(p.value);
        const size = getXPOrbSize(p.value);
        drawDiamond(ctx, size, color);

        // Subtle glow for combined orbs (value > base)
        if (p.value >= 5) {
          ctx.globalAlpha = 0.2;
          drawDiamond(ctx, size + 2, color);
          ctx.globalAlpha = 1;
        }
      } else {
        switch (p.type) {
          case 'coin':
            ctx.fillStyle = '#ffd700';
            ctx.beginPath();
            ctx.arc(0, 0, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#b8960f';
            ctx.lineWidth = 1;
            ctx.stroke();
            break;
          case 'food':
            ctx.fillStyle = '#ff3333';
            ctx.fillRect(-2, -6, 4, 12);
            ctx.fillRect(-6, -2, 12, 4);
            break;
          case 'magnet':
            drawDiamond(ctx, 6, '#ff6600');
            break;
          case 'vacuum':
            drawDiamond(ctx, 7, '#cc00ff');
            break;
          case 'rosary':
            drawDiamond(ctx, 7, '#ffffff');
            break;
          case 'chest':
            ctx.fillStyle = '#c8a23c';
            ctx.fillRect(-8, -6, 16, 12);
            ctx.strokeStyle = '#8b6914';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-8, -6, 16, 12);
            ctx.fillStyle = '#8b6914';
            ctx.fillRect(-2, -2, 4, 4);
            break;
          case 'clock':
            ctx.fillStyle = '#66ccff';
            ctx.beginPath();
            ctx.arc(0, 0, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#3399cc';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-1, -4, 2, 8);
            ctx.fillRect(-3, -1, 6, 2);
            break;
          case 'shield_orb':
            ctx.fillStyle = '#66aaff';
            ctx.beginPath();
            ctx.arc(0, 0, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#88ccff';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.beginPath();
            ctx.arc(-1, -2, 2, 0, Math.PI * 2);
            ctx.fill();
            break;
          case 'bomb':
            ctx.fillStyle = '#333333';
            ctx.beginPath();
            ctx.arc(0, 1, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ff4444';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.strokeStyle = '#ff6600';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(2, -5);
            ctx.lineTo(4, -8);
            ctx.stroke();
            ctx.fillStyle = '#ffaa00';
            ctx.beginPath();
            ctx.arc(4, -8, 2, 0, Math.PI * 2);
            ctx.fill();
            break;
        }
      }

      ctx.restore();
    }
  }
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  size: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.7, 0);
  ctx.lineTo(0, size);
  ctx.lineTo(-size * 0.7, 0);
  ctx.closePath();
  ctx.fill();
}

// ---- Auras ------------------------------------------------------------------

function renderAuras(
  ctx: CanvasRenderingContext2D,
  auras: AuraEffect[],
  camera: Camera,
): void {
  for (const a of auras) {
    if (!isVisible(camera, a.x, a.y, a.radius)) continue;
    const s = worldToScreen(camera, a.x, a.y);

    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#8844ff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, a.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#aa66ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

// ---- Melee hitboxes ---------------------------------------------------------

function renderMeleeHitboxes(
  ctx: CanvasRenderingContext2D,
  hitboxes: MeleeHitbox[],
  camera: Camera,
): void {
  for (const h of hitboxes) {
    if (!isVisible(camera, h.x, h.y, h.radius)) continue;
    const s = worldToScreen(camera, h.x, h.y);

    const progress = 1 - h.lifetime / (h.maxLifetime || 0.2); // 0 → 1
    const fadeOut = Math.max(0, 1 - progress * 1.5); // fades in last third

    ctx.save();

    if (h.arc >= Math.PI * 1.9) {
      // Full 360° cleave: expanding ring
      const ringRadius = h.radius * (0.3 + 0.7 * progress);
      const ringWidth = h.radius * 0.15 * fadeOut;

      ctx.globalAlpha = 0.4 * fadeOut;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = ringWidth;
      ctx.beginPath();
      ctx.arc(s.x, s.y, ringRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.15 * fadeOut;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, ringRadius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Directional slash: animated arc sweep
      const sweepProgress = Math.min(1, progress * 2);
      const startAngle = h.angle - h.arc / 2;
      const sweepArc = h.arc * sweepProgress;

      const innerR = h.radius * 0.4;
      const outerR = h.radius * (0.6 + 0.4 * sweepProgress);
      const trailWidth = (outerR - innerR) * fadeOut;

      // Main slash arc
      ctx.globalAlpha = 0.6 * fadeOut;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = trailWidth;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(s.x, s.y, (innerR + outerR) / 2, startAngle, startAngle + sweepArc);
      ctx.stroke();

      // Glow behind the slash
      ctx.globalAlpha = 0.2 * fadeOut;
      ctx.lineWidth = trailWidth * 2;
      ctx.strokeStyle = '#aaccff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, (innerR + outerR) / 2, startAngle, startAngle + sweepArc);
      ctx.stroke();

      // Leading edge spark
      if (sweepProgress < 0.9) {
        const edgeAngle = startAngle + sweepArc;
        const edgeX = s.x + Math.cos(edgeAngle) * outerR;
        const edgeY = s.y + Math.sin(edgeAngle) * outerR;
        ctx.globalAlpha = 0.8 * fadeOut;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(edgeX, edgeY, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}

// ---- Enemies ----------------------------------------------------------------

function renderEnemies(
  ctx: CanvasRenderingContext2D,
  enemies: EnemyEntity[],
  camera: Camera,
): void {
  for (const e of enemies) {
    if (!isVisible(camera, e.x, e.y, e.radius + 20)) continue;
    const s = worldToScreen(camera, e.x, e.y);

    ctx.save();

    // Intangible enemies are translucent
    if (e.intangible) {
      ctx.globalAlpha = e.opacity;
    }

    // Flash white when hit
    const isFlashing = e.flashTimer > 0;

    // Try sprite rendering
    const isBoss = e.isBoss && e.bossId;
    const sprites = isBoss ? getBossSprites(e.bossId!) : getEnemySprites(e.defId);
    const scale = isBoss ? getBossScale(e.radius) : getEnemyScale(e.radius);

    if (sprites && e.animState) {
      const flipEnemy = e.animState.animation === sprites.walkSide && e.lastMoveVx < 0;
      if (isFlashing) {
        // Flash: draw with increased brightness
        ctx.globalAlpha = (e.intangible ? e.opacity : 1) * 0.6;
        drawAnimatedSprite(ctx, e.animState, s.x, s.y, scale, flipEnemy);
        // White overlay
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = '#ffffff';
        const spriteSize = (isBoss ? 32 : 16) * scale;
        ctx.fillRect(
          Math.round(s.x - spriteSize / 2),
          Math.round(s.y - spriteSize / 2),
          spriteSize,
          spriteSize,
        );
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = e.intangible ? e.opacity : 1;
      }
      drawAnimatedSprite(ctx, e.animState, s.x, s.y, scale, flipEnemy);
    } else {
      // Vector fallback
      const baseColor = isFlashing ? '#ffffff' : getEnemyColor(e);
      const shape = getEnemyShape(e);
      ctx.fillStyle = baseColor;

      switch (shape) {
        case 'circle':
          ctx.beginPath();
          ctx.arc(s.x, s.y, e.radius, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'square':
          ctx.fillRect(
            s.x - e.radius,
            s.y - e.radius,
            e.radius * 2,
            e.radius * 2,
          );
          break;
        case 'triangle':
          drawPolygon(ctx, s.x, s.y, e.radius, 3);
          break;
        case 'diamond':
          drawPolygon(ctx, s.x, s.y, e.radius, 4, Math.PI / 4);
          break;
        case 'pentagon':
          drawPolygon(ctx, s.x, s.y, e.radius, 5);
          break;
        case 'hexagon':
          drawPolygon(ctx, s.x, s.y, e.radius, 6);
          break;
        case 'star':
          drawStar(ctx, s.x, s.y, e.radius);
          break;
        default:
          ctx.beginPath();
          ctx.arc(s.x, s.y, e.radius, 0, Math.PI * 2);
          ctx.fill();
      }
    }

    // Status effect tint overlays
    for (const se of e.statusEffects) {
      const tint = STATUS_TINT[se.type];
      if (tint) {
        ctx.fillStyle = tint;
        ctx.beginPath();
        ctx.arc(s.x, s.y, e.radius + 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // HP bar (only if damaged)
    if (e.hp < e.maxHp) {
      const barW = e.radius * 2.5;
      const barH = 3;
      const barX = s.x - barW / 2;
      const barY = s.y - e.radius - 8;
      const hpFrac = Math.max(0, e.hp / e.maxHp);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = hpFrac > 0.5 ? '#44ff44' : hpFrac > 0.25 ? '#ffaa00' : '#ff3333';
      ctx.fillRect(barX, barY, barW * hpFrac, barH);
    }

    // Armor indicator
    if (e.armor > 0) {
      ctx.fillStyle = '#aaaacc';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`[${e.armor}]`, s.x, s.y + e.radius + 12);
    }

    // Boss indicator (ring) — only when using vector fallback
    if (e.isBoss && !sprites) {
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, e.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function getEnemyColor(e: EnemyEntity): string {
  return ENEMY_COLOR_MAP.get(e.defId) || (e.isBoss ? '#dd2222' : '#cc4444');
}

function getEnemyShape(e: EnemyEntity): string {
  return ENEMY_SHAPE_MAP.get(e.defId) || (e.isBoss ? 'star' : 'circle');
}

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  sides: number,
  startAngle: number = -Math.PI / 2,
): void {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = startAngle + (Math.PI * 2 * i) / sides;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
): void {
  const points = 5;
  const innerR = r * 0.5;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = -Math.PI / 2 + (Math.PI * i) / points;
    const rad = i % 2 === 0 ? r : innerR;
    const px = cx + Math.cos(angle) * rad;
    const py = cy + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

// ---- Projectiles ------------------------------------------------------------

function renderProjectiles(
  ctx: CanvasRenderingContext2D,
  projectiles: ProjectileEntity[],
  camera: Camera,
): void {
  const projSheet = getProjectileSheet();

  for (const p of projectiles) {
    if (p.isPool) continue;
    if (!isVisible(camera, p.x, p.y, p.radius + 5)) continue;
    const s = worldToScreen(camera, p.x, p.y);

    ctx.save();

    if (projSheet) {
      // Sprite projectile with glow
      if (p.isEnemy) {
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 4;
      } else {
        ctx.shadowColor = p.color || '#ffcc00';
        ctx.shadowBlur = 3;
      }
      const frameIndex = p.isEnemy ? 1 : 0; // frame 0 = player, 1 = enemy
      const scale = getProjectileScale(p.radius);
      drawSprite(ctx, projSheet, frameIndex, s.x, s.y, scale, false);
    } else {
      // Vector fallback
      if (p.isEnemy) {
        ctx.fillStyle = '#cc3333';
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 4;
      } else {
        ctx.fillStyle = p.color || '#ffcc00';
        ctx.shadowColor = p.color || '#ffcc00';
        ctx.shadowBlur = 3;
      }

      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(p.radius, 2), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

// ---- Pools ------------------------------------------------------------------

function renderPools(
  ctx: CanvasRenderingContext2D,
  projectiles: ProjectileEntity[],
  camera: Camera,
): void {
  for (const p of projectiles) {
    if (!p.isPool) continue;
    const radius = p.poolRadius || p.radius;
    if (!isVisible(camera, p.x, p.y, radius)) continue;
    const s = worldToScreen(camera, p.x, p.y);
    const color = p.color || '#44ff44';

    ctx.save();

    // Pulsing animation based on pool timer
    const pulse = 0.9 + 0.1 * Math.sin((p.poolTimer ?? 0) * 8);

    // Radial gradient fill for depth
    const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, radius * pulse);
    grad.addColorStop(0, color + 'AA');   // 67% center opacity
    grad.addColorStop(0.5, color + '66'); // 40% mid
    grad.addColorStop(1, color + '22');   // 13% edge

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(s.x, s.y, radius * pulse, 0, Math.PI * 2);
    ctx.fill();

    // Concentric ring for visibility
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, radius * pulse, 0, Math.PI * 2);
    ctx.stroke();

    // Inner ring
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(s.x, s.y, radius * 0.5 * pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}

// ---- Player -----------------------------------------------------------------

function renderPlayer(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  camera: Camera,
): void {
  const pl = world.player;
  const s = worldToScreen(camera, pl.x, pl.y);

  ctx.save();

  // Invincibility flash
  if (pl.iFrames > 0) {
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(pl.iFrames * 20);
  }

  // Shield aura (always draw — works with sprites too)
  if (pl.shieldHp > 0) {
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, pl.radius + 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Try sprite rendering
  const sprites = getPlayerSprites(world.classId);
  if (sprites && pl.animState) {
    const flipX = pl.animState.animation === sprites.walkSide && pl.facingX < 0;
    drawAnimatedSprite(ctx, pl.animState, s.x, s.y, PLAYER_SCALE, flipX);
  } else {
    // Vector fallback
    ctx.fillStyle = '#44aaff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, pl.radius, 0, Math.PI * 2);
    ctx.fill();

    // Inner highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.arc(s.x - 2, s.y - 2, pl.radius * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Directional indicator
    const facingAngle = Math.atan2(pl.facingY, pl.facingX);
    const tipDist = pl.radius + 6;
    const tipX = s.x + Math.cos(facingAngle) * tipDist;
    const tipY = s.y + Math.sin(facingAngle) * tipDist;
    const baseOffset = Math.PI * 0.85;
    const baseR = pl.radius * 0.5;

    ctx.fillStyle = '#88ccff';
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(
      s.x + Math.cos(facingAngle + baseOffset) * baseR,
      s.y + Math.sin(facingAngle + baseOffset) * baseR,
    );
    ctx.lineTo(
      s.x + Math.cos(facingAngle - baseOffset) * baseR,
      s.y + Math.sin(facingAngle - baseOffset) * baseR,
    );
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

// ---- Summons ----------------------------------------------------------------

function renderSummons(
  ctx: CanvasRenderingContext2D,
  summons: SummonEntity[],
  camera: Camera,
): void {
  const summonSpriteSet = getSummonSprites();

  for (const sm of summons) {
    if (!isVisible(camera, sm.x, sm.y, sm.radius + 10)) continue;
    const screen = worldToScreen(camera, sm.x, sm.y);

    ctx.save();

    if (summonSpriteSet && sm.animState) {
      const flipX = sm.animState.animation === summonSpriteSet.walkSide && false;
      drawAnimatedSprite(ctx, sm.animState, screen.x, screen.y, SUMMON_SCALE, flipX);
    } else {
      // Vector fallback
      ctx.fillStyle = '#bbccaa';
      ctx.beginPath();
      ctx.moveTo(screen.x, screen.y - sm.radius);
      ctx.lineTo(screen.x - sm.radius * 0.8, screen.y + sm.radius * 0.6);
      ctx.lineTo(screen.x + sm.radius * 0.8, screen.y + sm.radius * 0.6);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#889977';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // HP bar if damaged
    if (sm.hp < sm.maxHp) {
      const barW = sm.radius * 2;
      const barH = 2;
      const barX = screen.x - barW / 2;
      const barY = screen.y - sm.radius - 6;
      const hpFrac = Math.max(0, sm.hp / sm.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = '#88cc88';
      ctx.fillRect(barX, barY, barW * hpFrac, barH);
    }

    ctx.restore();
  }
}

// ---- Particles --------------------------------------------------------------

function renderParticles(
  ctx: CanvasRenderingContext2D,
  particles: ParticleEntity[],
  camera: Camera,
): void {
  for (const p of particles) {
    if (!isVisible(camera, p.x, p.y, 50)) continue;
    const s = worldToScreen(camera, p.x, p.y);

    ctx.save();

    const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
    ctx.globalAlpha = alpha;

    if (p.text) {
      const size = p.fontSize || 14;
      ctx.font = `bold ${size}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.lineWidth = 3;
      ctx.strokeText(p.text, s.x, s.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, s.x, s.y);
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, p.radius * alpha, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

// ---- Boss warning arrows ----------------------------------------------------

function renderBossWarning(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  camera: Camera,
): void {
  if (!world.bossWarning) return;

  const bw = world.bossWarning;
  const flashAlpha = 0.5 + 0.5 * Math.sin(bw.timer * 8);

  const boss = world.enemies.find(
    (e) => e.isBoss && e.bossId === bw.bossId,
  );
  if (!boss) {
    ctx.save();
    ctx.globalAlpha = flashAlpha;
    ctx.fillStyle = '#ff2222';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('! BOSS INCOMING !', camera.width / 2, 60);
    ctx.restore();
    return;
  }

  if (!isVisible(camera, boss.x, boss.y, 0)) {
    const screenCenter = { x: camera.width / 2, y: camera.height / 2 };
    const bossScreen = worldToScreen(camera, boss.x, boss.y);

    const dx = bossScreen.x - screenCenter.x;
    const dy = bossScreen.y - screenCenter.y;
    const angle = Math.atan2(dy, dx);

    const margin = 40;
    const edgeX = Math.max(
      margin,
      Math.min(camera.width - margin, screenCenter.x + Math.cos(angle) * (camera.width / 2 - margin)),
    );
    const edgeY = Math.max(
      margin,
      Math.min(camera.height - margin, screenCenter.y + Math.sin(angle) * (camera.height / 2 - margin)),
    );

    ctx.save();
    ctx.globalAlpha = flashAlpha;
    ctx.translate(edgeX, edgeY);
    ctx.rotate(angle);

    ctx.fillStyle = '#ff2222';
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-8, -8);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

// ---- Minimap ----------------------------------------------------------------

const MINIMAP_SIZE = 200;
const MINIMAP_RANGE = 2000; // world units visible on minimap

function renderMinimap(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  camera: Camera,
): void {
  const mx = camera.width - MINIMAP_SIZE - 12;
  const my = camera.height - MINIMAP_SIZE - 12;
  const scale = MINIMAP_SIZE / (MINIMAP_RANGE * 2);
  const px = world.player.x;
  const py = world.player.y;

  ctx.save();

  // Background
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = '#111118';
  ctx.beginPath();
  ctx.arc(mx + MINIMAP_SIZE / 2, my + MINIMAP_SIZE / 2, MINIMAP_SIZE / 2, 0, Math.PI * 2);
  ctx.fill();

  // Clip to circle
  ctx.beginPath();
  ctx.arc(mx + MINIMAP_SIZE / 2, my + MINIMAP_SIZE / 2, MINIMAP_SIZE / 2 - 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalAlpha = 1;

  // Enemies (red dots)
  ctx.fillStyle = '#ff4444';
  for (const e of world.enemies) {
    const ex = (e.x - px) * scale + MINIMAP_SIZE / 2;
    const ey = (e.y - py) * scale + MINIMAP_SIZE / 2;
    if (ex < -5 || ex > MINIMAP_SIZE + 5 || ey < -5 || ey > MINIMAP_SIZE + 5) continue;
    const dotSize = e.isBoss ? 4 : 1.5;
    ctx.fillRect(mx + ex - dotSize / 2, my + ey - dotSize / 2, dotSize, dotSize);
  }

  // Pickups (colored dots)
  for (const p of world.pickups) {
    const pkx = (p.x - px) * scale + MINIMAP_SIZE / 2;
    const pky = (p.y - py) * scale + MINIMAP_SIZE / 2;
    if (pkx < -5 || pkx > MINIMAP_SIZE + 5 || pky < -5 || pky > MINIMAP_SIZE + 5) continue;
    switch (p.type) {
      case 'chest': ctx.fillStyle = '#c8a23c'; break;
      case 'coin': ctx.fillStyle = '#ffd700'; break;
      case 'food': ctx.fillStyle = '#ff3333'; break;
      default: ctx.fillStyle = '#4488ff'; break;
    }
    ctx.fillRect(mx + pkx - 1, my + pky - 1, 2, 2);
  }

  // Player (white dot, center)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(mx + MINIMAP_SIZE / 2, my + MINIMAP_SIZE / 2, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Border ring
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = '#aaaacc';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(mx + MINIMAP_SIZE / 2, my + MINIMAP_SIZE / 2, MINIMAP_SIZE / 2, 0, Math.PI * 2);
  ctx.stroke();

  // Label
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#ffffff';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('TAB — Minimap', mx + MINIMAP_SIZE / 2, my - 4);
  ctx.restore();
}

// ---- Animation update helpers (called from game-loop) -----------------------

/**
 * Update the player's animation state based on movement.
 */
export function updatePlayerAnimation(world: GameWorld, dt: number): void {
  const pl = world.player;
  const sprites = getPlayerSprites(world.classId);
  if (!sprites) return;

  const { dx, dy } = getMovementVector(world.inputState);
  const isMoving = Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1;
  const { animation, flipX } = pickDirectionalAnim(sprites, pl.facingX, pl.facingY, isMoving);

  // Switch animation if direction changed
  if (!pl.animState || pl.animState.animation !== animation) {
    pl.animState = createAnimState(animation);
  }

  updateAnimation(pl.animState, dt);
}

/**
 * Update an enemy's animation state based on its movement velocity.
 */
export function updateEnemyAnimation(enemy: EnemyEntity, dt: number): void {
  const isBoss = enemy.isBoss && enemy.bossId;
  const sprites = isBoss ? getBossSprites(enemy.bossId!) : getEnemySprites(enemy.defId);
  if (!sprites) return;

  // Use tracked movement velocity for correct facing direction
  const vx = enemy.lastMoveVx;
  const vy = enemy.lastMoveVy;
  const isMoving = (Math.abs(vx) > 0.1 || Math.abs(vy) > 0.1) && enemy.aiState !== 'idle';

  const { animation } = pickDirectionalAnim(sprites, vx, vy, isMoving);

  if (!enemy.animState || enemy.animState.animation !== animation) {
    enemy.animState = createAnimState(animation);
  }

  updateAnimation(enemy.animState, dt);
}

/**
 * Update a summon's animation state.
 */
export function updateSummonAnimation(summon: SummonEntity, vx: number, vy: number, dt: number): void {
  const sprites = getSummonSprites();
  if (!sprites) return;

  const isMoving = Math.abs(vx) > 0.1 || Math.abs(vy) > 0.1;
  const { animation } = pickDirectionalAnim(sprites, vx, vy, isMoving);

  if (!summon.animState || summon.animState.animation !== animation) {
    summon.animState = createAnimState(animation);
  }

  updateAnimation(summon.animState, dt);
}
