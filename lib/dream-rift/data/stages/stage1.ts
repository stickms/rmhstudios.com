/**
 * Stage 1 — Lucid Meadow
 *
 * The first stage of Dream Rift. A gentle dreamscape of soft pastel fields
 * and floating petals. Patterns are simple and slow, introducing the player
 * to the core mechanics of dodging and grazing.
 *
 * Mid-boss: Petal Sprite — a mischievous fairy guardian.
 * Boss: Somnia, Keeper of the First Gate — dreams made gentle.
 */

import type { StageDef, Boss, WaveDef } from '../../types';
import { PLAYFIELD_WIDTH } from '../../constants';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PW = PLAYFIELD_WIDTH;
const CX = PW / 2; // centre X

// ---------------------------------------------------------------------------
// Wave definitions — first half
// ---------------------------------------------------------------------------

const waves1: WaveDef[] = [
  // Wave 1: A gentle line of basic fairies from the right
  {
    delay: 60,
    enemies: [
      {
        type: 'fairy_basic', x: PW + 16, y: 80, delay: 0, hp: 30,
        patterns: [{
          type: 'aimed', bulletSprite: 'bullet-blue', count: 1,
          speed: 1.8, angle: 90, spread: 0, interval: 90, duration: 240,
        }],
        path: [{ x: PW - 60, y: 80 }, { x: 60, y: 100 }, { x: -16, y: 80 }],
        dropTable: [{ type: 'power', chance: 0.5, count: 1 }],
      },
      {
        type: 'fairy_basic', x: PW + 16, y: 120, delay: 20, hp: 30,
        patterns: [{
          type: 'aimed', bulletSprite: 'bullet-blue', count: 1,
          speed: 1.8, angle: 90, spread: 0, interval: 90, duration: 240,
        }],
        path: [{ x: PW - 80, y: 120 }, { x: 80, y: 140 }, { x: -16, y: 120 }],
        dropTable: [{ type: 'point', chance: 0.6, count: 1 }],
      },
      {
        type: 'fairy_basic', x: PW + 16, y: 100, delay: 40, hp: 30,
        patterns: [{
          type: 'aimed', bulletSprite: 'bullet-blue', count: 1,
          speed: 1.8, angle: 90, spread: 0, interval: 90, duration: 240,
        }],
        path: [{ x: PW - 70, y: 100 }, { x: 70, y: 120 }, { x: -16, y: 100 }],
        dropTable: [{ type: 'power', chance: 0.4, count: 1 }],
      },
    ],
  },

  // Wave 2: Fairies from the left with slightly wider aimed shots
  {
    delay: 180,
    enemies: [
      {
        type: 'fairy_basic', x: -16, y: 90, delay: 0, hp: 30,
        patterns: [{
          type: 'aimed', bulletSprite: 'bullet-blue', count: 2,
          speed: 1.8, angle: 90, spread: 15, interval: 80, duration: 240,
        }],
        path: [{ x: 60, y: 90 }, { x: PW - 60, y: 110 }, { x: PW + 16, y: 90 }],
        dropTable: [{ type: 'point', chance: 0.5, count: 1 }],
      },
      {
        type: 'fairy_basic', x: -16, y: 130, delay: 15, hp: 30,
        patterns: [{
          type: 'aimed', bulletSprite: 'bullet-blue', count: 2,
          speed: 1.8, angle: 90, spread: 15, interval: 80, duration: 240,
        }],
        path: [{ x: 80, y: 130 }, { x: PW - 80, y: 150 }, { x: PW + 16, y: 130 }],
        dropTable: [{ type: 'power', chance: 0.5, count: 1 }],
      },
    ],
  },

  // Wave 3: First radial fairy — a single fairy that hovers and fires a ring
  {
    delay: 240,
    enemies: [
      {
        type: 'fairy_radial', x: CX, y: -16, delay: 0, hp: 60,
        patterns: [{
          type: 'radial', bulletSprite: 'bullet-red', count: 6,
          speed: 1.5, angle: 0, spread: 360, interval: 120, duration: 360,
        }],
        path: [{ x: CX, y: 100 }, { x: CX, y: 100 }, { x: CX, y: -16 }],
        dropTable: [
          { type: 'power', chance: 0.7, count: 2 },
          { type: 'point', chance: 0.8, count: 2 },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Mid-boss: Petal Sprite
// ---------------------------------------------------------------------------

const midBoss: Boss = {
  id: -1,
  position: { x: CX, y: 100 },
  velocity: { x: 0, y: 0 },
  active: true,
  sprite: 'boss-petal-sprite',
  hp: 600,
  maxHp: 600,
  type: 'boss',
  patterns: [
    {
      type: 'radial', bulletSprite: 'bullet-red', count: 8,
      speed: 1.6, angle: 0, spread: 360, interval: 60, duration: 600,
    },
  ],
  currentPatternIndex: 0,
  patternTimer: 0,
  dropTable: [
    { type: 'power', chance: 1.0, count: 8 },
    { type: 'point', chance: 1.0, count: 6 },
    { type: 'bomb', chance: 0.5, count: 1 },
  ],
  name: 'Petal Sprite',
  spellCards: [
    {
      name: 'Bloom Sign "Scattering Petals"',
      hp: 600,
      timeLimit: 1800, // 30 seconds
      captureBonus: 500_000,
      patterns: [
        {
          type: 'radial', bulletSprite: 'bullet-red', count: 10,
          speed: 1.6, angle: 0, spread: 360, interval: 50, duration: 1800,
        },
        {
          type: 'aimed', bulletSprite: 'bullet-blue', count: 2,
          speed: 2.0, angle: 90, spread: 20, interval: 80, duration: 1800,
        },
      ],
    },
  ],
  currentSpellIndex: 0,
  phaseHp: [600],
  isMidBoss: true,
};

// ---------------------------------------------------------------------------
// Wave definitions — second half (slightly harder)
// ---------------------------------------------------------------------------

const waves2: WaveDef[] = [
  // Wave 4: Mixed basic and radial fairies from both sides
  {
    delay: 60,
    enemies: [
      {
        type: 'fairy_basic', x: -16, y: 70, delay: 0, hp: 30,
        patterns: [{
          type: 'aimed', bulletSprite: 'bullet-blue', count: 2,
          speed: 2.0, angle: 90, spread: 20, interval: 70, duration: 240,
        }],
        path: [{ x: 100, y: 70 }, { x: CX, y: 90 }, { x: PW + 16, y: 70 }],
        dropTable: [{ type: 'point', chance: 0.5, count: 1 }],
      },
      {
        type: 'fairy_radial', x: PW + 16, y: 70, delay: 0, hp: 60,
        patterns: [{
          type: 'radial', bulletSprite: 'bullet-red', count: 8,
          speed: 1.5, angle: 0, spread: 360, interval: 80, duration: 300,
        }],
        path: [{ x: PW - 100, y: 70 }, { x: CX, y: 90 }, { x: -16, y: 70 }],
        dropTable: [{ type: 'power', chance: 0.6, count: 2 }],
      },
    ],
  },

  // Wave 5: V-formation of basic fairies
  {
    delay: 180,
    enemies: Array.from({ length: 5 }, (_, i) => ({
      type: 'fairy_basic' as const,
      x: CX - 80 + i * 40,
      y: -16,
      delay: i * 10,
      hp: 30,
      patterns: [{
        type: 'aimed' as const, bulletSprite: 'bullet-blue', count: 1,
        speed: 2.0, angle: 90, spread: 0, interval: 60, duration: 240,
      }],
      path: [
        { x: CX - 80 + i * 40, y: 80 + Math.abs(i - 2) * 20 },
        { x: CX - 80 + i * 40, y: 80 + Math.abs(i - 2) * 20 },
        { x: CX - 80 + i * 40, y: -16 },
      ],
      dropTable: [{ type: 'point' as const, chance: 0.5, count: 1 }],
    })),
  },

  // Wave 6: Two radial fairies that cross paths
  {
    delay: 240,
    enemies: [
      {
        type: 'fairy_radial', x: 60, y: -16, delay: 0, hp: 60,
        patterns: [{
          type: 'radial', bulletSprite: 'bullet-red', count: 8,
          speed: 1.6, angle: 0, spread: 360, interval: 70, duration: 300,
        }],
        path: [{ x: 60, y: 100 }, { x: PW - 60, y: 120 }, { x: PW - 60, y: -16 }],
        dropTable: [{ type: 'power', chance: 0.6, count: 2 }],
      },
      {
        type: 'fairy_radial', x: PW - 60, y: -16, delay: 30, hp: 60,
        patterns: [{
          type: 'radial', bulletSprite: 'bullet-red', count: 8,
          speed: 1.6, angle: 0, spread: 360, interval: 70, duration: 300,
        }],
        path: [{ x: PW - 60, y: 100 }, { x: 60, y: 120 }, { x: 60, y: -16 }],
        dropTable: [{ type: 'point', chance: 0.8, count: 2 }],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Boss: Somnia, Keeper of the First Gate
// ---------------------------------------------------------------------------

const boss: Boss = {
  id: -2,
  position: { x: CX, y: 80 },
  velocity: { x: 0, y: 0 },
  active: true,
  sprite: 'boss-somnia',
  hp: 2400,
  maxHp: 2400,
  type: 'boss',
  patterns: [
    {
      type: 'radial', bulletSprite: 'bullet-red', count: 12,
      speed: 1.8, angle: 0, spread: 360, interval: 50, duration: 9999,
    },
  ],
  currentPatternIndex: 0,
  patternTimer: 0,
  dropTable: [
    { type: 'power', chance: 1.0, count: 16 },
    { type: 'point', chance: 1.0, count: 12 },
    { type: 'life', chance: 1.0, count: 1 },
  ],
  name: 'Somnia, Keeper of the First Gate',
  spellCards: [
    {
      name: 'Dream Sign "Petal Storm"',
      hp: 1200,
      timeLimit: 2400, // 40 seconds
      captureBonus: 1_000_000,
      patterns: [
        {
          type: 'radial', bulletSprite: 'bullet-red', count: 12,
          speed: 1.8, angle: 0, spread: 360, interval: 50, duration: 2400,
          modifiers: [{ type: 'rotate', value: 2 }],
        },
        {
          type: 'aimed', bulletSprite: 'bullet-blue', count: 3,
          speed: 2.2, angle: 90, spread: 30, interval: 70, duration: 2400,
        },
      ],
    },
    {
      name: 'Meadow Sign "Slumber Cascade"',
      hp: 1200,
      timeLimit: 2400, // 40 seconds
      captureBonus: 1_500_000,
      patterns: [
        {
          type: 'radial', bulletSprite: 'bullet-purple', count: 16,
          speed: 1.5, angle: 0, spread: 360, interval: 40, duration: 2400,
          modifiers: [{ type: 'rotate', value: -3 }],
        },
        {
          type: 'radial', bulletSprite: 'bullet-blue', count: 16,
          speed: 1.5, angle: 22.5, spread: 360, interval: 40, duration: 2400,
          modifiers: [{ type: 'rotate', value: 3 }],
        },
      ],
    },
  ],
  currentSpellIndex: 0,
  phaseHp: [1200, 1200],
  isMidBoss: false,
};

// ---------------------------------------------------------------------------
// Stage definition
// ---------------------------------------------------------------------------

export const STAGE_1: StageDef = {
  id: 1,
  name: 'Lucid Meadow',
  theme: 'meadow',
  bgm: 'bgm-stage1',
  bossBgm: 'bgm-boss1',
  waves1,
  midBoss,
  waves2,
  boss,
};
