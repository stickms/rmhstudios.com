// =============================================================================
// ALTAIR ENGINE -- Renderer (WebGL)
// =============================================================================
// Full WebGL rendering system. Uses SpriteBatch for textured quads, ShapeBatch
// for colored geometry, and a Canvas 2D overlay for text and minimap.
//
// How it works:
// 1. WebGL clears and draws all world-space layers via batches
// 2. Sprite batch flushes automatically on texture changes
// 3. Shape batch handles all vector fallback geometry
// 4. 2D overlay canvas handles text, minimap, and complex HUD
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
import { drawSprite, drawAnimatedSprite, drawSpriteFlash, drawSpriteCorpse } from './sprites/sprite-renderer';
import {
  pickDirectionalAnim,
  createAnimState,
  updateAnimation,
  getCurrentFrameIndex,
  getFrameRect,
  type AnimationState,
  type EntitySpriteSet,
} from './sprites/sprite-animator';

import type { SpriteBatch } from './webgl/webgl-sprite-batch';
import type { ShapeBatch } from './webgl/webgl-shapes';

// ---- WebGL Renderer facade --------------------------------------------------

export interface WebGLRenderer {
  gl: WebGLRenderingContext;
  spriteBatch: SpriteBatch;
  shapeBatch: ShapeBatch;
  overlayCtx: CanvasRenderingContext2D;
}

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

const LOCAL_PLAYER_SCREEN_SMOOTHING = 0.35;
const LOCAL_PLAYER_SNAP_DISTANCE = 96;
const localPlayerScreenState = new WeakMap<object, { x: number; y: number }>();

function getSmoothedLocalPlayerScreenPosition(
  player: object,
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  let state = localPlayerScreenState.get(player);
  if (!state) {
    state = { x: targetX, y: targetY };
    localPlayerScreenState.set(player, state);
    return state;
  }

  const dx = targetX - state.x;
  const dy = targetY - state.y;
  const distSq = dx * dx + dy * dy;

  // Snap immediately if the player was teleported or repositioned sharply.
  if (distSq >= LOCAL_PLAYER_SNAP_DISTANCE * LOCAL_PLAYER_SNAP_DISTANCE) {
    state.x = targetX;
    state.y = targetY;
    return state;
  }

  state.x += dx * LOCAL_PLAYER_SCREEN_SMOOTHING;
  state.y += dy * LOCAL_PLAYER_SCREEN_SMOOTHING;
  return state;
}

// ---- Main entry point -------------------------------------------------------

/**
 * Render a complete frame using WebGL.
 */
export function renderFrame(
  renderer: WebGLRenderer,
  world: GameWorld,
  tileGen: TileGenerator,
): void {
  const { gl, spriteBatch, shapeBatch, overlayCtx } = renderer;
  const { camera } = world;

  // Clear WebGL canvas
  gl.viewport(0, 0, camera.width, camera.height);
  gl.clearColor(0.067, 0.067, 0.067, 1); // #111111
  gl.clear(gl.COLOR_BUFFER_BIT);

  // Clear overlay canvas
  overlayCtx.clearRect(0, 0, camera.width, camera.height);

  // Begin batches
  spriteBatch.begin(camera.width, camera.height);
  shapeBatch.begin(camera.width, camera.height);

  // --- World-space layers (camera-relative) ---

  // 1. Tiles & props
  tileGen.renderTiles(renderer, camera);
  tileGen.renderProps(renderer, camera);

  // Need to flush sprites before shapes for correct draw order
  spriteBatch.flush();

  // 2. Auras (below entities)
  renderAuras(shapeBatch, world.auras, camera);
  shapeBatch.flush();

  // 3. Pool effects (lingering projectiles)
  renderPools(shapeBatch, world.projectiles, camera);
  shapeBatch.flush();

  // 4. Pickups
  renderPickups(renderer, world.pickups, camera);

  // 5. Melee hitboxes
  spriteBatch.flush();
  renderMeleeHitboxes(shapeBatch, world.meleeHitboxes, camera);
  shapeBatch.flush();

  // 6. Summons
  renderSummons(renderer, world.summons, camera);

  // 7. Enemies
  renderEnemies(renderer, world.enemies, camera);

  // 8. Projectiles
  renderProjectiles(renderer, world.projectiles, camera);

  // 9. Player
  renderPlayer(renderer, world, camera);

  // 10. Particles (on top of everything)
  spriteBatch.flush();
  renderParticles(renderer, world.particles, camera);

  // Flush all remaining batched geometry
  spriteBatch.end();
  shapeBatch.end();

  // --- Screen-space overlays (2D canvas) ---

  // 11. Boss warning arrows
  if (world.bossWarning) {
    renderBossWarning(overlayCtx, world, camera);
  }

  // 12. Minimap (shown while Tab is held)
  if (world.inputState.keys.has('tab')) {
    renderMinimap(overlayCtx, world, camera);
  }
}

