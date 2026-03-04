// =============================================================================
// ALTAIR ENGINE -- Tile Generator
// =============================================================================
// Infinite scrolling procedural tile and destructible prop generation.
// Uses a simple hash-based approach for deterministic per-cell content.
// Includes zone-based structure generation (fenced enclosures, buildings,
// hedge mazes, graveyards, barrel forts).
// =============================================================================

import { Camera } from './types';
import { worldToScreen } from './camera';
import { getTileSheet, getPropSheet, getStructurePropSheet, TILE_FRAMES, ALL_TILE_FRAMES, PROP_FRAMES, PROP_DAMAGED_FRAMES, STRUCTURE_PROP_FRAMES, STRUCTURE_PROP_DAMAGED_FRAMES, PROP_SCALE } from './sprites/sprite-defs';
import { drawTileSprite, drawSprite } from './sprites/sprite-renderer';

// ---- Types ------------------------------------------------------------------

interface Tile {
  x: number; // world grid x (in tile coords, not pixels)
  y: number; // world grid y
  type: 'dark_grass' | 'cracked_stone' | 'graveyard_path';
  variant: number; // 0-3 for visual variety
}

export type PropType =
  | 'tombstone' | 'barrel' | 'urn'
  | 'fence_h' | 'fence_v' | 'fence_post'
  | 'wall' | 'wall_v'
  | 'hedge' | 'crate' | 'well';

export interface DestructibleProp {
  id: number;
  x: number;  // world pixel position (center)
  y: number;
  halfW: number;  // AABB half-width (pixels)
  halfH: number;  // AABB half-height (pixels)
  radius: number; // bounding circle for spatial hash broad-phase
  type: PropType;
  hp: number;
  destroyed: boolean;
}

/** Per-prop-type collision dimensions (at 2x render scale). Slightly smaller
 *  than visual size for forgiving gameplay feel. */
const PROP_HITBOX: Record<PropType, { halfW: number; halfH: number }> = {
  tombstone:  { halfW: 5,  halfH: 10 },
  barrel:     { halfW: 9,  halfH: 9 },
  urn:        { halfW: 5,  halfH: 7 },
  fence_h:    { halfW: 24, halfH: 4 },
  fence_v:    { halfW: 4,  halfH: 24 },
  fence_post: { halfW: 6,  halfH: 6 },
  wall:       { halfW: 24, halfH: 10 },
  wall_v:     { halfW: 10, halfH: 24 },
  hedge:      { halfW: 20, halfH: 20 },
  crate:      { halfW: 10, halfH: 10 },
  well:       { halfW: 12, halfH: 12 },
};

/** Default HP per prop type. */
const PROP_DEFAULT_HP: Record<PropType, number> = {
  tombstone: 3, barrel: 3, urn: 3,
  fence_h: 5, fence_v: 5, fence_post: 8,
  wall: 12, wall_v: 12,
  hedge: 3, crate: 4, well: 999,
};

/**
 * Visual offset — props are rendered 8px above their logical position.
 * Collision uses (prop.x, prop.y + PROP_COLLISION_OFFSET_Y) as center.
 */
export const PROP_COLLISION_OFFSET_Y = -8;

// ---- Deterministic hash for tile generation ---------------------------------

function hashCoord(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return h >>> 0;
}

// ---- Tile colors ------------------------------------------------------------

const TILE_COLORS: Record<Tile['type'], string[]> = {
  dark_grass: ['#1a2e1a', '#1e331e', '#162b16', '#1b301b'],
  cracked_stone: ['#3a3a3a', '#333333', '#404040', '#373737'],
  graveyard_path: ['#2a2520', '#2e2822', '#26211c', '#2c2620'],
};

// ---- Prop colors & shapes ---------------------------------------------------

const PROP_COLORS: Record<PropType, string> = {
  tombstone:  '#666677',
  barrel:     '#6b4e2a',
  urn:        '#8b7355',
  fence_h:    '#8b6f47',
  fence_v:    '#8b6f47',
  fence_post: '#6b5535',
  wall:       '#5a5a5a',
  wall_v:     '#5a5a5a',
  hedge:      '#2d5a2d',
  crate:      '#7a5c30',
  well:       '#6a6a7a',
};

// ---- Constants --------------------------------------------------------------

