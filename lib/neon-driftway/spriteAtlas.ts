/**
 * Vehicle sprite atlas definitions for 2D_TOPDOWN_PIXELART_CARS.png
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ Sprite coordinates extracted via pixel analysis (pngjs).        │
 * │ Image size: 208×368                                              │
 * │                                                                  │
 * │ Layout: 4 rows × 5 columns + 1 tall truck in col 5 rows 1-2    │
 * │   Row 1 (Blue):  y=0     Row 2 (Green): y=96                   │
 * │   Row 3 (Red):   y=192   Row 4 (Mixed): y=288                  │
 * │                                                                  │
 * │ Column widths (actual measured):                                 │
 * │   Col0: 26w  Col1: 29w  Col2: 30w  Col3: 31w  Col4: 40w       │
 * │ Column heights match user spec: 58, 75, 78, 71, 80             │
 * │                                                                  │
 * │ Player car: Row 3, Col 3 (red sedan, 31×71 actual pixels)      │
 * └──────────────────────────────────────────────────────────────────┘
 */

import type { SpriteDef } from './sprites';

export type VehicleSpriteKey =
    | 'player_red_sedan'
    | 'traffic_compact_blue'
    | 'traffic_sedan_blue'
    | 'traffic_sports_blue'
    | 'traffic_sedan2_blue'
    | 'traffic_compact_green'
    | 'traffic_sedan_green'
    | 'traffic_sports_green'
    | 'traffic_sedan2_green'
    | 'traffic_compact_red'
    | 'traffic_sedan_red'
    | 'traffic_sports_maroon'
    | 'traffic_compact_orange'
    | 'traffic_sedan_dark'
    | 'traffic_sports_yellow'
    | 'traffic_sedan_yellow'
    | 'truck_white'
    | 'truck_dark'
    | 'truck_cream';

export const VEHICLE_SPRITES: Record<VehicleSpriteKey, SpriteDef> = {
    // ── Row 3 (Red), Col 3: Player car ──
    player_red_sedan: {
        rect: { sx: 97, sy: 192, sw: 31, sh: 71 },
        pivot: { x: 0.5, y: 0.5 },
        drawScale: 1,
    },

    // ── Row 1 (Blue, y=0) ──
    traffic_compact_blue: {
        rect: { sx: 0, sy: 0, sw: 26, sh: 58 },
        pivot: { x: 0.5, y: 0.5 },
        drawScale: 1,
    },
    traffic_sedan_blue: {
        rect: { sx: 30, sy: 0, sw: 29, sh: 75 },
        pivot: { x: 0.5, y: 0.5 },
        drawScale: 1,
    },
    traffic_sports_blue: {
        rect: { sx: 63, sy: 0, sw: 30, sh: 78 },
        pivot: { x: 0.5, y: 0.5 },
        drawScale: 1,
    },
    traffic_sedan2_blue: {
        rect: { sx: 97, sy: 0, sw: 31, sh: 71 },
        pivot: { x: 0.5, y: 0.5 },
        drawScale: 1,
    },

    // ── Row 2 (Green, y=96) ──
    traffic_compact_green: {
        rect: { sx: 0, sy: 96, sw: 26, sh: 58 },
        pivot: { x: 0.5, y: 0.5 },
        drawScale: 1,
    },
    traffic_sedan_green: {
        rect: { sx: 30, sy: 96, sw: 29, sh: 75 },
        pivot: { x: 0.5, y: 0.5 },
        drawScale: 1,
    },
    traffic_sports_green: {
        rect: { sx: 63, sy: 96, sw: 30, sh: 78 },
        pivot: { x: 0.5, y: 0.5 },
        drawScale: 1,
    },
    traffic_sedan2_green: {
        rect: { sx: 97, sy: 96, sw: 31, sh: 71 },
        pivot: { x: 0.5, y: 0.5 },
        drawScale: 1,
    },

    // ── Row 3 (Red, y=192) ──
    traffic_compact_red: {
        rect: { sx: 0, sy: 192, sw: 26, sh: 58 },
        pivot: { x: 0.5, y: 0.5 },
        drawScale: 1,
    },
    traffic_sedan_red: {
        rect: { sx: 30, sy: 192, sw: 29, sh: 75 },
        pivot: { x: 0.5, y: 0.5 },
        drawScale: 1,
    },
    traffic_sports_maroon: {
        rect: { sx: 63, sy: 192, sw: 30, sh: 78 },
        pivot: { x: 0.5, y: 0.5 },
        drawScale: 1,
    },

    // ── Row 4 (Mixed, y=288) ──
    traffic_compact_orange: {
        rect: { sx: 0, sy: 288, sw: 26, sh: 58 },
        pivot: { x: 0.5, y: 0.5 },
        drawScale: 1,
    },
    traffic_sedan_dark: {
        rect: { sx: 30, sy: 288, sw: 29, sh: 75 },
        pivot: { x: 0.5, y: 0.5 },
        drawScale: 1,
    },
    traffic_sports_yellow: {
        rect: { sx: 63, sy: 288, sw: 30, sh: 78 },
        pivot: { x: 0.5, y: 0.5 },
        drawScale: 1,
    },
    traffic_sedan_yellow: {
        rect: { sx: 97, sy: 288, sw: 31, sh: 71 },
        pivot: { x: 0.5, y: 0.5 },
        drawScale: 1,
    },

    // ── Trucks ──
    truck_white: {
        rect: { sx: 172, sy: 0, sw: 36, sh: 162 },
        pivot: { x: 0.5, y: 0.5 },
        drawScale: 1.1,
    },
    truck_dark: {
        rect: { sx: 129, sy: 192, sw: 40, sh: 80 },
        pivot: { x: 0.5, y: 0.5 },
        drawScale: 1.1,
    },
    truck_cream: {
        rect: { sx: 129, sy: 288, sw: 40, sh: 80 },
        pivot: { x: 0.5, y: 0.5 },
        drawScale: 1.1,
    },
};

/** Player vehicle choices (pick one per run) */
export const PLAYER_CHOICES: VehicleSpriteKey[] = [
    'player_red_sedan',
];

/** Traffic car sprite variants (randomly assigned on spawn) */
export const TRAFFIC_CAR_CHOICES: VehicleSpriteKey[] = [
    'traffic_compact_blue',
    'traffic_sedan_blue',
    'traffic_sports_blue',
    'traffic_sedan2_blue',
    'traffic_compact_green',
    'traffic_sedan_green',
    'traffic_sports_green',
    'traffic_sedan2_green',
    'traffic_compact_red',
    'traffic_sedan_red',
    'traffic_sports_maroon',
    'traffic_compact_orange',
    'traffic_sedan_dark',
    'traffic_sports_yellow',
    'traffic_sedan_yellow',
];

/** Traffic truck sprite variants (randomly assigned on spawn) */
export const TRAFFIC_TRUCK_CHOICES: VehicleSpriteKey[] = [
    'truck_white',
    'truck_dark',
    'truck_cream',
];

/**
 * Physics hitbox dimensions per vehicle class.
 * These match the user-specified hitbox sizes.
 */
export const VEHICLE_HITBOXES: Record<string, { width: number; height: number }> = {
    compact: { width: 26, height: 58 },
    sedan: { width: 30, height: 75 },
    sports: { width: 30, height: 80 },
    player: { width: 30, height: 70 },
    truck: { width: 44, height: 100 },
};