// ---- Pickups ----------------------------------------------------------------

function getXPOrbColor(value: number): string {
  if (value >= 50) return '#ff4444';
  if (value >= 25) return '#ff8800';
  if (value >= 10) return '#ffcc00';
  if (value >= 5) return '#44cc44';
  if (value >= 3) return '#66bbff';
  return '#4488ff';
}

function getXPOrbSize(value: number): number {
  if (value >= 50) return 11;
  if (value >= 25) return 10;
  if (value >= 10) return 9;
  if (value >= 5) return 8;
  return 6;
}

function isXPPickup(p: PickupEntity): boolean {
  return p.type === 'xp_small' || p.type === 'xp_medium' || p.type === 'xp_large';
}

function renderPickups(
  renderer: WebGLRenderer,
  pickups: PickupEntity[],
  camera: Camera,
): void {
  const { spriteBatch, shapeBatch } = renderer;
  const pickupSheet = getPickupSheet();

  let drawingShapes = false;

  for (let pass = 0; pass < 2; pass++) {
    for (const p of pickups) {
      const isXP = isXPPickup(p);
      if (pass === 0 && !isXP) continue;
      if (pass === 1 && isXP) continue;

      if (!isVisible(camera, p.x, p.y, 20)) continue;
      const s = worldToScreen(camera, p.x, p.y);

      // Sprite rendering for non-XP pickups
      if (!isXP && pickupSheet) {
        const frameIndex = PICKUP_FRAMES[p.type];
        if (frameIndex !== undefined) {
          if (drawingShapes) {
            shapeBatch.flush();
            drawingShapes = false;
          }
          drawSprite(spriteBatch, pickupSheet, frameIndex, s.x, s.y, PICKUP_SCALE, false);
          continue;
        }
      }

      if (isXP) {
        const color = getXPOrbColor(p.value);
        const size = getXPOrbSize(p.value);
        if (!drawingShapes) {
          spriteBatch.flush();
          drawingShapes = true;
        }
        shapeBatch.drawDiamond(s.x, s.y, size, color);
        if (p.value >= 5) {
          shapeBatch.drawDiamond(s.x, s.y, size + 2, color, 0.2);
        }
      } else {
        // Vector fallback for non-XP pickups
        if (!drawingShapes) {
          spriteBatch.flush();
          drawingShapes = true;
        }
        switch (p.type) {
          case 'coin':
            shapeBatch.drawCircle(s.x, s.y, 5, '#ffd700');
            shapeBatch.drawRing(s.x, s.y, 5, 1, '#b8960f');
            break;
          case 'food':
            shapeBatch.drawRect(s.x - 2, s.y - 6, 4, 12, '#ff3333');
            shapeBatch.drawRect(s.x - 6, s.y - 2, 12, 4, '#ff3333');
            break;
          case 'magnet':
            shapeBatch.drawDiamond(s.x, s.y, 6, '#ff6600');
            break;
          case 'vacuum':
            shapeBatch.drawDiamond(s.x, s.y, 7, '#cc00ff');
            break;
          case 'rosary':
            shapeBatch.drawDiamond(s.x, s.y, 7, '#ffffff');
            break;
          case 'chest':
            shapeBatch.drawRect(s.x - 8, s.y - 6, 16, 12, '#c8a23c');
            shapeBatch.drawRect(s.x - 2, s.y - 2, 4, 4, '#8b6914');
            break;
          case 'clock':
            shapeBatch.drawCircle(s.x, s.y, 6, '#66ccff');
            shapeBatch.drawRing(s.x, s.y, 6, 1.5, '#3399cc');
            break;
          case 'shield_orb':
            shapeBatch.drawCircle(s.x, s.y, 6, '#66aaff');
            shapeBatch.drawRing(s.x, s.y, 6, 2, '#88ccff');
            shapeBatch.drawCircle(s.x - 1, s.y - 2, 2, 'rgba(255,255,255,0.4)');
            break;
          case 'bomb':
            shapeBatch.drawCircle(s.x, s.y + 1, 6, '#333333');
            shapeBatch.drawRing(s.x, s.y + 1, 6, 1.5, '#ff4444');
            shapeBatch.drawCircle(s.x + 4, s.y - 8, 2, '#ffaa00');
            break;
        }
      }
    }

    if (drawingShapes) {
      shapeBatch.flush();
      drawingShapes = false;
    }
  }
}

