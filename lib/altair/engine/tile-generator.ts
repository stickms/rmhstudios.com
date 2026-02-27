// =============================================================================
// ALTAIR ENGINE -- Tile Generator
// =============================================================================
// Infinite scrolling procedural tile and destructible prop generation.
// Uses a simple hash-based approach for deterministic per-cell content.
// =============================================================================

import { Camera } from './types';
import { worldToScreen } from './camera';
import { getTileSheet, getPropSheet, TILE_FRAMES, ALL_TILE_FRAMES, PROP_FRAMES, PROP_DAMAGED_FRAMES, PROP_SCALE } from './sprites/sprite-defs';
import { drawTileSprite, drawSprite } from './sprites/sprite-renderer';

// ---- Types ------------------------------------------------------------------

interface Tile {
  x: number; // world grid x (in tile coords, not pixels)
  y: number; // world grid y
  type: 'dark_grass' | 'cracked_stone' | 'graveyard_path';
  variant: number; // 0-3 for visual variety
}

export interface DestructibleProp {
  id: number;
  x: number;  // world pixel position (center)
  y: number;
  halfW: number;  // AABB half-width (pixels)
  halfH: number;  // AABB half-height (pixels)
  radius: number; // bounding circle for spatial hash broad-phase
  type: 'tombstone' | 'barrel' | 'urn';
  hp: number;
  destroyed: boolean;
}

/** Per-prop-type collision dimensions (at 2x render scale). */
const PROP_HITBOX: Record<DestructibleProp['type'], { halfW: number; halfH: number }> = {
  tombstone: { halfW: 7, halfH: 13 },  // tall, narrow
  barrel:    { halfW: 11, halfH: 11 },  // roughly square
  urn:       { halfW: 7, halfH: 9 },    // small vase
};

/**
 * Visual offset — props are rendered 8px above their logical position.
 * Collision uses (prop.x, prop.y + PROP_COLLISION_OFFSET_Y) as center.
 */
export const PROP_COLLISION_OFFSET_Y = -8;

// ---- Deterministic hash for tile generation ---------------------------------

function hashCoord(x: number, y: number): number {
  // Simple but effective integer hash
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return h >>> 0; // unsigned
}

// ---- Tile colors ------------------------------------------------------------

const TILE_COLORS: Record<Tile['type'], string[]> = {
  dark_grass: ['#1a2e1a', '#1e331e', '#162b16', '#1b301b'],
  cracked_stone: ['#3a3a3a', '#333333', '#404040', '#373737'],
  graveyard_path: ['#2a2520', '#2e2822', '#26211c', '#2c2620'],
};

// ---- Prop colors & shapes ---------------------------------------------------

const PROP_COLORS: Record<DestructibleProp['type'], string> = {
  tombstone: '#666677',
  barrel: '#6b4e2a',
  urn: '#8b7355',
};

// ---- Constants --------------------------------------------------------------

const TILE_SIZE = 64;
const GENERATION_MARGIN = 3; // extra tiles beyond visible area
const CLEANUP_MARGIN = 8; // remove tiles further than this from visible area
const PROP_CHANCE = 0.04; // 4% of tiles get a prop

// =============================================================================

export class TileGenerator {
  private tiles: Map<string, Tile>;
  private props: DestructibleProp[];
  private propsMap: Map<string, DestructibleProp>; // keyed by tile coord for quick lookup
  private tileSize: number;
  private nextPropId: number;

