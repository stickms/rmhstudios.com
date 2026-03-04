/**
 * sprites.ts — Central sprite config registry mapping entity types to sprite configs.
 * Also includes UI icon mapping (abilities + hearts).
 */

export interface SpriteConfig {
    /** URL path to the sprite image (relative to /public) */
    url: string;
    /** URL for the left-facing variant (used with rotationMode: 'directional') */
    leftUrl?: string;
    /** Frame width for sprite sheets (optional) */
    frameWidth?: number;
    /** Frame height for sprite sheets (optional) */
    frameHeight?: number;
    /** Number of animation frames (optional) */
    frames?: number;
    /** Animation FPS (optional) */
    fps?: number;
    /** Anchor X in [0..1] (0.5 = center) */
    anchorX: number;
    /** Anchor Y in [0..1] (0.5 = center) */
    anchorY: number;
    /** Scale multiplier */
    scale: number;
    /**
     * How sprite rotation is determined:
     * - 'velocity': rotates toward movement direction
     * - 'aim': full 360° rotation following aim angle
     * - 'directional': flips left/right based on aim side, tilts vertically only
     * - 'none': no rotation
     */
    rotationMode: 'velocity' | 'aim' | 'directional' | 'none';
    /** Optional glow color for neon effect */
    glowColor?: string;
    /** Whether to draw a shadow under the sprite */
    shadow?: boolean;
    /** Remove dark background at runtime (default true) */
    removeBackground?: boolean;
}

// ── Player ──────────────────────────────────────────────────────────

export const PLAYER_SPRITE: SpriteConfig = {
    url: '/sprites/void-breaker/player/void-runner.png',
    leftUrl: '/sprites/void-breaker/player/void-runner-left.png',
    anchorX: 0.5,
    anchorY: 0.5,
    scale: 2.2,
    rotationMode: 'directional',
    glowColor: '#44ddff',
    shadow: true,
};

// ── Enemies ─────────────────────────────────────────────────────────

export const ENEMY_SPRITES: Record<string, SpriteConfig> = {
    drifter: {
        url: '/sprites/void-breaker/enemies/entity-drone-a.png',
        anchorX: 0.5, anchorY: 0.5,
        scale: 1.8,
        rotationMode: 'velocity',
        glowColor: '#8866cc',
    },
    dasher: {
        url: '/sprites/void-breaker/enemies/void-strider.png',
        anchorX: 0.5, anchorY: 0.5,
        scale: 1.6,
        rotationMode: 'velocity',
        glowColor: '#cc4422',
    },
    orbiter: {
        url: '/sprites/void-breaker/enemies/shard-warden.png',
        anchorX: 0.5, anchorY: 0.5,
        scale: 1.8,
        rotationMode: 'none',
        glowColor: '#aa44ff',
    },
    tank: {
        url: '/sprites/void-breaker/enemies/corrupt-hound.png',
        anchorX: 0.5, anchorY: 0.5,
        scale: 2.0,
        rotationMode: 'velocity',
        glowColor: '#aa2233',
    },
    splitter: {
        url: '/sprites/void-breaker/enemies/splitter.png',
        anchorX: 0.5, anchorY: 0.5,
        scale: 1.8,
        rotationMode: 'velocity',
        glowColor: '#66aa44',
    },
    mini_drifter: {
        url: '/sprites/void-breaker/enemies/entity-drone-a.png',
        anchorX: 0.5, anchorY: 0.5,
        scale: 1.2,
        rotationMode: 'velocity',
        glowColor: '#88cc88',
    },
};

// ── Bosses ───────────────────────────────────────────────────────────

/** Boss sprite keyed by tier number */
export const BOSS_SPRITES: Record<number, SpriteConfig> = {
    1: { // Wave 5
        url: '/sprites/void-breaker/bosses/harbinger.png',
        anchorX: 0.5, anchorY: 0.5, scale: 2.5,
        rotationMode: 'none', glowColor: '#ff3355', shadow: true,
    },
    2: { // Wave 10 — Fallen Angel
        url: '/sprites/void-breaker/bosses/harbinger.png',
        anchorX: 0.5, anchorY: 0.5, scale: 2.8,
        rotationMode: 'none', glowColor: '#ff2244', shadow: true,
    },
    3: { // Wave 15 — Pattern Engine
        url: '/sprites/void-breaker/bosses/pattern-engine.png',
        anchorX: 0.5, anchorY: 0.5, scale: 2.6,
        rotationMode: 'none', glowColor: '#ff6a00', shadow: true,
    },
    4: { // Wave 20 — Domain Collapser
        url: '/sprites/void-breaker/bosses/pattern-engine.png',
        anchorX: 0.5, anchorY: 0.5, scale: 3.0,
        rotationMode: 'none', glowColor: '#cc00ff', shadow: true,
    },
    5: { // Wave 25
        url: '/sprites/void-breaker/bosses/harbinger.png',
        anchorX: 0.5, anchorY: 0.5, scale: 3.2,
        rotationMode: 'none', glowColor: '#ff3355', shadow: true,
    },
    6: { // Wave 30 — Reality Breacher
        url: '/sprites/void-breaker/bosses/void-regent.png',
        anchorX: 0.5, anchorY: 0.5, scale: 3.0,
        rotationMode: 'none', glowColor: '#0066ff', shadow: true,
    },
    7: { // Wave 35 — The Architect
        url: '/sprites/void-breaker/bosses/pattern-engine.png',
        anchorX: 0.5, anchorY: 0.5, scale: 3.4,
        rotationMode: 'none', glowColor: '#ff8800', shadow: true,
    },
    8: { // Wave 40 — The Equilibrium
        url: '/sprites/void-breaker/bosses/void-regent.png',
        anchorX: 0.5, anchorY: 0.5, scale: 4.0,
        rotationMode: 'none', glowColor: '#ffffff', shadow: true,
    },
};

// ── Pickups ──────────────────────────────────────────────────────────

export const HEART_PICKUP_SPRITE: SpriteConfig = {
    url: '/sprites/void-breaker/pickups/heart.png',
    anchorX: 0.5, anchorY: 0.5,
    scale: 1.2,
    rotationMode: 'none',
    glowColor: '#ff00cc',
};

// ── Helper ───────────────────────────────────────────────────────────

import { BOSS_WAVE_INTERVAL } from './constants';

/** Get the sprite config for an entity type. Returns undefined if missing. */
export function getSpriteConfig(entityType: string, isBoss: boolean, wave?: number): SpriteConfig | undefined {
    if (isBoss && wave !== undefined) {
        const tier = Math.floor(wave / BOSS_WAVE_INTERVAL);
        return BOSS_SPRITES[tier];
    }
    return ENEMY_SPRITES[entityType];
}

/** Get all sprite URLs for preloading */
export function getAllSpriteUrls(): string[] {
    const urls = new Set<string>();
    const addConfig = (s: SpriteConfig) => { urls.add(s.url); if (s.leftUrl) urls.add(s.leftUrl); };
    addConfig(PLAYER_SPRITE);
    addConfig(HEART_PICKUP_SPRITE);
    for (const s of Object.values(ENEMY_SPRITES)) addConfig(s);
    for (const s of Object.values(BOSS_SPRITES)) addConfig(s);
    return Array.from(urls);
}