// ---- Auras ------------------------------------------------------------------

function renderAuras(
  shapeBatch: ShapeBatch,
  auras: AuraEffect[],
  camera: Camera,
): void {
  if (auras.length === 0) return;

  for (const a of auras) {
    if (!isVisible(camera, a.x, a.y, a.radius)) continue;
    const s = worldToScreen(camera, a.x, a.y);
    shapeBatch.drawCircle(s.x, s.y, a.radius, '#8844ff', 0.15);
    shapeBatch.drawRing(s.x, s.y, a.radius, 2, '#aa66ff', 0.3);
  }
}

// ---- Melee hitboxes ---------------------------------------------------------

function renderMeleeHitboxes(
  shapeBatch: ShapeBatch,
  hitboxes: MeleeHitbox[],
  camera: Camera,
): void {
  for (const h of hitboxes) {
    if (!isVisible(camera, h.x, h.y, h.radius)) continue;
    const s = worldToScreen(camera, h.x, h.y);

    const progress = 1 - h.lifetime / (h.maxLifetime || 0.2);
    const fadeOut = Math.max(0, 1 - progress * 1.5);

    if (h.arc >= Math.PI * 1.9) {
      // Full 360° cleave: expanding ring
      const ringRadius = h.radius * (0.3 + 0.7 * progress);
      const ringWidth = h.radius * 0.15 * fadeOut;
      shapeBatch.drawRing(s.x, s.y, ringRadius, ringWidth, '#ffffff', 0.4 * fadeOut);
      shapeBatch.drawCircle(s.x, s.y, ringRadius, '#ffffff', 0.15 * fadeOut);
    } else {
      // Directional slash: animated arc sweep
      const sweepProgress = Math.min(1, progress * 2);
      const startAngle = h.angle - h.arc / 2;
      const sweepArc = h.arc * sweepProgress;

      const innerR = h.radius * 0.4;
      const outerR = h.radius * (0.6 + 0.4 * sweepProgress);
      const trailWidth = (outerR - innerR) * fadeOut;

      // Main slash arc
      shapeBatch.drawArc(s.x, s.y, (innerR + outerR) / 2 - trailWidth / 2, (innerR + outerR) / 2 + trailWidth / 2, startAngle, startAngle + sweepArc, '#ffffff', 0.6 * fadeOut);
      // Glow behind
      shapeBatch.drawArc(s.x, s.y, (innerR + outerR) / 2 - trailWidth, (innerR + outerR) / 2 + trailWidth, startAngle, startAngle + sweepArc, '#aaccff', 0.2 * fadeOut);

      // Leading edge spark
      if (sweepProgress < 0.9) {
        const edgeAngle = startAngle + sweepArc;
        const edgeX = s.x + Math.cos(edgeAngle) * outerR;
        const edgeY = s.y + Math.sin(edgeAngle) * outerR;
        shapeBatch.drawCircle(edgeX, edgeY, 3, '#ffffff', 0.8 * fadeOut);
      }
    }
  }
}

// ---- Enemies ----------------------------------------------------------------

