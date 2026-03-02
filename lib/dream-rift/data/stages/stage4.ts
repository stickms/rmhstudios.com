/**
 * Stage 4 — Mirror Palace
 *
 * An infinite palace of shattered mirrors reflecting impossible geometries.
 * Every pattern has a symmetric counterpart — bullets fly in mirrored arcs,
 * reflected angles, and paired formations. The player must read both halves
 * of every attack simultaneously.
 *
 * Mid-boss: The Reflection — a mirror copy of the player.
 * Boss: Spectra, Queen of Shattered Glass — sovereign of reflections.
 */

import type { StageDef, Boss, WaveDef } from '../../types';
import { PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT } from '../../constants';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PW = PLAYFIELD_WIDTH;
const PH = PLAYFIELD_HEIGHT;
const CX = PW / 2;

// ---------------------------------------------------------------------------
// Wave definitions — first half
// ---------------------------------------------------------------------------

const waves1: WaveDef[] = [
  // Wave 1: Mirror wisps in symmetric pairs
  {
    delay: 60,
    enemies: [
      {
        type: 'mirror_wisp', x: CX - 100, y: -16, delay: 0, hp: 100,
        patterns: [
          {
            type: 'radial', bulletSprite: 'bullet-cyan', count: 6,
            speed: 2.0, angle: 0, spread: 180, interval: 50, duration: 300,
          },
        ],
        path: [{ x: CX - 100, y: 100 }, { x: CX - 60, y: 140 }, { x: CX - 100, y: -16 }],
        dropTable: [{ type: 'power', chance: 0.5, count: 2 }],
      },
      {
        type: 'mirror_wisp', x: CX + 100, y: -16, delay: 0, hp: 100,
        patterns: [
          {
            type: 'radial', bulletSprite: 'bullet-cyan', count: 6,
            speed: 2.0, angle: 180, spread: 180, interval: 50, duration: 300,
          },
        ],
        path: [{ x: CX + 100, y: 100 }, { x: CX + 60, y: 140 }, { x: CX + 100, y: -16 }],
        dropTable: [{ type: 'point', chance: 0.6, count: 2 }],
      },
    ],
  },

  // Wave 2: Reflection shards sweeping with curving bullets
  {
    delay: 200,
    enemies: Array.from({ length: 6 }, (_, i) => ({
      type: 'reflection_shard' as const,
      x: i < 3 ? -16 : PW + 16,
      y: 60 + (i % 3) * 40,
      delay: (i % 3) * 15,
      hp: 70,
      patterns: [{
        type: 'aimed' as const, bulletSprite: 'bullet-white', count: 4,
        speed: 3.0, angle: 90, spread: 20, interval: 40, duration: 200,
        modifiers: [{ type: 'curve' as const, value: i < 3 ? 2.0 : -2.0 }],
      }],
      path: i < 3
        ? [{ x: 80, y: 60 + (i % 3) * 40 }, { x: PW - 80, y: 80 + (i % 3) * 40 }, { x: PW + 16, y: 60 + (i % 3) * 40 }]
        : [{ x: PW - 80, y: 60 + (i % 3) * 40 }, { x: 80, y: 80 + (i % 3) * 40 }, { x: -16, y: 60 + (i % 3) * 40 }],
      dropTable: [{ type: 'point' as const, chance: 0.5, count: 1 }],
    })),
  },

  // Wave 3: Central mirror wisp with flanking wall fairies
  {
    delay: 240,
    enemies: [
      {
        type: 'mirror_wisp', x: CX, y: -16, delay: 0, hp: 120,
        patterns: [
          {
            type: 'radial', bulletSprite: 'bullet-cyan', count: 8,
            speed: 2.0, angle: 45, spread: 180, interval: 40, duration: 300,
          },
          {
            type: 'radial', bulletSprite: 'bullet-cyan', count: 8,
            speed: 2.0, angle: 225, spread: 180, interval: 40, duration: 300,
          },
        ],
        path: [{ x: CX, y: 100 }, { x: CX, y: 100 }, { x: CX, y: -16 }],
        dropTable: [{ type: 'power', chance: 0.8, count: 3 }],
      },
      {
        type: 'fairy_wall', x: CX - 130, y: -16, delay: 30, hp: 80,
        patterns: [{
          type: 'wall', bulletSprite: 'bullet-white', count: 10,
          speed: 1.8, angle: 90, spread: 120, interval: 40, duration: 240,
        }],
        path: [{ x: CX - 130, y: 70 }, { x: CX - 130, y: 70 }, { x: CX - 130, y: -16 }],
        dropTable: [{ type: 'point', chance: 0.5, count: 2 }],
      },
      {
        type: 'fairy_wall', x: CX + 130, y: -16, delay: 30, hp: 80,
        patterns: [{
          type: 'wall', bulletSprite: 'bullet-white', count: 10,
          speed: 1.8, angle: 90, spread: 120, interval: 40, duration: 240,
        }],
        path: [{ x: CX + 130, y: 70 }, { x: CX + 130, y: 70 }, { x: CX + 130, y: -16 }],
        dropTable: [{ type: 'point', chance: 0.5, count: 2 }],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Mid-boss: The Reflection
// ---------------------------------------------------------------------------

const midBoss: Boss = {
  id: -1,
  position: { x: CX, y: 90 },
  velocity: { x: 0, y: 0 },
  active: true,
  sprite: 'boss-reflection',
  hp: 2000,
  maxHp: 2000,
  type: 'boss',
  patterns: [
    {
      type: 'radial', bulletSprite: 'bullet-cyan', count: 14,
      speed: 2.0, angle: 0, spread: 360, interval: 35, duration: 2400,
      modifiers: [{ type: 'rotate', value: 3 }],
    },
  ],
  currentPatternIndex: 0,
  patternTimer: 0,
  dropTable: [
    { type: 'power', chance: 1.0, count: 14 },
    { type: 'point', chance: 1.0, count: 12 },
    { type: 'bomb', chance: 1.0, count: 1 },
  ],
  name: 'The Reflection',
  spellCards: [
    {
      name: 'Mirror Sign "Perfect Symmetry"',
      hp: 1000,
      timeLimit: 2100, // 35s
      captureBonus: 1_200_000,
      patterns: [
        {
          type: 'radial', bulletSprite: 'bullet-cyan', count: 10,
          speed: 2.0, angle: 0, spread: 180, interval: 30, duration: 2100,
          modifiers: [{ type: 'rotate', value: 3 }],
        },
        {
          type: 'radial', bulletSprite: 'bullet-cyan', count: 10,
          speed: 2.0, angle: 180, spread: 180, interval: 30, duration: 2100,
          modifiers: [{ type: 'rotate', value: -3 }],
        },
      ],
    },
    {
      name: 'Glass Sign "Fracturing Image"',
      hp: 1000,
      timeLimit: 2400, // 40s
      captureBonus: 1_500_000,
      patterns: [
        {
          type: 'aimed', bulletSprite: 'bullet-white', count: 6,
          speed: 3.0, angle: 90, spread: 45, interval: 30, duration: 2400,
          modifiers: [{ type: 'curve', value: 3.0 }],
        },
        {
          type: 'aimed', bulletSprite: 'bullet-white', count: 6,
          speed: 3.0, angle: 90, spread: 45, interval: 30, duration: 2400,
          modifiers: [{ type: 'curve', value: -3.0 }],
        },
        {
          type: 'radial', bulletSprite: 'bullet-cyan', count: 12,
          speed: 1.5, angle: 0, spread: 360, interval: 45, duration: 2400,
        },
      ],
    },
  ],
  currentSpellIndex: 0,
  phaseHp: [1000, 1000],
  isMidBoss: true,
};

// ---------------------------------------------------------------------------
// Wave definitions — second half
// ---------------------------------------------------------------------------

const waves2: WaveDef[] = [
  // Wave 4: Dense mirrored wisps from top
  {
    delay: 60,
    enemies: Array.from({ length: 4 }, (_, i) => {
      const side = i < 2 ? -1 : 1;
      const row = i % 2;
      return {
        type: 'mirror_wisp' as const,
        x: CX + side * (60 + row * 60),
        y: -16,
        delay: i * 20,
        hp: 100,
        patterns: [{
          type: 'radial' as const, bulletSprite: 'bullet-cyan', count: 8,
          speed: 2.0, angle: side > 0 ? 0 : 180, spread: 180, interval: 40, duration: 300,
          modifiers: [{ type: 'curve' as const, value: side * 1.5 }],
        }],
        path: [
          { x: CX + side * (60 + row * 60), y: 80 + row * 30 },
          { x: CX + side * (60 + row * 60), y: 80 + row * 30 },
          { x: CX + side * (60 + row * 60), y: -16 },
        ],
        dropTable: [
          { type: 'power' as const, chance: 0.5, count: 2 },
          { type: 'point' as const, chance: 0.6, count: 2 },
        ],
      };
    }),
  },

  // Wave 5: Reflection shards + spiral fairy combo
  {
    delay: 200,
    enemies: [
      {
        type: 'fairy_spiral', x: CX, y: -16, delay: 0, hp: 100,
        patterns: [{
          type: 'spiral', bulletSprite: 'bullet-purple', count: 4,
          speed: 2.0, angle: 0, spread: 360, interval: 8, duration: 300,
          modifiers: [{ type: 'rotate', value: 4 }],
        }],
        path: [{ x: CX, y: 110 }, { x: CX, y: 110 }, { x: CX, y: -16 }],
        dropTable: [{ type: 'power', chance: 0.7, count: 3 }],
      },
      {
        type: 'reflection_shard', x: -16, y: 80, delay: 30, hp: 70,
        patterns: [{
          type: 'aimed', bulletSprite: 'bullet-white', count: 5,
          speed: 3.0, angle: 90, spread: 25, interval: 35, duration: 240,
          modifiers: [{ type: 'curve', value: 2.5 }],
        }],
        path: [{ x: 80, y: 80 }, { x: PW - 80, y: 100 }, { x: PW + 16, y: 80 }],
        dropTable: [{ type: 'point', chance: 0.5, count: 1 }],
      },
      {
        type: 'reflection_shard', x: PW + 16, y: 80, delay: 30, hp: 70,
        patterns: [{
          type: 'aimed', bulletSprite: 'bullet-white', count: 5,
          speed: 3.0, angle: 90, spread: 25, interval: 35, duration: 240,
          modifiers: [{ type: 'curve', value: -2.5 }],
        }],
        path: [{ x: PW - 80, y: 80 }, { x: 80, y: 100 }, { x: -16, y: 80 }],
        dropTable: [{ type: 'point', chance: 0.5, count: 1 }],
      },
    ],
  },

  // Wave 6: Full mirror assault
  {
    delay: 240,
    enemies: [
      ...Array.from({ length: 3 }, (_, i) => ({
        type: 'mirror_wisp' as const,
        x: CX - 120 + i * 120,
        y: -16,
        delay: i * 20,
        hp: 100,
        patterns: [
          {
            type: 'radial' as const, bulletSprite: 'bullet-cyan', count: 8,
            speed: 2.2, angle: 0, spread: 360, interval: 35, duration: 300,
            modifiers: [{ type: 'rotate' as const, value: i === 1 ? 0 : (i === 0 ? 3 : -3) }],
          },
        ],
        path: [
          { x: CX - 120 + i * 120, y: 80 },
          { x: CX - 120 + i * 120, y: 80 },
          { x: CX - 120 + i * 120, y: -16 },
        ],
        dropTable: [
          { type: 'power' as const, chance: 0.6, count: 2 },
          { type: 'point' as const, chance: 0.7, count: 2 },
        ],
      })),
    ],
  },

  // Wave 7: Gauntlet of curving shards
  {
    delay: 180,
    enemies: Array.from({ length: 8 }, (_, i) => ({
      type: 'reflection_shard' as const,
      x: i % 2 === 0 ? -16 : PW + 16,
      y: 50 + Math.floor(i / 2) * 30,
      delay: i * 12,
      hp: 70,
      patterns: [{
        type: 'aimed' as const, bulletSprite: 'bullet-white', count: 3,
        speed: 3.2, angle: 90, spread: 15, interval: 35, duration: 180,
        modifiers: [{ type: 'curve' as const, value: i % 2 === 0 ? 2.0 : -2.0 }],
      }],
      path: i % 2 === 0
        ? [{ x: 60, y: 50 + Math.floor(i / 2) * 30 }, { x: PW - 60, y: 60 + Math.floor(i / 2) * 30 }, { x: PW + 16, y: 50 + Math.floor(i / 2) * 30 }]
        : [{ x: PW - 60, y: 50 + Math.floor(i / 2) * 30 }, { x: 60, y: 60 + Math.floor(i / 2) * 30 }, { x: -16, y: 50 + Math.floor(i / 2) * 30 }],
      dropTable: [{ type: 'point' as const, chance: 0.4, count: 1 }],
    })),
  },
];

// ---------------------------------------------------------------------------
// Boss: Spectra, Queen of Shattered Glass
// ---------------------------------------------------------------------------

const boss: Boss = {
  id: -2,
  position: { x: CX, y: 80 },
  velocity: { x: 0, y: 0 },
  active: true,
  sprite: 'boss-spectra',
  hp: 6000,
  maxHp: 6000,
  type: 'boss',
  patterns: [
    {
      type: 'radial', bulletSprite: 'bullet-cyan', count: 16,
      speed: 2.0, angle: 0, spread: 360, interval: 30, duration: 9999,
      modifiers: [{ type: 'rotate', value: 3 }],
    },
  ],
  currentPatternIndex: 0,
  patternTimer: 0,
  dropTable: [
    { type: 'power', chance: 1.0, count: 28 },
    { type: 'point', chance: 1.0, count: 24 },
    { type: 'life', chance: 1.0, count: 1 },
    { type: 'bomb', chance: 1.0, count: 1 },
  ],
  name: 'Spectra, Queen of Shattered Glass',
  spellCards: [
    {
      name: 'Reflection Sign "Twin Crescents"',
      hp: 1500,
      timeLimit: 2400, // 40s
      captureBonus: 1_800_000,
      patterns: [
        {
          type: 'radial', bulletSprite: 'bullet-cyan', count: 12,
          speed: 2.2, angle: 0, spread: 180, interval: 25, duration: 2400,
          modifiers: [{ type: 'rotate', value: 4 }],
        },
        {
          type: 'radial', bulletSprite: 'bullet-cyan', count: 12,
          speed: 2.2, angle: 180, spread: 180, interval: 25, duration: 2400,
          modifiers: [{ type: 'rotate', value: -4 }],
        },
      ],
    },
    {
      name: 'Prism Sign "Kaleidoscope Fracture"',
      hp: 1500,
      timeLimit: 2400, // 40s
      captureBonus: 2_000_000,
      patterns: [
        {
          type: 'spiral', bulletSprite: 'bullet-cyan', count: 6,
          speed: 2.0, angle: 0, spread: 360, interval: 5, duration: 2400,
          modifiers: [{ type: 'rotate', value: 5 }, { type: 'curve', value: 1.5 }],
        },
        {
          type: 'spiral', bulletSprite: 'bullet-white', count: 6,
          speed: 2.0, angle: 30, spread: 360, interval: 5, duration: 2400,
          modifiers: [{ type: 'rotate', value: -5 }, { type: 'curve', value: -1.5 }],
        },
      ],
    },
    {
      name: 'Shard Sign "Infinite Corridor"',
      hp: 1500,
      timeLimit: 3000, // 50s
      captureBonus: 2_500_000,
      patterns: [
        {
          type: 'wall', bulletSprite: 'bullet-white', count: 20,
          speed: 2.0, angle: 90, spread: 160, interval: 20, duration: 3000,
        },
        {
          type: 'aimed', bulletSprite: 'bullet-cyan', count: 6,
          speed: 3.0, angle: 90, spread: 40, interval: 30, duration: 3000,
          modifiers: [{ type: 'curve', value: 2.5 }],
        },
        {
          type: 'aimed', bulletSprite: 'bullet-cyan', count: 6,
          speed: 3.0, angle: 90, spread: 40, interval: 30, duration: 3000,
          modifiers: [{ type: 'curve', value: -2.5 }],
        },
      ],
    },
    {
      name: 'Palace Sign "Hall of a Thousand Reflections"',
      hp: 1500,
      timeLimit: 3000, // 50s
      captureBonus: 3_500_000,
      patterns: [
        {
          type: 'spiral', bulletSprite: 'bullet-cyan', count: 8,
          speed: 1.8, angle: 0, spread: 360, interval: 4, duration: 3000,
          modifiers: [{ type: 'rotate', value: 6 }, { type: 'curve', value: 2.0 }],
        },
        {
          type: 'spiral', bulletSprite: 'bullet-white', count: 8,
          speed: 1.8, angle: 22.5, spread: 360, interval: 4, duration: 3000,
          modifiers: [{ type: 'rotate', value: -6 }, { type: 'curve', value: -2.0 }],
        },
        {
          type: 'radial', bulletSprite: 'bullet-purple', count: 16,
          speed: 1.5, angle: 0, spread: 360, interval: 40, duration: 3000,
        },
      ],
    },
  ],
  currentSpellIndex: 0,
  phaseHp: [1500, 1500, 1500, 1500],
  isMidBoss: false,
};

// ---------------------------------------------------------------------------
// Stage definition
// ---------------------------------------------------------------------------

export const STAGE_4: StageDef = {
  id: 4,
  name: 'Mirror Palace',
  theme: 'mirror',
  bgm: 'bgm-stage4',
  bossBgm: 'bgm-boss4',
  waves1,
  midBoss,
  waves2,
  boss,
};