const TILE_SIZE = 64;
const GENERATION_MARGIN = 3;
const CLEANUP_MARGIN = 8;
const PROP_CHANCE = 0.04;

// ---- Structure Generation ---------------------------------------------------

const STRUCTURE_ZONE_SIZE = 12; // tiles per zone
const STRUCTURE_CHANCE = 0.25;  // 25% of zones get a structure
const STRUCTURE_SPAWN_EXCLUSION = 1; // only zone (0,0) and immediate neighbors excluded (~768px safe area)

/** Pickup request emitted by structure generation. */
export interface PendingPickup {
  x: number;
  y: number;
  type: string; // matches PickupEntity['type']
  value: number;
}

// ---- Structure Templates ----------------------------------------------------

interface PropPlacement {
  dx: number; // tile offset from structure top-left
  dy: number;
  type: PropType;
}

interface PickupPlacement {
  dx: number;
  dy: number;
  type: string;
  value: number;
}

interface StructureTemplate {
  width: number;
  height: number;
  props: PropPlacement[];
  pickups: PickupPlacement[];
}

function buildFencedEnclosure(): StructureTemplate {
  // 8×6 tile rectangle with fence perimeter, entrance on south side
  const props: PropPlacement[] = [];
  const w = 8, h = 6;

  // Corner posts
  props.push({ dx: 0, dy: 0, type: 'fence_post' });
  props.push({ dx: w - 1, dy: 0, type: 'fence_post' });
  props.push({ dx: 0, dy: h - 1, type: 'fence_post' });
  props.push({ dx: w - 1, dy: h - 1, type: 'fence_post' });

  // Top fence (horizontal)
  for (let x = 1; x < w - 1; x++) props.push({ dx: x, dy: 0, type: 'fence_h' });
  // Bottom fence with gap (entrance at x=3,4)
  for (let x = 1; x < w - 1; x++) {
    if (x === 3 || x === 4) continue; // entrance gap
    props.push({ dx: x, dy: h - 1, type: 'fence_h' });
  }
  // Left fence (vertical)
  for (let y = 1; y < h - 1; y++) props.push({ dx: 0, dy: y, type: 'fence_v' });
  // Right fence (vertical)
  for (let y = 1; y < h - 1; y++) props.push({ dx: w - 1, dy: y, type: 'fence_v' });

  // Interior barrels for flavor
  props.push({ dx: 2, dy: 2, type: 'barrel' });
  props.push({ dx: 5, dy: 3, type: 'crate' });

  return {
    width: w, height: h, props,
    pickups: [
      { dx: 3, dy: 2, type: 'coin', value: 1 },
      { dx: 4, dy: 2, type: 'coin', value: 1 },
      { dx: 3, dy: 3, type: 'food', value: 0 },
      { dx: 5, dy: 2, type: 'xp_medium', value: 5 },
    ],
  };
}

function buildRuinedBuilding(): StructureTemplate {
  // 6×5 tile U-shaped wall structure with doorway
  const props: PropPlacement[] = [];

  // Top wall
  for (let x = 0; x < 6; x++) props.push({ dx: x, dy: 0, type: 'wall' });
  // Left wall (with gap at y=2 for "ruined" feel)
  props.push({ dx: 0, dy: 1, type: 'wall_v' });
  props.push({ dx: 0, dy: 3, type: 'wall_v' });
  // Right wall
  for (let y = 1; y < 4; y++) props.push({ dx: 5, dy: y, type: 'wall_v' });
  // Bottom wall with doorway (gap at x=2,3)
  props.push({ dx: 0, dy: 4, type: 'wall' });
  props.push({ dx: 1, dy: 4, type: 'wall' });
  props.push({ dx: 4, dy: 4, type: 'wall' });
  props.push({ dx: 5, dy: 4, type: 'wall' });

  // Interior props
  props.push({ dx: 1, dy: 2, type: 'barrel' });
  props.push({ dx: 4, dy: 1, type: 'crate' });
  props.push({ dx: 3, dy: 3, type: 'crate' });

  return {
    width: 6, height: 5, props,
    pickups: [
      { dx: 2, dy: 2, type: 'coin', value: 1 },
      { dx: 3, dy: 2, type: 'food', value: 0 },
    ],
  };
}