function renderEnemies(
  renderer: WebGLRenderer,
  enemies: EnemyEntity[],
  camera: Camera,
): void {
  const { spriteBatch, shapeBatch, overlayCtx } = renderer;
  let drawingShapes = false;

  // Pass 1: body/corpse rendering
  for (const e of enemies) {
    if (!isVisible(camera, e.x, e.y, e.radius + 20)) continue;
    const s = worldToScreen(camera, e.x, e.y);

    if (e.isDead) {
      const isBoss = e.isBoss && e.bossId;
      const sprites = isBoss ? getBossSprites(e.bossId!) : getEnemySprites(e.defId);
      const scale = isBoss ? getBossScale(e.radius) : getEnemyScale(e.radius);
      const alpha = Math.min(1, e.corpseTimer * 1.5);

      if (sprites && e.animState) {
        if (drawingShapes) {
          shapeBatch.flush();
          drawingShapes = false;
        }
        const flipEnemy = e.animState.animation === sprites.walkSide && e.lastMoveVx < 0;
        const frameIndex = getCurrentFrameIndex(e.animState);
        drawSpriteCorpse(spriteBatch, e.animState.animation.sheet, frameIndex, s.x, s.y, scale, alpha, flipEnemy);
      } else {
        if (!drawingShapes) {
          spriteBatch.flush();
          drawingShapes = true;
        }
        shapeBatch.drawCircle(s.x, s.y, e.radius, '#666666', alpha * 0.5);
      }
      continue;
    }

    // Intangible enemies: use alpha < 1 in tint
    const entityAlpha = e.intangible ? e.opacity : 1;
    const isFlashing = e.flashTimer > 0;

    // Try sprite rendering
    const isBoss = e.isBoss && e.bossId;
    const sprites = isBoss ? getBossSprites(e.bossId!) : getEnemySprites(e.defId);
    const scale = isBoss ? getBossScale(e.radius) : getEnemyScale(e.radius);

    if (sprites && e.animState) {
      if (drawingShapes) {
        shapeBatch.flush();
        drawingShapes = false;
      }
      const flipEnemy = e.animState.animation === sprites.walkSide && e.lastMoveVx < 0;
      const frameIndex = getCurrentFrameIndex(e.animState);

      if (isFlashing) {
        drawSpriteFlash(spriteBatch, e.animState.animation.sheet, frameIndex, s.x, s.y, scale, flipEnemy);
      } else {
        // Draw with entityAlpha for intangible enemies
        if (entityAlpha < 1) {
          const tex = e.animState.animation.sheet.glTexture;
          if (tex) {
            const { sx, sy, sw, sh } = getFrameRect(e.animState.animation.sheet, frameIndex);
            const dw = sw * scale;
            const dh = sh * scale;
            const dx = Math.round(s.x - dw / 2);
            const dy = Math.round(s.y - dh / 2);
            const img = e.animState.animation.sheet.image;
            spriteBatch.drawQuad(
              tex,
              sx, sy, sw, sh,
              img.naturalWidth, img.naturalHeight,
              dx, dy, dw, dh,
              1, 1, 1, entityAlpha,
              flipEnemy,
            );
          }
        } else {
          drawSprite(spriteBatch, e.animState.animation.sheet, frameIndex, s.x, s.y, scale, flipEnemy);
        }
      }
    } else {
      // Vector fallback
      if (!drawingShapes) {
        spriteBatch.flush();
        drawingShapes = true;
      }
      const baseColor = isFlashing ? '#ffffff' : getEnemyColor(e);
      const shape = getEnemyShape(e);

      switch (shape) {
        case 'circle':
          shapeBatch.drawCircle(s.x, s.y, e.radius, baseColor, entityAlpha);
          break;
        case 'square':
          shapeBatch.drawRect(s.x - e.radius, s.y - e.radius, e.radius * 2, e.radius * 2, baseColor, entityAlpha);
          break;
        case 'triangle':
          shapeBatch.drawPolygon(s.x, s.y, e.radius, 3, -Math.PI / 2, baseColor, entityAlpha);
          break;
        case 'diamond':
          shapeBatch.drawPolygon(s.x, s.y, e.radius, 4, Math.PI / 4, baseColor, entityAlpha);
          break;
        case 'pentagon':
          shapeBatch.drawPolygon(s.x, s.y, e.radius, 5, -Math.PI / 2, baseColor, entityAlpha);
          break;
        case 'hexagon':
          shapeBatch.drawPolygon(s.x, s.y, e.radius, 6, -Math.PI / 2, baseColor, entityAlpha);
          break;
        case 'star':
          shapeBatch.drawStar(s.x, s.y, e.radius, baseColor, entityAlpha);
          break;
        default:
          shapeBatch.drawCircle(s.x, s.y, e.radius, baseColor, entityAlpha);
      }

      // Boss ring (vector fallback only)
      if (e.isBoss) {
        shapeBatch.drawRing(s.x, s.y, e.radius + 4, 2, '#ff0000', entityAlpha);
      }
    }

    // Armor indicator — 2D overlay text
    if (e.armor > 0) {
      overlayCtx.fillStyle = '#aaaacc';
      overlayCtx.font = '10px monospace';
      overlayCtx.textAlign = 'center';
      overlayCtx.fillText(`[${e.armor}]`, s.x, s.y + e.radius + 12);
    }
  }

  if (drawingShapes) {
    shapeBatch.flush();
  }

  // Pass 2: status tints + HP bars (all batched in shape pass)
  let hasOverlayShapes = false;
  for (const e of enemies) {
    if (e.isDead) continue;
    if (!isVisible(camera, e.x, e.y, e.radius + 20)) continue;
    if (e.statusEffects.length === 0 && e.hp >= e.maxHp) continue;

    if (!hasOverlayShapes) {
      spriteBatch.flush();
      hasOverlayShapes = true;
    }

    const s = worldToScreen(camera, e.x, e.y);

    if (e.statusEffects.length > 0) {
      for (const se of e.statusEffects) {
        const tint = STATUS_TINT[se.type];
        if (tint) {
          shapeBatch.drawCircle(s.x, s.y, e.radius + 1, tint);
        }
      }
    }

    if (e.hp < e.maxHp) {
      const barW = e.radius * 2.5;
      const barH = 3;
      const barX = s.x - barW / 2;
      const barY = s.y - e.radius - 8;
      const hpFrac = Math.max(0, e.hp / e.maxHp);

      shapeBatch.drawRect(barX, barY, barW, barH, 'rgba(0,0,0,0.6)');
      const hpColor = hpFrac > 0.5 ? '#44ff44' : hpFrac > 0.25 ? '#ffaa00' : '#ff3333';
      shapeBatch.drawRect(barX, barY, barW * hpFrac, barH, hpColor);
    }
  }

  if (hasOverlayShapes) {
    shapeBatch.flush();
  }
}

