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
    /**
     * Visual extrusion height in world units.
     * Buildings/walls draw a tall facade extending from their south edge upward
     * by this amount (screen-scaled). Enables 2.5D depth illusion + Y-sort occlusion.
     * Default: 0 (flat, no extrusion).
     */
    extrudeHeight?: number;
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
        // Corner buildings — hard cover (tall skyscrapers)
        { x: 60, y: 60, w: 130, h: 220, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 200 },
        { x: 60, y: 720, w: 130, h: 220, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 200 },
        { x: 1410, y: 60, w: 130, h: 220, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 200 },
        { x: 1410, y: 720, w: 130, h: 220, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 200 },
        // Mid debris clusters
        { x: 680, y: 60, w: 60, h: 130, type: 'debris', destructible: false, hp: 999, maxHp: 999 },
        { x: 680, y: 810, w: 60, h: 130, type: 'debris', destructible: false, hp: 999, maxHp: 999 },
        // Destructible trees (cover that can be cleared)
        { x: 330, y: 220, w: 28, h: 28, type: 'tree', destructible: true, hp: 3, maxHp: 3, extrudeHeight: 60 },
        { x: 330, y: 752, w: 28, h: 28, type: 'tree', destructible: true, hp: 3, maxHp: 3, extrudeHeight: 60 },
        { x: 1242, y: 220, w: 28, h: 28, type: 'tree', destructible: true, hp: 3, maxHp: 3, extrudeHeight: 60 },
        { x: 1242, y: 752, w: 28, h: 28, type: 'tree', destructible: true, hp: 3, maxHp: 3, extrudeHeight: 60 },
        // Barriers — partial cover lanes
        { x: 540, y: 300, w: 110, h: 22, type: 'barrier', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 45 },
        { x: 950, y: 678, w: 110, h: 22, type: 'barrier', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 45 },
        // Research terminal — environmental storytelling
        { x: 460, y: 460, w: 38, h: 38, type: 'terminal', destructible: false, hp: 999, maxHp: 999, glowColor: '#00ff88' },
        // Neon billboards (decorative, non-collidable)
        { x: 80, y: 42, w: 90, h: 28, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#00f5ff', extrudeHeight: 90 },
        { x: 1430, y: 42, w: 80, h: 25, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff00cc', extrudeHeight: 90 },
        { x: 690, y: 42, w: 50, h: 22, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff6820', extrudeHeight: 90 },
        { x: 80, y: 930, w: 70, h: 24, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#d4af37', extrudeHeight: 90 },
        { x: 1440, y: 930, w: 85, h: 26, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#39ff14', extrudeHeight: 90 },
        // ── Perimeter skyscrapers — top edge (y=0, h=38, dense row) ───────────
        { x: 0,    y: 0, w: 155, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 260 },
        { x: 170,  y: 0, w: 125, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 220 },
        { x: 310,  y: 0, w: 145, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 280 },
        { x: 475,  y: 0, w: 115, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 200 },
        { x: 610,  y: 0, w: 135, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 240 },
        { x: 765,  y: 0, w: 110, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 260 },
        { x: 895,  y: 0, w: 145, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 220 },
        { x: 1060, y: 0, w: 130, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 280 },
        { x: 1210, y: 0, w: 140, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 240 },
        { x: 1370, y: 0, w: 120, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 260 },
        { x: 1510, y: 0, w: 90,  h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 230 },
        // ── Perimeter skyscrapers — left edge (x=0, w=38) ────────────────────
        { x: 0, y: 60,  w: 38, h: 130, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 250 },
        { x: 0, y: 210, w: 38, h: 110, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 210 },
        { x: 0, y: 340, w: 38, h: 140, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 270 },
        { x: 0, y: 500, w: 38, h: 120, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 230 },
        { x: 0, y: 640, w: 38, h: 115, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 260 },
        { x: 0, y: 775, w: 38, h: 130, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 220 },
        // ── Perimeter skyscrapers — right edge (x=1562, w=38) ────────────────
        { x: 1562, y: 60,  w: 38, h: 130, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 240 },
        { x: 1562, y: 210, w: 38, h: 110, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 270 },
        { x: 1562, y: 340, w: 38, h: 140, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 210 },
        { x: 1562, y: 500, w: 38, h: 120, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 260 },
        { x: 1562, y: 640, w: 38, h: 115, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 230 },
        { x: 1562, y: 775, w: 38, h: 130, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 250 },
        // ── Perimeter skyscrapers — bottom edge (y=962, h=38) ────────────────
        { x: 0,    y: 962, w: 155, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 175,  y: 962, w: 125, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 320,  y: 962, w: 145, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 490,  y: 962, w: 115, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 630,  y: 962, w: 135, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 790,  y: 962, w: 110, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 920,  y: 962, w: 145, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 1090, y: 962, w: 130, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 1245, y: 962, w: 140, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 1410, y: 962, w: 120, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 1555, y: 962, w: 45,  h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
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
        { x: 80, y: 140, w: 220, h: 45, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 80 },
        { x: 80, y: 815, w: 220, h: 45, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 80 },
        { x: 1300, y: 140, w: 220, h: 45, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 80 },
        { x: 1300, y: 815, w: 220, h: 45, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 80 },
        // Central platforms
        { x: 670, y: 360, w: 260, h: 45, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 70 },
        { x: 670, y: 595, w: 260, h: 45, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 70 },
        // Void hazard pools (damage on contact — handled in game.ts)
        { x: 340, y: 360, w: 65, h: 65, type: 'hazard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff00cc' },
        { x: 1195, y: 575, w: 65, h: 65, type: 'hazard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff00cc' },
        // Debris
        { x: 500, y: 140, w: 45, h: 45, type: 'debris', destructible: true, hp: 2, maxHp: 2 },
        { x: 1055, y: 815, w: 45, h: 45, type: 'debris', destructible: true, hp: 2, maxHp: 2 },
        // Void terminal
        { x: 760, y: 468, w: 38, h: 38, type: 'terminal', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff6600' },
        // Neon billboards
        { x: 100, y: 100, w: 80, h: 26, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff00cc', extrudeHeight: 90 },
        { x: 1340, y: 100, w: 75, h: 24, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff6820', extrudeHeight: 90 },
        { x: 700, y: 100, w: 60, h: 22, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#aa44ff', extrudeHeight: 90 },
        { x: 100, y: 870, w: 90, h: 28, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#00f5ff', extrudeHeight: 90 },
        // ── Perimeter skyscrapers — top edge ──────────────────────────────────
        { x: 0,    y: 0, w: 140, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 240 },
        { x: 155,  y: 0, w: 120, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 200 },
        { x: 295,  y: 0, w: 150, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 270 },
        { x: 465,  y: 0, w: 125, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 220 },
        { x: 610,  y: 0, w: 130, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 260 },
        { x: 760,  y: 0, w: 115, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 210 },
        { x: 895,  y: 0, w: 140, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 250 },
        { x: 1055, y: 0, w: 125, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 280 },
        { x: 1200, y: 0, w: 145, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 230 },
        { x: 1365, y: 0, w: 130, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 260 },
        { x: 1515, y: 0, w: 85,  h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 220 },
        // ── Perimeter skyscrapers — left edge ─────────────────────────────────
        { x: 0, y: 60,  w: 38, h: 120, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 240 },
        { x: 0, y: 200, w: 38, h: 130, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 200 },
        { x: 0, y: 350, w: 38, h: 115, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 260 },
        { x: 0, y: 485, w: 38, h: 140, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 220 },
        { x: 0, y: 645, w: 38, h: 120, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 250 },
        { x: 0, y: 785, w: 38, h: 130, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 210 },
        // ── Perimeter skyscrapers — right edge ────────────────────────────────
        { x: 1562, y: 60,  w: 38, h: 120, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 260 },
        { x: 1562, y: 200, w: 38, h: 130, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 220 },
        { x: 1562, y: 350, w: 38, h: 115, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 240 },
        { x: 1562, y: 485, w: 38, h: 140, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 210 },
        { x: 1562, y: 645, w: 38, h: 120, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 270 },
        { x: 1562, y: 785, w: 38, h: 130, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 230 },
        // ── Perimeter skyscrapers — bottom edge ───────────────────────────────
        { x: 0,    y: 962, w: 140, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 160,  y: 962, w: 120, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 300,  y: 962, w: 150, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 470,  y: 962, w: 125, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 615,  y: 962, w: 130, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 765,  y: 962, w: 115, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 900,  y: 962, w: 140, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 1060, y: 962, w: 125, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 1205, y: 962, w: 145, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 1370, y: 962, w: 130, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 1520, y: 962, w: 80,  h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
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
        { x: 180, y: 180, w: 90, h: 90, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 160 },
        { x: 180, y: 730, w: 90, h: 90, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 160 },
        { x: 1330, y: 180, w: 90, h: 90, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 160 },
        { x: 1330, y: 730, w: 90, h: 90, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 160 },
        // Inner horizontal walls
        { x: 660, y: 195, w: 280, h: 32, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 60 },
        { x: 660, y: 773, w: 280, h: 32, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 60 },
        // Void hazards
        { x: 470, y: 430, w: 55, h: 55, type: 'hazard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff0044' },
        { x: 1075, y: 515, w: 55, h: 55, type: 'hazard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff0044' },
        { x: 760, y: 440, w: 55, h: 55, type: 'hazard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff2200' },
        // Neon billboards
        { x: 200, y: 150, w: 70, h: 24, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff0044', extrudeHeight: 90 },
        { x: 1340, y: 150, w: 80, h: 26, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#cc00ff', extrudeHeight: 90 },
        { x: 680, y: 160, w: 55, h: 20, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ffffff', extrudeHeight: 90 },
        { x: 1340, y: 760, w: 75, h: 24, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff0044', extrudeHeight: 90 },
        // ── Perimeter void pillars — top edge ─────────────────────────────────
        { x: 0,    y: 0, w: 148, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 280 },
        { x: 163,  y: 0, w: 128, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 230 },
        { x: 308,  y: 0, w: 148, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 260 },
        { x: 473,  y: 0, w: 118, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 210 },
        { x: 612,  y: 0, w: 138, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 250 },
        { x: 768,  y: 0, w: 118, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 280 },
        { x: 905,  y: 0, w: 148, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 240 },
        { x: 1073, y: 0, w: 128, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 260 },
        { x: 1223, y: 0, w: 138, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 220 },
        { x: 1383, y: 0, w: 128, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 270 },
        { x: 1530, y: 0, w: 70,  h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 240 },
        // ── Perimeter void pillars — left edge ────────────────────────────────
        { x: 0, y: 60,  w: 38, h: 125, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 260 },
        { x: 0, y: 205, w: 38, h: 120, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 220 },
        { x: 0, y: 345, w: 38, h: 135, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 280 },
        { x: 0, y: 500, w: 38, h: 125, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 240 },
        { x: 0, y: 645, w: 38, h: 120, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 260 },
        { x: 0, y: 785, w: 38, h: 130, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 230 },
        // ── Perimeter void pillars — right edge ───────────────────────────────
        { x: 1562, y: 60,  w: 38, h: 125, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 250 },
        { x: 1562, y: 205, w: 38, h: 120, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 280 },
        { x: 1562, y: 345, w: 38, h: 135, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 220 },
        { x: 1562, y: 500, w: 38, h: 125, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 270 },
        { x: 1562, y: 645, w: 38, h: 120, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 240 },
        { x: 1562, y: 785, w: 38, h: 130, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 260 },
        // ── Perimeter void pillars — bottom edge ──────────────────────────────
        { x: 0,    y: 962, w: 148, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 165,  y: 962, w: 128, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 310,  y: 962, w: 148, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 478,  y: 962, w: 118, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 618,  y: 962, w: 138, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 778,  y: 962, w: 118, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 918,  y: 962, w: 148, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 1088, y: 962, w: 128, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 1238, y: 962, w: 138, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 1398, y: 962, w: 128, h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
        { x: 1545, y: 962, w: 55,  h: 38, type: 'building', destructible: false, hp: 999, maxHp: 999, extrudeHeight: 40 },
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