function buildHedgeMaze(): StructureTemplate {
  // 10×10 tile hedge maze with paths, dead ends, center loot
  // 1 = hedge, 0 = path
  const maze = [
    [1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,1,0,0,0,0,1],
    [1,0,1,0,1,0,1,1,0,1],
    [1,0,1,0,0,0,0,1,0,1],
    [1,0,1,1,1,1,0,1,0,1],
    [1,0,0,0,0,0,0,1,0,1],
    [1,1,1,0,1,1,1,1,0,1],
    [1,0,0,0,1,0,0,0,0,1],
    [1,0,1,0,0,0,1,0,1,1],
    [1,1,1,1,0,1,1,1,1,1],
  ];

  const props: PropPlacement[] = [];
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      if (maze[y][x] === 1) {
        props.push({ dx: x, dy: y, type: 'hedge' });
      }
    }
  }

  return {
    width: 10, height: 10, props,
    pickups: [
      { dx: 4, dy: 5, type: 'chest', value: 0 }, // center loot
      { dx: 7, dy: 1, type: 'coin', value: 1 },   // dead end reward
      { dx: 1, dy: 7, type: 'xp_medium', value: 5 },
    ],
  };
}

function buildGraveyardCluster(): StructureTemplate {
  // 8×6 tile fenced graveyard with tombstone rows
  const props: PropPlacement[] = [];
  const w = 8, h = 6;

  // Fence perimeter with gate at bottom center
  props.push({ dx: 0, dy: 0, type: 'fence_post' });
  props.push({ dx: w - 1, dy: 0, type: 'fence_post' });
  props.push({ dx: 0, dy: h - 1, type: 'fence_post' });
  props.push({ dx: w - 1, dy: h - 1, type: 'fence_post' });

  for (let x = 1; x < w - 1; x++) props.push({ dx: x, dy: 0, type: 'fence_h' });
  for (let x = 1; x < w - 1; x++) {
    if (x === 3 || x === 4) continue; // gate
    props.push({ dx: x, dy: h - 1, type: 'fence_h' });
  }
  for (let y = 1; y < h - 1; y++) props.push({ dx: 0, dy: y, type: 'fence_v' });
  for (let y = 1; y < h - 1; y++) props.push({ dx: w - 1, dy: y, type: 'fence_v' });

  // Tombstone rows (3 rows of 4)
  for (let row = 0; row < 3; row++) {
    const y = 1 + row * 2; // rows at y=1, y=3 (skip y=5 = fence)
    if (y >= h - 1) break;
    for (let col = 0; col < 4; col++) {
      props.push({ dx: 2 + col, dy: y, type: 'urn' });
    }
  }

  return {
    width: w, height: h, props,
    pickups: [
      { dx: 3, dy: 2, type: 'xp_medium', value: 5 },
      { dx: 5, dy: 4, type: 'xp_medium', value: 5 },
    ],
  };
}

function buildBarrelFort(): StructureTemplate {
  // 5×5 tile circular barrel/crate arrangement with gap
  // Ring pattern with opening on south
  const ring: [number, number][] = [
    // top row
    [1,0],[2,0],[3,0],
    // sides
    [0,1],[4,1],
    [0,2],[4,2],
    [0,3],[4,3],
    // bottom with gap (skip 2,4)
    [1,4],[3,4],
  ];

  const props: PropPlacement[] = ring.map(([dx, dy], i) => ({
    dx, dy,
    type: (i % 3 === 0 ? 'crate' : 'barrel') as PropType,
  }));

  // Interior well as landmark
  props.push({ dx: 2, dy: 2, type: 'well' });

  return {
    width: 5, height: 5, props,
    pickups: [
      { dx: 1, dy: 2, type: 'coin', value: 1 },
      { dx: 3, dy: 2, type: 'food', value: 0 },
    ],
  };
}

const STRUCTURE_TEMPLATES: StructureTemplate[] = [
  buildFencedEnclosure(),
  buildRuinedBuilding(),
  buildHedgeMaze(),
  buildGraveyardCluster(),
  buildBarrelFort(),
];

// =============================================================================

export class TileGenerator {
  private tiles: Map<string, Tile>;
  private props: DestructibleProp[];
  private propsMap: Map<string, DestructibleProp>; // keyed by tile coord for random props
  private tileSize: number;
  private nextPropId: number;