function getEnemyColor(e: EnemyEntity): string {
  return ENEMY_COLOR_MAP.get(e.defId) || (e.isBoss ? '#dd2222' : '#cc4444');
}

function getEnemyShape(e: EnemyEntity): string {
  return ENEMY_SHAPE_MAP.get(e.defId) || (e.isBoss ? 'star' : 'circle');
}

// ---- Projectiles ------------------------------------------------------------

function renderProjectiles(
  renderer: WebGLRenderer,
  projectiles: ProjectileEntity[],
  camera: Camera,
): void {
  const { spriteBatch, shapeBatch } = renderer;
  const projSheet = getProjectileSheet();

  if (projSheet) {
    // Pass 1: draw glow behind all projectiles in one shape batch.
    let drewGlow = false;
    for (const p of projectiles) {
      if (p.isPool) continue;
      if (!isVisible(camera, p.x, p.y, p.radius + 5)) continue;
      const s = worldToScreen(camera, p.x, p.y);

      if (!drewGlow) {
        spriteBatch.flush();
        drewGlow = true;
      }

      const glowColor = p.isEnemy
        ? 'rgba(255,50,50,0.25)'
        : (p.color ? p.color + '40' : 'rgba(255,204,0,0.25)');
      shapeBatch.drawCircle(s.x, s.y, p.radius + 3, glowColor);
    }
    if (drewGlow) {
      shapeBatch.flush();
    }

    // Pass 2: draw all projectile sprites.
    for (const p of projectiles) {
      if (p.isPool) continue;
      if (!isVisible(camera, p.x, p.y, p.radius + 5)) continue;
      const s = worldToScreen(camera, p.x, p.y);
      const frameIndex = p.isEnemy ? 1 : 0;
      const scale = getProjectileScale(p.radius);
      drawSprite(spriteBatch, projSheet, frameIndex, s.x, s.y, scale, false);
    }
    return;
  }

  // Vector fallback path (no projectile sheet loaded).
  let drewVector = false;
  for (const p of projectiles) {
    if (p.isPool) continue;
    if (!isVisible(camera, p.x, p.y, p.radius + 5)) continue;
    const s = worldToScreen(camera, p.x, p.y);

    if (!drewVector) {
      spriteBatch.flush();
      drewVector = true;
    }

    const color = p.isEnemy ? '#cc3333' : (p.color || '#ffcc00');
    shapeBatch.drawCircle(s.x, s.y, Math.max(p.radius, 2), color);
    const glowColor = p.isEnemy ? 'rgba(255,50,50,0.3)' : (p.color ? p.color + '4D' : 'rgba(255,204,0,0.3)');
    shapeBatch.drawRing(s.x, s.y, p.radius + 2, 2, glowColor);
  }
  if (drewVector) {
    shapeBatch.flush();
  }
}

