/**
 * mapSystem.ts — Multi-map system with obstacle configs.
 * Maps 1 (Kowloon), 2 (Industrial), 3 (Void Core).
 * Each map has static obstacles, visual theme, and wave range.
 */
import { ARENA_W, ARENA_H, ARENA_HW, ARENA_HH } from './constants';

export interface Obstacle {
    id: number;
    x: number; y: number; w: number; h: number;
    type: 'building' | 'debris' | 'barrier' | 'tree' | 'terminal' | 'hazard' | 'billboard';
    destructible: boolean;
    hp: number; maxHp: number;
    active: boolean;
    /** optional accent glow for rendering */
    glowColor?: string;
}

export interface MapConfig {
    id: number;
    name: string;
    theme: 'kowloon' | 'industrial' | 'void_core';
    startWave: number;
    endWave: number;
    /** wave that triggers map transition; null = final map */
    transitionWave: number | null;
    transitionLore: string;
    floorColor: string;
    gridColor: string;
    borderColor: string;
    ambientGlow: string;
    obstacles: Omit<Obstacle, 'id' | 'active'>[];
}

// ── Map 1: Kowloon Void Zone ─────────────────────────────────────────────────
export const MAP_1: MapConfig = {
    id: 1, name: 'Kowloon Void Zone', theme: 'kowloon',
    startWave: 1, endWave: 15, transitionWave: 15,
    transitionLore: 'The rift tears deeper underground. Follow the signal.',
    floorColor: '#0a0a12', gridColor: '#1a1a2a',
    borderColor: '#00f5ff', ambientGlow: '#00f5ff',
    obstacles: [
        // Corner buildings — hard cover
        { x: 60, y: 60, w: 130, h: 220, type: 'building', destructible: false, hp: 999, maxHp: 999 },
        { x: 60, y: 720, w: 130, h: 220, type: 'building', destructible: false, hp: 999, maxHp: 999 },
        { x: 1410, y: 60, w: 130, h: 220, type: 'building', destructible: false, hp: 999, maxHp: 999 },
        { x: 1410, y: 720, w: 130, h: 220, type: 'building', destructible: false, hp: 999, maxHp: 999 },
        // Mid debris clusters
        { x: 680, y: 60, w: 60, h: 130, type: 'debris', destructible: false, hp: 999, maxHp: 999 },
        { x: 680, y: 810, w: 60, h: 130, type: 'debris', destructible: false, hp: 999, maxHp: 999 },
        // Destructible trees (cover that can be cleared)
        { x: 330, y: 220, w: 28, h: 28, type: 'tree', destructible: true, hp: 3, maxHp: 3 },
        { x: 330, y: 752, w: 28, h: 28, type: 'tree', destructible: true, hp: 3, maxHp: 3 },
        { x: 1242, y: 220, w: 28, h: 28, type: 'tree', destructible: true, hp: 3, maxHp: 3 },
        { x: 1242, y: 752, w: 28, h: 28, type: 'tree', destructible: true, hp: 3, maxHp: 3 },
        // Barriers — partial cover lanes
        { x: 540, y: 300, w: 110, h: 22, type: 'barrier', destructible: false, hp: 999, maxHp: 999 },
        { x: 950, y: 678, w: 110, h: 22, type: 'barrier', destructible: false, hp: 999, maxHp: 999 },
        // Research terminal — environmental storytelling
        { x: 460, y: 460, w: 38, h: 38, type: 'terminal', destructible: false, hp: 999, maxHp: 999, glowColor: '#00ff88' },
        // Neon billboards (decorative, non-collidable)
        { x: 80, y: 42, w: 90, h: 28, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#00f5ff' },
        { x: 1430, y: 42, w: 80, h: 25, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff00cc' },
        { x: 690, y: 42, w: 50, h: 22, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff6820' },
        { x: 80, y: 930, w: 70, h: 24, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#d4af37' },
        { x: 1440, y: 930, w: 85, h: 26, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#39ff14' },
    ],
};

// ── Map 2: Void Industrial Sector ─────────────────────────────────────────────
export const MAP_2: MapConfig = {
    id: 2, name: 'Void Industrial Sector', theme: 'industrial',
    startWave: 16, endWave: 30, transitionWave: 30,
    transitionLore: 'The Void core pulses ahead. There is no turning back.',
    floorColor: '#0d0810', gridColor: '#1f0d24',
    borderColor: '#ff00cc', ambientGlow: '#ff00cc',
    obstacles: [
        // Industrial pipes/horizontal walls
        { x: 80, y: 140, w: 220, h: 45, type: 'building', destructible: false, hp: 999, maxHp: 999 },
        { x: 80, y: 815, w: 220, h: 45, type: 'building', destructible: false, hp: 999, maxHp: 999 },
        { x: 1300, y: 140, w: 220, h: 45, type: 'building', destructible: false, hp: 999, maxHp: 999 },
        { x: 1300, y: 815, w: 220, h: 45, type: 'building', destructible: false, hp: 999, maxHp: 999 },
        // Central platforms
        { x: 670, y: 360, w: 260, h: 45, type: 'building', destructible: false, hp: 999, maxHp: 999 },
        { x: 670, y: 595, w: 260, h: 45, type: 'building', destructible: false, hp: 999, maxHp: 999 },
        // Void hazard pools (damage on contact — handled in game.ts)
        { x: 340, y: 360, w: 65, h: 65, type: 'hazard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff00cc' },
        { x: 1195, y: 575, w: 65, h: 65, type: 'hazard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff00cc' },
        // Debris
        { x: 500, y: 140, w: 45, h: 45, type: 'debris', destructible: true, hp: 2, maxHp: 2 },
        { x: 1055, y: 815, w: 45, h: 45, type: 'debris', destructible: true, hp: 2, maxHp: 2 },
        // Void terminal
        { x: 760, y: 468, w: 38, h: 38, type: 'terminal', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff6600' },
        // Neon billboards
        { x: 100, y: 100, w: 80, h: 26, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff00cc' },
        { x: 1340, y: 100, w: 75, h: 24, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff6820' },
        { x: 700, y: 100, w: 60, h: 22, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#aa44ff' },
        { x: 100, y: 870, w: 90, h: 28, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#00f5ff' },
    ],
};

// ── Map 3: Void Core Chamber ──────────────────────────────────────────────────
export const MAP_3: MapConfig = {
    id: 3, name: 'Void Core Chamber', theme: 'void_core',
    startWave: 31, endWave: 40, transitionWave: null,
    transitionLore: '',
    floorColor: '#080510', gridColor: '#1a0525',
    borderColor: '#ff0044', ambientGlow: '#ff0044',
    obstacles: [
        // Void pillars — symmetrical ring
        { x: 180, y: 180, w: 90, h: 90, type: 'building', destructible: false, hp: 999, maxHp: 999 },
        { x: 180, y: 730, w: 90, h: 90, type: 'building', destructible: false, hp: 999, maxHp: 999 },
        { x: 1330, y: 180, w: 90, h: 90, type: 'building', destructible: false, hp: 999, maxHp: 999 },
        { x: 1330, y: 730, w: 90, h: 90, type: 'building', destructible: false, hp: 999, maxHp: 999 },
        // Inner horizontal walls
        { x: 660, y: 195, w: 280, h: 32, type: 'building', destructible: false, hp: 999, maxHp: 999 },
        { x: 660, y: 773, w: 280, h: 32, type: 'building', destructible: false, hp: 999, maxHp: 999 },
        // Void hazards
        { x: 470, y: 430, w: 55, h: 55, type: 'hazard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff0044' },
        { x: 1075, y: 515, w: 55, h: 55, type: 'hazard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff0044' },
        { x: 760, y: 440, w: 55, h: 55, type: 'hazard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff2200' },
        // Neon billboards
        { x: 200, y: 150, w: 70, h: 24, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff0044' },
        { x: 1340, y: 150, w: 80, h: 26, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#cc00ff' },
        { x: 680, y: 160, w: 55, h: 20, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ffffff' },
        { x: 1340, y: 760, w: 75, h: 24, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff0044' },
    ],
};

export const MAPS: MapConfig[] = [MAP_1, MAP_2, MAP_3];

/** Get map config for given wave number */
export function getMapForWave(wave: number): MapConfig {
    return MAPS.find(m => wave >= m.startWave && wave <= m.endWave) ?? MAP_1;
}

/** Instantiate obstacles from map config */
export function buildObstacles(map: MapConfig): Obstacle[] {
    return map.obstacles.map((o, i) => ({ ...o, id: i, active: true }));
}

// ── Collision utilities ───────────────────────────────────────────────────────

/** Circle vs AABB overlap test */
export function circleAABBOverlaps(
    cx: number, cy: number, cr: number,
    ox: number, oy: number, ow: number, oh: number,
): boolean {
    const nearX = Math.max(ox, Math.min(ox + ow, cx));
    const nearY = Math.max(oy, Math.min(oy + oh, cy));
    const dx = cx - nearX, dy = cy - nearY;
    return dx * dx + dy * dy < cr * cr;
}

/** Push circle out of all solid (non-hazard) active obstacles */
export function resolveObstacleCollision(
    cx: number, cy: number, cr: number,
    obstacles: Obstacle[],
): { x: number; y: number } {
    let x = cx, y = cy;
    for (const o of obstacles) {
        if (!o.active || o.type === 'hazard' || o.type === 'billboard') continue;
        if (!circleAABBOverlaps(x, y, cr, o.x, o.y, o.w, o.h)) continue;
        const nearX = Math.max(o.x, Math.min(o.x + o.w, x));
        const nearY = Math.max(o.y, Math.min(o.y + o.h, y));
        const dx = x - nearX, dy = y - nearY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.001) { x = o.x + o.w + cr; continue; }
        const overlap = cr - dist;
        x += (dx / dist) * overlap;
        y += (dy / dist) * overlap;
    }
    return { x, y };
}

/** Simple obstacle steering — returns blended normalized direction */
export function steerAroundObstacles(
    ex: number, ey: number, er: number,
    tx: number, ty: number,
    obstacles: Obstacle[],
): { nx: number; ny: number } {
    const dx = tx - ex, dy = ty - ey;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return { nx: 0, ny: 0 };
    let nx = dx / len, ny = dy / len;
    const lookahead = 70;
    const lx = ex + nx * lookahead, ly = ey + ny * lookahead;
    for (const o of obstacles) {
        if (!o.active || o.type === 'hazard' || o.type === 'billboard') continue;
        if (circleAABBOverlaps(lx, ly, er + 12, o.x, o.y, o.w, o.h)) {
            // Steer perpendicular — pick whichever side clears
            const perpL = { nx: -ny, ny: nx };
            const perpR = { nx: ny, ny: -nx };
            const testL = { x: ex + perpL.nx * lookahead, y: ey + perpL.ny * lookahead };
            const clearL = !obstacles.some(oo =>
                oo.active && oo.type !== 'hazard' && oo.type !== 'billboard' &&
                circleAABBOverlaps(testL.x, testL.y, er + 12, oo.x, oo.y, oo.w, oo.h)
            );
            const perp = clearL ? perpL : perpR;
            nx = nx * 0.3 + perp.nx * 0.7;
            ny = ny * 0.3 + perp.ny * 0.7;
            break;
        }
    }
    return { nx, ny };
}