  constructor() {
    this.tiles = new Map();
    this.props = [];
    this.propsMap = new Map();
    this.tileSize = TILE_SIZE;
    this.nextPropId = 1;
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Generate tiles around the current camera position and prune distant ones.
   */
  update(camera: Camera): void {
    const halfW = camera.width / 2;
    const halfH = camera.height / 2;

    // Determine visible tile range (with margin)
    const minTX = Math.floor((camera.x - halfW) / this.tileSize) - GENERATION_MARGIN;
    const maxTX = Math.ceil((camera.x + halfW) / this.tileSize) + GENERATION_MARGIN;
    const minTY = Math.floor((camera.y - halfH) / this.tileSize) - GENERATION_MARGIN;
    const maxTY = Math.ceil((camera.y + halfH) / this.tileSize) + GENERATION_MARGIN;

    // Generate missing tiles
    for (let tx = minTX; tx <= maxTX; tx++) {
      for (let ty = minTY; ty <= maxTY; ty++) {
        const key = `${tx},${ty}`;
        if (!this.tiles.has(key)) {
          this.generateTile(tx, ty, key);
        }
      }
    }

    // Prune distant tiles
    const cleanMinTX = minTX - CLEANUP_MARGIN;
    const cleanMaxTX = maxTX + CLEANUP_MARGIN;
    const cleanMinTY = minTY - CLEANUP_MARGIN;
    const cleanMaxTY = maxTY + CLEANUP_MARGIN;

    for (const [key, tile] of this.tiles) {
      if (
        tile.x < cleanMinTX ||
        tile.x > cleanMaxTX ||
        tile.y < cleanMinTY ||
        tile.y > cleanMaxTY
      ) {
        this.tiles.delete(key);
        // Also remove any prop at this tile
        if (this.propsMap.has(key)) {
          const prop = this.propsMap.get(key)!;
          this.propsMap.delete(key);
          const idx = this.props.indexOf(prop);
          if (idx !== -1) this.props.splice(idx, 1);
        }
      }
    }
  }

  /**
   * Get all tiles visible on screen for rendering.
   */
  getVisibleTiles(camera: Camera): Tile[] {
    const halfW = camera.width / 2;
    const halfH = camera.height / 2;
    const minTX = Math.floor((camera.x - halfW) / this.tileSize) - 1;
    const maxTX = Math.ceil((camera.x + halfW) / this.tileSize) + 1;
    const minTY = Math.floor((camera.y - halfH) / this.tileSize) - 1;
    const maxTY = Math.ceil((camera.y + halfH) / this.tileSize) + 1;

    const visible: Tile[] = [];
    for (let tx = minTX; tx <= maxTX; tx++) {
      for (let ty = minTY; ty <= maxTY; ty++) {
        const tile = this.tiles.get(`${tx},${ty}`);
        if (tile) visible.push(tile);
      }
    }
    return visible;
  }

  /**
   * Get all non-destroyed collidable props (excludes urns).
   */
  getProps(): DestructibleProp[] {
    return this.props.filter((p) => !p.destroyed && p.type !== 'urn');
  }

  /**
   * Get all non-destroyed urn props (non-collidable walkover pickups).
   */
  getUrns(): DestructibleProp[] {
    return this.props.filter((p) => !p.destroyed && p.type === 'urn');
  }

  /**
   * Damage a prop by id. Returns true if the prop was destroyed.
   */
  damageProp(propId: number, damage: number): boolean {
    for (const prop of this.props) {
      if (prop.id === propId && !prop.destroyed) {
        prop.hp -= damage;
        if (prop.hp <= 0) {
          prop.destroyed = true;
          return true;
        }
        return false;
      }
    }
    return false;
  }

  /**
   * Render visible tiles to the canvas.
   */
  renderTiles(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const tiles = this.getVisibleTiles(camera);
    const sheet = getTileSheet();

    for (const tile of tiles) {
      const worldX = tile.x * this.tileSize;
      const worldY = tile.y * this.tileSize;
      const screen = worldToScreen(camera, worldX, worldY);

      // Try sprite tile
      if (sheet) {
        const frames = TILE_FRAMES[tile.type];
        if (frames) {
          const tileIndex = frames[tile.variant] ?? frames[0];
          drawTileSprite(ctx, sheet, tileIndex, screen.x, screen.y, this.tileSize);
          continue;
        }
      }

      // Vector fallback
      const colors = TILE_COLORS[tile.type];
      ctx.fillStyle = colors[tile.variant];
      ctx.fillRect(screen.x, screen.y, this.tileSize, this.tileSize);

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(screen.x, screen.y, this.tileSize, this.tileSize);
    }
  }

  /**
   * Render visible props to the canvas.
   */
  renderProps(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const halfW = camera.width / 2 + 64;
    const halfH = camera.height / 2 + 64;
    const sheet = getPropSheet();

    for (const prop of this.props) {
      if (prop.destroyed) continue;

      const dx = prop.x - camera.x;
      const dy = prop.y - camera.y;
      if (Math.abs(dx) > halfW || Math.abs(dy) > halfH) continue;

      const screen = worldToScreen(camera, prop.x, prop.y);

      // Try sprite rendering
      if (sheet) {
        const isDamaged = prop.hp < 3;
        const frameIndex = isDamaged
          ? (PROP_DAMAGED_FRAMES[prop.type] ?? PROP_FRAMES[prop.type] ?? 0)
          : (PROP_FRAMES[prop.type] ?? 0);
        drawSprite(ctx, sheet, frameIndex, screen.x, screen.y - 8, PROP_SCALE, false);
        continue;
      }

      // Vector fallback
      const color = PROP_COLORS[prop.type];

      ctx.save();
      ctx.translate(screen.x, screen.y);

      switch (prop.type) {
        case 'tombstone':
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(-8, 0);
          ctx.lineTo(-8, -20);
          ctx.arc(0, -20, 8, Math.PI, 0);
          ctx.lineTo(8, 0);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#555566';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.strokeStyle = '#888899';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, -18);
          ctx.lineTo(0, -8);
          ctx.moveTo(-4, -14);
          ctx.lineTo(4, -14);
          ctx.stroke();
          break;

        case 'barrel':
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.ellipse(0, -6, 10, 12, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#4a3518';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.strokeStyle = '#8b7355';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(-10, -10);
          ctx.lineTo(10, -10);
          ctx.moveTo(-10, -2);
          ctx.lineTo(10, -2);
          ctx.stroke();
          break;

        case 'urn':
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(-5, 0);
          ctx.quadraticCurveTo(-8, -8, -4, -14);
          ctx.lineTo(4, -14);
          ctx.quadraticCurveTo(8, -8, 5, 0);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#6b5535';
          ctx.lineWidth = 1;
          ctx.stroke();
          break;
      }

      if (prop.hp < 3) {
        const alpha = 0.4 + 0.2 * (3 - prop.hp);
        ctx.strokeStyle = `rgba(255,100,100,${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-3, -5);
        ctx.lineTo(2, -12);
        ctx.lineTo(-1, -18);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private generateTile(tx: number, ty: number, key: string): void {
    const h = hashCoord(tx, ty);

    // Pick a random tile frame from all valid frames (excludes obstacle-looking tiles)
    const frameIdx = ALL_TILE_FRAMES[h % ALL_TILE_FRAMES.length];

    // Determine which tile type this frame belongs to and its variant index
    let type: Tile['type'] = 'dark_grass';
    let variant = 0;
    for (const [tileType, frames] of Object.entries(TILE_FRAMES)) {
      const idx = frames.indexOf(frameIdx);
      if (idx !== -1) {
        type = tileType as Tile['type'];
        variant = idx;
        break;
      }
    }

    const tile: Tile = { x: tx, y: ty, type, variant };
    this.tiles.set(key, tile);

    // Possibly generate a destructible prop on this tile
    // Skip props near spawn origin (within 2 tiles) so player doesn't start blocked
    const nearSpawn = Math.abs(tx) <= 2 && Math.abs(ty) <= 2;
    const propRoll = ((h >> 16) % 1000) / 1000;
    if (!nearSpawn && propRoll < PROP_CHANCE && !this.propsMap.has(key)) {
      // Urns are rarer: ~10% of props are urns, 45% tombstone, 45% barrel
      const propTypeRoll = (h >> 20) % 20;
      const propType: DestructibleProp['type'] =
        propTypeRoll < 9 ? 'tombstone' : propTypeRoll < 18 ? 'barrel' : 'urn';

      // Place prop at center of tile with small random offset
      const offsetX = ((h >> 12) % 20) - 10;
      const offsetY = ((h >> 14) % 20) - 10;

      const hitbox = PROP_HITBOX[propType];
      const prop: DestructibleProp = {
        id: this.nextPropId++,
        x: tx * this.tileSize + this.tileSize / 2 + offsetX,
        y: ty * this.tileSize + this.tileSize / 2 + offsetY,
        halfW: hitbox.halfW,
        halfH: hitbox.halfH,
        radius: Math.max(hitbox.halfW, hitbox.halfH), // bounding circle for spatial hash
        type: propType,
        hp: 3,
        destroyed: false,
      };

      this.props.push(prop);
      this.propsMap.set(key, prop);
    }
  }
}