// ---- Pools ------------------------------------------------------------------

function renderPools(
  shapeBatch: ShapeBatch,
  projectiles: ProjectileEntity[],
  camera: Camera,
): void {
  for (const p of projectiles) {
    if (!p.isPool) continue;
    const radius = p.poolRadius || p.radius;
    if (!isVisible(camera, p.x, p.y, radius)) continue;
    const s = worldToScreen(camera, p.x, p.y);
    const color = p.color || '#44ff44';
    const pulse = 0.97 + 0.03 * Math.sin((p.poolTimer ?? 0) * 3);
    const r = radius * pulse;

    // Approximate radial gradient with concentric circles
    shapeBatch.drawCircle(s.x, s.y, r, color, 0.13);
    shapeBatch.drawCircle(s.x, s.y, r * 0.5, color, 0.27);
    shapeBatch.drawCircle(s.x, s.y, r * 0.2, color, 0.4);

    // Concentric ring
    shapeBatch.drawRing(s.x, s.y, r, 2, color, 0.5);
    // Inner ring
    shapeBatch.drawRing(s.x, s.y, r * 0.5, 1, color, 0.3);
  }
}

// ---- Player -----------------------------------------------------------------

function renderPlayer(
  renderer: WebGLRenderer,
  world: GameWorld,
  camera: Camera,
): void {
  const { spriteBatch, shapeBatch } = renderer;
  const pl = world.player;
  const target = worldToScreen(camera, pl.x, pl.y);
  const s = getSmoothedLocalPlayerScreenPosition(pl, target.x, target.y);

  // Invincibility flash — modulate alpha
  let playerAlpha = 1;
  if (pl.iFrames > 0) {
    playerAlpha = 0.5 + 0.3 * Math.sin(pl.iFrames * 20);
  }

  // Shield aura
  if (pl.shieldHp > 0) {
    spriteBatch.flush();
    shapeBatch.drawRing(s.x, s.y, pl.radius + 6, 2, 'rgba(100,180,255,0.5)');
    shapeBatch.flush();
  }

  // Try sprite rendering
  const sprites = getPlayerSprites(world.classId);
  if (sprites && pl.animState) {
    const flipX = pl.animState.animation === sprites.walkSide && pl.facingX < 0;
    if (playerAlpha < 1) {
      // Draw with custom alpha
      const frameIndex = getCurrentFrameIndex(pl.animState);
      const tex = pl.animState.animation.sheet.glTexture;
      if (tex) {
        const { sx, sy, sw, sh } = getFrameRect(pl.animState.animation.sheet, frameIndex);
        const dw = sw * PLAYER_SCALE;
        const dh = sh * PLAYER_SCALE;
        const dx = Math.round(s.x - dw / 2);
        const dy = Math.round(s.y - dh / 2);
        const img = pl.animState.animation.sheet.image;
        spriteBatch.drawQuad(
          tex, sx, sy, sw, sh,
          img.naturalWidth, img.naturalHeight,
          dx, dy, dw, dh,
          1, 1, 1, playerAlpha,
          flipX,
        );
      }
    } else {
      drawAnimatedSprite(spriteBatch, pl.animState, s.x, s.y, PLAYER_SCALE, flipX);
    }
  } else {
    // Vector fallback
    spriteBatch.flush();
    shapeBatch.drawCircle(s.x, s.y, pl.radius, '#44aaff', playerAlpha);
    shapeBatch.drawCircle(s.x - 2, s.y - 2, pl.radius * 0.5, 'rgba(255,255,255,0.2)', playerAlpha);

    // Directional indicator
    const facingAngle = Math.atan2(pl.facingY, pl.facingX);
    const tipDist = pl.radius + 6;
    const tipX = s.x + Math.cos(facingAngle) * tipDist;
    const tipY = s.y + Math.sin(facingAngle) * tipDist;
    const baseOffset = Math.PI * 0.85;
    const baseR = pl.radius * 0.5;

    // Triangle indicator — use 3 vertices
    shapeBatch.drawPolygon(
      (tipX + s.x + Math.cos(facingAngle + baseOffset) * baseR + s.x + Math.cos(facingAngle - baseOffset) * baseR) / 3,
      (tipY + s.y + Math.sin(facingAngle + baseOffset) * baseR + s.y + Math.sin(facingAngle - baseOffset) * baseR) / 3,
      pl.radius * 0.5, 3, facingAngle - Math.PI / 2,
      '#88ccff', playerAlpha,
    );
    shapeBatch.flush();
  }

  // Health bar under player
  if (pl.hp < pl.maxHp) {
    spriteBatch.flush();
    const barWidth = 28;
    const barHeight = 3;
    const barY = s.y + pl.radius + 6;
    const hpPercent = Math.max(0, pl.hp / pl.maxHp);

    shapeBatch.drawRect(s.x - barWidth / 2, barY, barWidth, barHeight, 'rgba(0,0,0,0.6)');
    const color = hpPercent > 0.5 ? '#44ff44' : hpPercent > 0.25 ? '#ffaa00' : '#ff3333';
    shapeBatch.drawRect(s.x - barWidth / 2, barY, barWidth * hpPercent, barHeight, color);
    shapeBatch.flush();
  }
}