  // Structure generation
  private generatedStructures: Set<string>; // zone keys that have been generated
  private structureTiles: Set<string>; // tile keys that belong to a structure (no random props)
  private pendingPickups: PendingPickup[];

  constructor() {
    this.tiles = new Map();
    this.props = [];
    this.propsMap = new Map();
    this.tileSize = TILE_SIZE;
    this.nextPropId = 1;
    this.generatedStructures = new Set();
    this.structureTiles = new Set();
    this.pendingPickups = [];
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
        if (this.propsMap.has(key)) {
          const prop = this.propsMap.get(key)!;
          this.propsMap.delete(key);
          const idx = this.props.indexOf(prop);
          if (idx !== -1) this.props.splice(idx, 1);
        }
        this.structureTiles.delete(key);
      }
    }

    // Clean up structure props and zones that are entirely out of range
    for (let i = this.props.length - 1; i >= 0; i--) {
      const p = this.props[i];
      if (p.destroyed) { this.props.splice(i, 1); continue; }
      const ptx = Math.floor(p.x / this.tileSize);
      const pty = Math.floor(p.y / this.tileSize);
      if (ptx < cleanMinTX || ptx > cleanMaxTX || pty < cleanMinTY || pty > cleanMaxTY) {
        this.props.splice(i, 1);
      }
    }

    // Clean up structure zone tracking for distant zones
    for (const zoneKey of this.generatedStructures) {
      const [zxStr, zyStr] = zoneKey.split(',');
      const zx = Number(zxStr);
      const zy = Number(zyStr);
      const zoneTileMinX = zx * STRUCTURE_ZONE_SIZE;
      const zoneTileMaxX = zoneTileMinX + STRUCTURE_ZONE_SIZE - 1;
      const zoneTileMinY = zy * STRUCTURE_ZONE_SIZE;
      const zoneTileMaxY = zoneTileMinY + STRUCTURE_ZONE_SIZE - 1;
      if (zoneTileMaxX < cleanMinTX || zoneTileMinX > cleanMaxTX ||
          zoneTileMaxY < cleanMinTY || zoneTileMinY > cleanMaxTY) {
        this.generatedStructures.delete(zoneKey);
      }
    }
  }

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

  /** Get all non-destroyed collidable props (excludes urns). */
  getProps(): DestructibleProp[] {
    return this.props.filter((p) => !p.destroyed && p.type !== 'urn');
  }

  /** Get all non-destroyed urn props (non-collidable walkover pickups). */
  getUrns(): DestructibleProp[] {
    return this.props.filter((p) => !p.destroyed && p.type === 'urn');
  }

  /** Damage a prop by id. Returns true if the prop was destroyed. */
  damageProp(propId: number, damage: number): boolean {
    for (const prop of this.props) {
      if (prop.id === propId && !prop.destroyed) {
        if (prop.type === 'well') return false; // indestructible
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

  /** Drain pickup spawn requests (called by game loop after update). */
  drainPendingPickups(): PendingPickup[] {
    if (this.pendingPickups.length === 0) return [];
    const pickups = this.pendingPickups;
    this.pendingPickups = [];
    return pickups;
  }

  // --------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------

  renderTiles(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const tiles = this.getVisibleTiles(camera);
    const sheet = getTileSheet();

    for (const tile of tiles) {
      const worldX = tile.x * this.tileSize;
      const worldY = tile.y * this.tileSize;
      const screen = worldToScreen(camera, worldX, worldY);

      if (sheet) {
        const frames = TILE_FRAMES[tile.type];
        if (frames) {
          const tileIndex = frames[tile.variant] ?? frames[0];
          drawTileSprite(ctx, sheet, tileIndex, screen.x, screen.y, this.tileSize);
          continue;
        }
      }

      const colors = TILE_COLORS[tile.type];
      ctx.fillStyle = colors[tile.variant];
      ctx.fillRect(screen.x, screen.y, this.tileSize, this.tileSize);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(screen.x, screen.y, this.tileSize, this.tileSize);
    }
  }

  renderProps(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const halfW = camera.width / 2 + 64;
    const halfH = camera.height / 2 + 64;
    const sheet = getPropSheet();
    const structSheet = getStructurePropSheet();

    for (const prop of this.props) {
      if (prop.destroyed) continue;

      const dx = prop.x - camera.x;
      const dy = prop.y - camera.y;
      if (Math.abs(dx) > halfW || Math.abs(dy) > halfH) continue;

      const screen = worldToScreen(camera, prop.x, prop.y);

      // Sprite rendering for original prop types (barrel, urn)
      // Note: tombstone frames (0, 3) are empty in props.png — uses vector fallback below
      if (sheet && (prop.type === 'barrel' || prop.type === 'urn')) {
        const isDamaged = prop.hp < 3;
        const frameIndex = isDamaged
          ? (PROP_DAMAGED_FRAMES[prop.type] ?? PROP_FRAMES[prop.type] ?? 0)
          : (PROP_FRAMES[prop.type] ?? 0);
        drawSprite(ctx, sheet, frameIndex, screen.x, screen.y - 8, PROP_SCALE, false);
        continue;
      }

      // Sprite rendering for structure prop types
      if (structSheet && STRUCTURE_PROP_FRAMES[prop.type] !== undefined) {
        const maxHp = PROP_DEFAULT_HP[prop.type];
        const isDamaged = prop.hp < maxHp * 0.6;
        const frameIndex = isDamaged
          ? (STRUCTURE_PROP_DAMAGED_FRAMES[prop.type] ?? STRUCTURE_PROP_FRAMES[prop.type])
          : STRUCTURE_PROP_FRAMES[prop.type];
        drawSprite(ctx, structSheet, frameIndex, screen.x, screen.y - 8, PROP_SCALE, false);
        continue;
      }

      // Vector rendering fallback (apply same -8 offset as sprites for consistency)
      ctx.save();
      ctx.translate(screen.x, screen.y - 8);
      this.drawPropVector(ctx, prop);
      ctx.restore();
    }
  }

  // --------------------------------------------------------------------------
  // Private: Vector drawing for each prop type
  // --------------------------------------------------------------------------

  private drawPropVector(ctx: CanvasRenderingContext2D, prop: DestructibleProp): void {
    const color = PROP_COLORS[prop.type];
    const maxHp = PROP_DEFAULT_HP[prop.type];

    switch (prop.type) {
      case 'tombstone': {
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
        // Cross
        ctx.strokeStyle = '#888899';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -18); ctx.lineTo(0, -8);
        ctx.moveTo(-4, -14); ctx.lineTo(4, -14);
        ctx.stroke();
        break;
      }
      case 'barrel': {
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
        ctx.moveTo(-10, -10); ctx.lineTo(10, -10);
        ctx.moveTo(-10, -2); ctx.lineTo(10, -2);
        ctx.stroke();
        break;
      }
      case 'urn': {
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
      case 'fence_h': {
        // Horizontal plank fence
        ctx.fillStyle = color;
        ctx.fillRect(-26, -12, 52, 4);  // top rail
        ctx.fillRect(-26, -4, 52, 4);   // bottom rail
        // Posts
        ctx.fillStyle = '#6b5535';
        ctx.fillRect(-24, -16, 4, 18);
        ctx.fillRect(20, -16, 4, 18);
        ctx.strokeStyle = '#5a4a2a';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-26, -12, 52, 4);
        ctx.strokeRect(-26, -4, 52, 4);
        break;
      }
      case 'fence_v': {
        // Vertical plank fence
        ctx.fillStyle = color;
        ctx.fillRect(-4, -26, 4, 52);   // left rail
        ctx.fillRect(4, -26, 4, 52);    // right rail
        ctx.fillStyle = '#6b5535';
        ctx.fillRect(-6, -24, 16, 4);
        ctx.fillRect(-6, 20, 16, 4);
        ctx.strokeStyle = '#5a4a2a';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-4, -26, 4, 52);
        ctx.strokeRect(4, -26, 4, 52);
        break;
      }
      case 'fence_post': {
        // Thick wooden post
        ctx.fillStyle = '#6b5535';
        ctx.fillRect(-6, -18, 12, 20);
        ctx.fillStyle = '#5a4a2a';
        ctx.fillRect(-7, -19, 14, 4); // cap
        ctx.strokeStyle = '#4a3a1a';
        ctx.lineWidth = 1;
        ctx.strokeRect(-6, -18, 12, 20);
        break;
      }
      case 'wall': {
        // Horizontal stone wall
        ctx.fillStyle = color;
        ctx.fillRect(-26, -14, 52, 20);
        // Stone lines
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-26, -6); ctx.lineTo(26, -6);
        ctx.moveTo(-10, -14); ctx.lineTo(-10, -6);
        ctx.moveTo(10, -14); ctx.lineTo(10, -6);
        ctx.moveTo(-18, -6); ctx.lineTo(-18, 6);
        ctx.moveTo(4, -6); ctx.lineTo(4, 6);
        ctx.moveTo(18, -6); ctx.lineTo(18, 6);
        ctx.stroke();
        ctx.strokeStyle = '#3a3a3a';
        ctx.lineWidth = 1;
        ctx.strokeRect(-26, -14, 52, 20);
        break;
      }
      case 'wall_v': {
        // Vertical stone wall
        ctx.fillStyle = color;
        ctx.fillRect(-10, -26, 20, 52);
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-2, -26); ctx.lineTo(-2, 26);
        ctx.moveTo(-10, -10); ctx.lineTo(-2, -10);
        ctx.moveTo(-10, 10); ctx.lineTo(-2, 10);
        ctx.moveTo(-2, -18); ctx.lineTo(10, -18);
        ctx.moveTo(-2, 0); ctx.lineTo(10, 0);
        ctx.moveTo(-2, 18); ctx.lineTo(10, 18);
        ctx.stroke();
        ctx.strokeStyle = '#3a3a3a';
        ctx.lineWidth = 1;
        ctx.strokeRect(-10, -26, 20, 52);
        break;
      }
      case 'hedge': {
        // Dense bush/hedge
        ctx.fillStyle = '#1e4a1e';
        ctx.beginPath();
        ctx.ellipse(0, -6, 24, 22, 0, 0, Math.PI * 2);
        ctx.fill();
        // Lighter foliage blobs
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(-8, -10, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(6, -8, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-2, -16, 8, 0, Math.PI * 2);
        ctx.fill();
        // Outline
        ctx.strokeStyle = '#1a3a1a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, -6, 24, 22, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'crate': {
        // Wooden crate
        ctx.fillStyle = color;
        ctx.fillRect(-11, -16, 22, 18);
        // Cross bracing
        ctx.strokeStyle = '#5a4a20';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-11, -16); ctx.lineTo(11, 2);
        ctx.moveTo(11, -16); ctx.lineTo(-11, 2);
        ctx.stroke();
        // Border
        ctx.strokeStyle = '#4a3a15';
        ctx.lineWidth = 1;
        ctx.strokeRect(-11, -16, 22, 18);
        // Top edge highlight
        ctx.fillStyle = '#8b7340';
        ctx.fillRect(-11, -16, 22, 3);
        break;
      }
      case 'well': {
        // Stone well
        ctx.fillStyle = '#6a6a7a';
        ctx.beginPath();
        ctx.ellipse(0, -4, 14, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        // Dark inner hole
        ctx.fillStyle = '#1a1a2a';
        ctx.beginPath();
        ctx.ellipse(0, -6, 8, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        // Stone ring
        ctx.strokeStyle = '#555566';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, -4, 14, 10, 0, 0, Math.PI * 2);
        ctx.stroke();
        // Roof posts
        ctx.fillStyle = '#6b5535';
        ctx.fillRect(-12, -22, 3, 20);
        ctx.fillRect(9, -22, 3, 20);
        // Roof beam
        ctx.fillRect(-13, -24, 26, 3);
        break;
      }
    }

    // Damage cracks (universal for destructible props)
    if (prop.hp < maxHp && prop.hp > 0) {
      const alpha = 0.3 + 0.3 * (1 - prop.hp / maxHp);
      ctx.strokeStyle = `rgba(255,100,100,${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-3, -5);
      ctx.lineTo(2, -12);
      ctx.lineTo(-1, -18);
      ctx.stroke();
    }
  }

  // --------------------------------------------------------------------------
  // Private: Tile + structure generation
  // --------------------------------------------------------------------------

  private generateTile(tx: number, ty: number, key: string): void {
    const h = hashCoord(tx, ty);

    const frameIdx = ALL_TILE_FRAMES[h % ALL_TILE_FRAMES.length];
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

    this.tiles.set(key, { x: tx, y: ty, type, variant });

    // Check if this tile triggers structure zone generation
    const zx = Math.floor(tx / STRUCTURE_ZONE_SIZE);
    const zy = Math.floor(ty / STRUCTURE_ZONE_SIZE);
    const zoneKey = `${zx},${zy}`;

    if (!this.generatedStructures.has(zoneKey)) {
      this.generatedStructures.add(zoneKey);
      this.tryGenerateStructure(zx, zy);
    }

    // Skip random prop if inside a structure zone
    if (this.structureTiles.has(key)) return;

    // Normal random prop generation
    const nearSpawn = Math.abs(tx) <= 2 && Math.abs(ty) <= 2;
    const propRoll = ((h >> 16) % 1000) / 1000;
    if (!nearSpawn && propRoll < PROP_CHANCE && !this.propsMap.has(key)) {
      const propTypeRoll = (h >> 20) % 20;
      const propType: PropType =
        propTypeRoll < 10 ? 'barrel' : 'urn';

      const offsetX = ((h >> 12) % 20) - 10;
      const offsetY = ((h >> 14) % 20) - 10;

      const hitbox = PROP_HITBOX[propType];
      const prop: DestructibleProp = {
        id: this.nextPropId++,
        x: tx * this.tileSize + this.tileSize / 2 + offsetX,
        y: ty * this.tileSize + this.tileSize / 2 + offsetY,
        halfW: hitbox.halfW,
        halfH: hitbox.halfH,
        radius: Math.max(hitbox.halfW, hitbox.halfH),
        type: propType,
        hp: PROP_DEFAULT_HP[propType],
        destroyed: false,
      };

      this.props.push(prop);
      this.propsMap.set(key, prop);
    }
  }

  private tryGenerateStructure(zx: number, zy: number): void {
    // Exclude zones near origin
    if (Math.abs(zx) <= STRUCTURE_SPAWN_EXCLUSION && Math.abs(zy) <= STRUCTURE_SPAWN_EXCLUSION) return;

    // Deterministic roll for this zone
    const zh = hashCoord(zx * 7919, zy * 7907);
    const roll = (zh % 1000) / 1000;
    if (roll >= STRUCTURE_CHANCE) return;

    // Pick structure type
    const templateIdx = zh % STRUCTURE_TEMPLATES.length;
    const template = STRUCTURE_TEMPLATES[templateIdx];

    // Center the structure within the zone
    const offsetX = Math.floor((STRUCTURE_ZONE_SIZE - template.width) / 2);
    const offsetY = Math.floor((STRUCTURE_ZONE_SIZE - template.height) / 2);
    const baseTX = zx * STRUCTURE_ZONE_SIZE + offsetX;
    const baseTY = zy * STRUCTURE_ZONE_SIZE + offsetY;

    // Mark structure tiles (suppress random props)
    for (let dy = 0; dy < template.height; dy++) {
      for (let dx = 0; dx < template.width; dx++) {
        this.structureTiles.add(`${baseTX + dx},${baseTY + dy}`);
      }
    }

    // Place structure props
    for (const placement of template.props) {
      const tx = baseTX + placement.dx;
      const ty = baseTY + placement.dy;
      const hitbox = PROP_HITBOX[placement.type];
      const prop: DestructibleProp = {
        id: this.nextPropId++,
        x: tx * this.tileSize + this.tileSize / 2,
        y: ty * this.tileSize + this.tileSize / 2,
        halfW: hitbox.halfW,
        halfH: hitbox.halfH,
        radius: Math.max(hitbox.halfW, hitbox.halfH),
        type: placement.type,
        hp: PROP_DEFAULT_HP[placement.type],
        destroyed: false,
      };
      this.props.push(prop);
    }

    // Queue pickup spawns
    for (const pickup of template.pickups) {
      const tx = baseTX + pickup.dx;
      const ty = baseTY + pickup.dy;
      this.pendingPickups.push({
        x: tx * this.tileSize + this.tileSize / 2,
        y: ty * this.tileSize + this.tileSize / 2,
        type: pickup.type,
        value: pickup.value,
      });
    }
  }
}
