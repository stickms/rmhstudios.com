/**
 * Shared type definitions for the Dream Rift simulation, rendering and netcode.
 */

import type { BulletShape } from './render/bullets';
import type { BulletColorName } from './render/palette';
import type { PlayerId, FairyVariant } from './render/sprites';

export type { BulletShape, BulletColorName, PlayerId, FairyVariant };

export type Difficulty = 'easy' | 'normal' | 'hard' | 'lunatic';

/** High-level screen the UI is showing (mirrors store state). */
export type Screen =
    | 'title'
    | 'lobby-browser'
    | 'lobby'
    | 'char-select'
    | 'playing'
    | 'paused'
    | 'dialogue'
    | 'stage-clear'
    | 'game-over'
    | 'victory'
    | 'leaderboard'
    | 'settings';

/** Phases within a single stage. */
export type StagePhase = 'intro' | 'waves' | 'midboss' | 'bridge' | 'boss' | 'clear';

// ─── Vectors ───

export interface Vec2 {
    x: number;
    y: number;
}

// ─── Bullets ───

/**
 * A single danmaku bullet. Motion is stored in polar form (speed/angle plus
 * per-frame acceleration and angular velocity) so curving lasers and
 * accelerating bullets are expressed deterministically.
 */
export interface Bullet {
    active: boolean;
    x: number;
    y: number;
    /** Position at the end of the previous sim frame (render interpolation). */
    prevX: number;
    prevY: number;
    /** Cached per-frame velocity (cos/sin of angle×speed); only recomputed for
     *  curving or accelerating bullets, so straight bullets skip trig entirely. */
    vx: number;
    vy: number;
    speed: number;
    angle: number;
    accel: number;
    angularVel: number;
    minSpeed: number;
    maxSpeed: number;
    radius: number; // collision radius (true hitbox)
    drawRadius: number; // visual radius (sprite scale)
    shape: BulletShape;
    color: BulletColorName;
    age: number;
    ttl: number; // frames until auto-expire (-1 = never)
    /** Bitmask of player slots that have already grazed this bullet. */
    grazedMask: number;
    spin: number; // visual spin for stars/amulets
    /** Marks bullets cleared by a bomb (fade out, harmless). */
    dying: number;
}

// ─── Player shots ───

export type ShotKind = 'amulet' | 'star' | 'wave' | 'lance' | 'spark';

export interface Shot {
    active: boolean;
    x: number;
    y: number;
    prevX: number;
    prevY: number;
    vx: number;
    vy: number;
    damage: number;
    radius: number;
    ownerSlot: number;
    kind: ShotKind;
    color: BulletColorName;
    homing: boolean;
    targetId: number; // enemy id for homing, -1 none
    age: number;
    pierce: number; // remaining pierce count
}

// ─── Items ───

export type ItemKind = 'power' | 'point' | 'life' | 'bomb' | 'fullpower' | 'star';

export interface Item {
    active: boolean;
    x: number;
    y: number;
    prevX: number;
    prevY: number;
    vx: number;
    vy: number;
    kind: ItemKind;
    age: number;
    attracted: boolean;
    value: number;
}

// ─── Enemies / fairies ───

export interface Enemy {
    active: boolean;
    id: number;
    x: number;
    y: number;
    prevX: number;
    prevY: number;
    hp: number;
    maxHp: number;
    radius: number;
    variant: FairyVariant;
    color: BulletColorName;
    age: number;
    lifetime: number; // frames before it leaves
    // simple scripted movement: travel toward (tx,ty) then hold then exit
    enterX: number;
    enterY: number;
    holdFrames: number;
    exitDir: number; // angle to exit
    speed: number;
    fireTimer: number;
    fireInterval: number;
    patternId: PatternId;
    burstCount: number;
    drops: ItemDrop;
    dead: boolean;
    hitFlash: number;
}

export interface ItemDrop {
    power: number;
    point: number;
    life: number;
    bomb: number;
}

// ─── Boss ───

export interface SpellCard {
    name: string;
    /** Fraction of phase HP (0..1) relative to boss max for this card. */
    hp: number;
    timeLimit: number; // seconds
    pattern: PatternId;
    isSpell: boolean; // false = non-spell attack
    bonus: number;
}

export interface BossState {
    active: boolean;
    x: number;
    y: number;
    prevX: number;
    prevY: number;
    targetX: number;
    targetY: number;
    hp: number;
    phaseMaxHp: number;
    phaseIndex: number;
    phaseStartFrame: number;
    timeLeftFrames: number;
    themeIndex: number;
    cards: SpellCard[];
    defeated: boolean;
    introFrames: number; // entrance grace
    moveTimer: number;
    fireTimer: number;
    subTimer: number;
    hitFlash: number;
    name: string;
}

// ─── Pattern ids (data-driven emitters) ───

export type PatternId = string;

// ─── Players ───

export interface PlayerShip {
    slot: number;
    userId: string;
    name: string;
    charId: PlayerId;
    present: boolean; // occupies a slot
    joined: boolean; // active in the current run
    x: number;
    y: number;
    lives: number;
    bombs: number;
    power: number;
    graze: number;
    score: number;
    pointItems: number;
    hitboxR: number;
    invuln: number;
    deathbombWindow: number;
    bombActive: number; // frames of active bomb (invuln + clear)
    dead: boolean;
    respawnTimer: number;
    focus: boolean;
    firing: boolean;
    shotCd: number;
    spellMeter: number;
    isLocal: boolean;
    // smoothing for remote ships
    renderX: number;
    renderY: number;
    /** Render position at the end of the previous sim frame (interpolation). */
    prevRenderX: number;
    prevRenderY: number;
    moveDir: number; // -1 left, 0, 1 right (for sprite banking)
    deaths: number;
    spellsCaptured: number;
    animTime: number;
}

// ─── Difficulty tuning ───

export interface DifficultyMul {
    bulletCount: number;
    bulletSpeed: number;
    bossHp: number;
    enemyHp: number;
    enemyDensity: number;
    grazeRadius: number;
    itemPower: number;
    /** Firing cadence multiplier: >1 fires more often, <1 less often. */
    fireRate: number;
    /** Radians of random aim scatter — higher = more forgiving aimed fire. */
    aimError: number;
}

// ─── Visual-only effects (never networked, never affect sim outcome) ───

export interface Effect {
    active: boolean;
    x: number;
    y: number;
    prevX: number;
    prevY: number;
    vx: number;
    vy: number;
    age: number;
    ttl: number;
    kind: 'spark' | 'ring' | 'death' | 'graze' | 'spell' | 'pop';
    color: string;
    size: number;
}

// ─── Input ───

export interface InputFrame {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    shot: boolean;
    bomb: boolean;
    focus: boolean;
}

export const EMPTY_INPUT: InputFrame = {
    up: false,
    down: false,
    left: false,
    right: false,
    shot: false,
    bomb: false,
    focus: false,
};