// ---- Summons ----------------------------------------------------------------

function renderSummons(
  renderer: WebGLRenderer,
  summons: SummonEntity[],
  camera: Camera,
): void {
  const { spriteBatch, shapeBatch } = renderer;
  const summonSpriteSet = getSummonSprites();
  let drawingShapes = false;

  // Pass 1: summon bodies
  for (const sm of summons) {
    if (!isVisible(camera, sm.x, sm.y, sm.radius + 10)) continue;
    const screen = worldToScreen(camera, sm.x, sm.y);

    if (summonSpriteSet && sm.animState) {
      if (drawingShapes) {
        shapeBatch.flush();
        drawingShapes = false;
      }
      drawAnimatedSprite(spriteBatch, sm.animState, screen.x, screen.y, SUMMON_SCALE, false);
    } else {
      // Vector fallback — triangle shape
      if (!drawingShapes) {
        spriteBatch.flush();
        drawingShapes = true;
      }
      shapeBatch.drawPolygon(screen.x, screen.y, sm.radius, 3, -Math.PI / 2, '#bbccaa');
      shapeBatch.drawRing(screen.x, screen.y, sm.radius, 1, '#889977');
    }
  }

  if (drawingShapes) {
    shapeBatch.flush();
  }

  // Pass 2: summon HP bars
  let drewBars = false;
  for (const sm of summons) {
    if (sm.hp >= sm.maxHp) continue;
    if (!isVisible(camera, sm.x, sm.y, sm.radius + 10)) continue;
    const screen = worldToScreen(camera, sm.x, sm.y);

    if (!drewBars) {
      spriteBatch.flush();
      drewBars = true;
    }

    const barW = sm.radius * 2;
    const barH = 2;
    const barX = screen.x - barW / 2;
    const barY = screen.y - sm.radius - 6;
    const hpFrac = Math.max(0, sm.hp / sm.maxHp);
    shapeBatch.drawRect(barX, barY, barW, barH, 'rgba(0,0,0,0.5)');
    shapeBatch.drawRect(barX, barY, barW * hpFrac, barH, '#88cc88');
  }
  if (drewBars) {
    shapeBatch.flush();
  }
}

// ---- Particles --------------------------------------------------------------

function renderParticles(
  renderer: WebGLRenderer,
  particles: ParticleEntity[],
  camera: Camera,
): void {
  const { shapeBatch, overlayCtx } = renderer;

  for (const p of particles) {
    if (!isVisible(camera, p.x, p.y, 50)) continue;
    const s = worldToScreen(camera, p.x, p.y);
    const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));

    if (p.text) {
      // Text particles go on the 2D overlay
      const size = p.fontSize || 14;
      overlayCtx.save();
      overlayCtx.globalAlpha = alpha;
      overlayCtx.font = `bold ${size}px monospace`;
      overlayCtx.textAlign = 'center';
      overlayCtx.textBaseline = 'middle';
      overlayCtx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      overlayCtx.lineWidth = 3;
      overlayCtx.strokeText(p.text, s.x, s.y);
      overlayCtx.fillStyle = p.color;
      overlayCtx.fillText(p.text, s.x, s.y);
      overlayCtx.restore();
    } else {
      shapeBatch.drawCircle(s.x, s.y, p.radius * alpha, p.color, alpha);
    }
  }
}

// ---- Boss warning arrows (2D overlay) ---------------------------------------

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

// ---- Minimap (2D overlay) ---------------------------------------------------

const MINIMAP_SIZE = 200;
const MINIMAP_RANGE = 2000;

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
