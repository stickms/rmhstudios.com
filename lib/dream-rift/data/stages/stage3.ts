/**
 * Stage 3 — Clockwork Abyss
 *
 * A vast mechanical void of interlocking gears, pendulums, and frozen clocks.
 * Time manipulation is the core theme — bullets accelerate, decelerate, and
 * shift speed mid-flight. Gear drones and spring sentinels patrol the abyss.
 *
 * Mid-boss: Pendulum Knight — a clockwork soldier.
 * Boss: Chronus, the Unwound Hour — master of broken time.
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
  // Wave 1: Gear drones descending in a staggered line
  {
    delay: 60,
    enemies: Array.from({ length: 4 }, (_, i) => ({
      type: 'gear_drone' as const,
      x: 60 + i * 88,
      y: -16,
      delay: i * 25,
      hp: 120,
      patterns: [{
        type: 'radial' as const, bulletSprite: 'bullet-orange', count: 10,
        speed: 2.0, angle: 0, spread: 360, interval: 45, duration: 300,
        modifiers: [{ type: 'accelerate' as const, value: 0.5, delay: 20 }],
      }],
      path: [
        { x: 60 + i * 88, y: 80 },
        { x: 60 + i * 88, y: 160 },
        { x: 60 + i * 88, y: PH + 16 },
      ],
      dropTable: [
        { type: 'power' as const, chance: 0.5, count: 2 },
        { type: 'point' as const, chance: 0.6, count: 2 },
      ],
    })),
  },

  // Wave 2: Spring sentinels from both sides with speed-shifting bullets
  {
    delay: 200,
    enemies: [
      {
        type: 'spring_sentinel', x: -16, y: 70, delay: 0, hp: 90,
        patterns: [{
          type: 'stream', bulletSprite: 'bullet-yellow', count: 3,
          speed: 3.0, angle: 90, spread: 15, interval: 18, duration: 300,
          modifiers: [{ type: 'accelerate', value: -1.2, delay: 25 }],
        }],
        path: [{ x: 80, y: 70 }, { x: PW - 80, y: 90 }, { x: PW + 16, y: 70 }],
        dropTable: [{ type: 'power', chance: 0.5, count: 2 }],
      },
      {
        type: 'spring_sentinel', x: PW + 16, y: 120, delay: 30, hp: 90,
        patterns: [{
          type: 'stream', bulletSprite: 'bullet-yellow', count: 3,
          speed: 3.0, angle: 90, spread: 15, interval: 18, duration: 300,
          modifiers: [{ type: 'accelerate', value: -1.2, delay: 25 }],
        }],
        path: [{ x: PW - 80, y: 120 }, { x: 80, y: 140 }, { x: -16, y: 120 }],
        dropTable: [{ type: 'point', chance: 0.6, count: 2 }],
      },
    ],
  },

  // Wave 3: Wall fairies + gear drones — first wall pattern introduction
  {
    delay: 240,
    enemies: [
      {
        type: 'fairy_wall', x: CX, y: -16, delay: 0, hp: 80,
        patterns: [{
          type: 'wall', bulletSprite: 'bullet-yellow', count: 14,
          speed: 1.8, angle: 90, spread: 170, interval: 40, duration: 240,
        }],
        path: [{ x: CX, y: 60 }, { x: CX, y: 60 }, { x: CX, y: -16 }],
        dropTable: [{ type: 'power', chance: 0.6, count: 2 }],
      },
      {
        type: 'gear_drone', x: CX - 120, y: -16, delay: 30, hp: 120,
        patterns: [{
          type: 'radial', bulletSprite: 'bullet-orange', count: 8,
          speed: 1.8, angle: 0, spread: 360, interval: 50, duration: 240,
          modifiers: [{ type: 'accelerate', value: 0.4, delay: 20 }],
        }],
        path: [{ x: CX - 120, y: 90 }, { x: CX - 120, y: 90 }, { x: CX - 120, y: -16 }],
        dropTable: [{ type: 'point', chance: 0.6, count: 2 }],
      },
      {
        type: 'gear_drone', x: CX + 120, y: -16, delay: 30, hp: 120,
        patterns: [{
          type: 'radial', bulletSprite: 'bullet-orange', count: 8,
          speed: 1.8, angle: 0, spread: 360, interval: 50, duration: 240,
          modifiers: [{ type: 'accelerate', value: 0.4, delay: 20 }],
        }],
        path: [{ x: CX + 120, y: 90 }, { x: CX + 120, y: 90 }, { x: CX + 120, y: -16 }],
        dropTable: [{ type: 'point', chance: 0.6, count: 2 }],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Mid-boss: Pendulum Knight
// ---------------------------------------------------------------------------

const midBoss: Boss = {
  id: -1,
  position: { x: CX, y: 90 },
  velocity: { x: 0, y: 0 },
  active: true,
  sprite: 'boss-pendulum-knight',
  hp: 1500,
  maxHp: 1500,
  type: 'boss',
  patterns: [
    {
      type: 'radial', bulletSprite: 'bullet-orange', count: 12,
      speed: 2.0, angle: 0, spread: 360, interval: 40, duration: 1800,
      modifiers: [{ type: 'accelerate', value: 0.6, delay: 15 }],
    },
  ],
  currentPatternIndex: 0,
  patternTimer: 0,
  dropTable: [
    { type: 'power', chance: 1.0, count: 12 },
    { type: 'point', chance: 1.0, count: 10 },
    { type: 'bomb', chance: 0.8, count: 1 },
  ],
  name: 'Pendulum Knight',
  spellCards: [
    {
      name: 'Time Sign "Pendulum Sweep"',
      hp: 750,
      timeLimit: 1800, // 30s
      captureBonus: 1_000_000,
      patterns: [
        {
          type: 'wall', bulletSprite: 'bullet-orange', count: 18,
          speed: 2.5, angle: 90, spread: 170, interval: 30, duration: 1800,
          modifiers: [{ type: 'accelerate', value: -0.8, delay: 20 }],
        },
        {
          type: 'aimed', bulletSprite: 'bullet-yellow', count: 3,
          speed: 2.5, angle: 90, spread: 25, interval: 50, duration: 1800,
        },
      ],
    },
    {
      name: 'Gear Sign "Grinding Gears"',
      hp: 750,
      timeLimit: 2100, // 35s
      captureBonus: 1_200_000,
      patterns: [
        {
          type: 'radial', bulletSprite: 'bullet-orange', count: 16,
          speed: 1.8, angle: 0, spread: 360, interval: 25, duration: 2100,
          modifiers: [
            { type: 'rotate', value: 5 },
            { type: 'accelerate', value: 0.5, delay: 15 },
          ],
        },
        {
          type: 'radial', bulletSprite: 'bullet-yellow', count: 16,
          speed: 1.8, angle: 11.25, spread: 360, interval: 25, duration: 2100,
          modifiers: [
            { type: 'rotate', value: -5 },
            { type: 'accelerate', value: 0.5, delay: 15 },
          ],
        },
      ],
    },
  ],
  currentSpellIndex: 0,
  phaseHp: [750, 750],
  isMidBoss: true,
};

// ---------------------------------------------------------------------------
// Wave definitions — second half
// ---------------------------------------------------------------------------

const waves2: WaveDef[] = [
  // Wave 4: Dense wall + aimed combo
  {
    delay: 60,
    enemies: [
      {
        type: 'fairy_wall', x: CX - 80, y: -16, delay: 0, hp: 80,
        patterns: [{
          type: 'wall', bulletSprite: 'bullet-yellow', count: 16,
          speed: 2.0, angle: 90, spread: 160, interval: 35, duration: 240,
        }],
        path: [{ x: CX - 80, y: 60 }, { x: CX - 80, y: 60 }, { x: CX - 80, y: -16 }],
        dropTable: [{ type: 'power', chance: 0.5, count: 2 }],
      },
      {
        type: 'fairy_wall', x: CX + 80, y: -16, delay: 20, hp: 80,
        patterns: [{
          type: 'wall', bulletSprite: 'bullet-yellow', count: 16,
          speed: 2.0, angle: 90, spread: 160, interval: 35, duration: 240,
        }],
        path: [{ x: CX + 80, y: 60 }, { x: CX + 80, y: 60 }, { x: CX + 80, y: -16 }],
        dropTable: [{ type: 'point', chance: 0.6, count: 2 }],
      },
      {
        type: 'spring_sentinel', x: CX, y: -16, delay: 40, hp: 90,
        patterns: [{
          type: 'aimed', bulletSprite: 'bullet-orange', count: 5,
          speed: 2.8, angle: 90, spread: 40, interval: 30, duration: 240,
          modifiers: [{ type: 'accelerate', value: -0.6, delay: 20 }],
        }],
        path: [{ x: CX, y: 80 }, { x: CX, y: 80 }, { x: CX, y: -16 }],
        dropTable: [{ type: 'power', chance: 0.7, count: 3 }],
      },
    ],
  },

  // Wave 5: Gear drones in circular formation
  {
    delay: 200,
    enemies: Array.from({ length: 5 }, (_, i) => {
      const angle = (i / 5) * Math.PI * 2;
      const cx = CX + Math.cos(angle) * 100;
      const cy = 120 + Math.sin(angle) * 60;
      return {
        type: 'gear_drone' as const,
        x: cx,
        y: -16,
        delay: i * 15,
        hp: 120,
        patterns: [{
          type: 'radial' as const, bulletSprite: 'bullet-orange', count: 10,
          speed: 1.8, angle: 0, spread: 360, interval: 40, duration: 300,
          modifiers: [{ type: 'accelerate' as const, value: 0.6, delay: 18 }],
        }],
        path: [
          { x: cx, y: cy },
          { x: cx, y: cy },
          { x: cx, y: PH + 16 },
        ],
        dropTable: [
          { type: 'power' as const, chance: 0.5, count: 2 },
          { type: 'point' as const, chance: 0.6, count: 2 },
        ],
      };
    }),
  },

  // Wave 6: Speed-shifting gauntlet
  {
    delay: 240,
    enemies: [
      ...Array.from({ length: 3 }, (_, i) => ({
        type: 'spring_sentinel' as const,
        x: 60 + i * 132,
        y: -16,
        delay: i * 20,
        hp: 90,
        patterns: [{
          type: 'stream' as const, bulletSprite: 'bullet-yellow', count: 4,
          speed: 4.0, angle: 90, spread: 20, interval: 12, duration: 300,
          modifiers: [{ type: 'accelerate' as const, value: -2.0, delay: 15 }],
        }],
        path: [
          { x: 60 + i * 132, y: 70 },
          { x: 60 + i * 132, y: 70 },
          { x: 60 + i * 132, y: -16 },
        ],
        dropTable: [{ type: 'point' as const, chance: 0.5, count: 2 }],
      })),
      {
        type: 'fairy_wall' as const, x: CX, y: -16, delay: 60, hp: 80,
        patterns: [{
          type: 'wall' as const, bulletSprite: 'bullet-orange', count: 18,
          speed: 1.5, angle: 90, spread: 170, interval: 30, duration: 240,
        }],
        path: [{ x: CX, y: 50 }, { x: CX, y: 50 }, { x: CX, y: -16 }],
        dropTable: [{ type: 'power' as const, chance: 0.7, count: 3 }],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Boss: Chronus, the Unwound Hour
// ---------------------------------------------------------------------------

const boss: Boss = {
  id: -2,
  position: { x: CX, y: 80 },
  velocity: { x: 0, y: 0 },
  active: true,
  sprite: 'boss-chronus',
  hp: 5000,
  maxHp: 5000,
  type: 'boss',
  patterns: [
    {
      type: 'radial', bulletSprite: 'bullet-orange', count: 16,
      speed: 2.0, angle: 0, spread: 360, interval: 35, duration: 9999,
      modifiers: [{ type: 'accelerate', value: 0.5, delay: 15 }],
    },
  ],
  currentPatternIndex: 0,
  patternTimer: 0,
  dropTable: [
    { type: 'power', chance: 1.0, count: 24 },
    { type: 'point', chance: 1.0, count: 20 },
    { type: 'life', chance: 1.0, count: 1 },
  ],
  name: 'Chronus, the Unwound Hour',
  spellCards: [
    {
      name: 'Clock Sign "Frozen Second Hand"',
      hp: 1250,
      timeLimit: 2400, // 40s
      captureBonus: 1_500_000,
      patterns: [
        {
          type: 'radial', bulletSprite: 'bullet-orange', count: 20,
          speed: 3.0, angle: 0, spread: 360, interval: 25, duration: 2400,
          modifiers: [{ type: 'accelerate', value: -1.5, delay: 15 }],
        },
        {
          type: 'aimed', bulletSprite: 'bullet-yellow', count: 4,
          speed: 2.5, angle: 90, spread: 30, interval: 45, duration: 2400,
        },
      ],
    },
    {
      name: 'Temporal Sign "Rewinding Spiral"',
      hp: 1250,
      timeLimit: 2400, // 40s
      captureBonus: 1_800_000,
      patterns: [
        {
          type: 'spiral', bulletSprite: 'bullet-yellow', count: 5,
          speed: 2.2, angle: 0, spread: 360, interval: 5, duration: 2400,
          modifiers: [
            { type: 'rotate', value: 6 },
            { type: 'accelerate', value: -0.5, delay: 30 },
          ],
        },
        {
          type: 'spiral', bulletSprite: 'bullet-orange', count: 5,
          speed: 2.2, angle: 36, spread: 360, interval: 5, duration: 2400,
          modifiers: [
            { type: 'rotate', value: -6 },
            { type: 'accelerate', value: -0.5, delay: 30 },
          ],
        },
      ],
    },
    {
      name: 'Abyss Sign "Shattered Hourglass"',
      hp: 1250,
      timeLimit: 3000, // 50s
      captureBonus: 2_500_000,
      patterns: [
        {
          type: 'wall', bulletSprite: 'bullet-orange', count: 24,
          speed: 2.5, angle: 90, spread: 180, interval: 20, duration: 3000,
          modifiers: [{ type: 'accelerate', value: -1.0, delay: 12 }],
        },
        {
          type: 'radial', bulletSprite: 'bullet-yellow', count: 12,
          speed: 1.5, angle: 0, spread: 360, interval: 30, duration: 3000,
          modifiers: [
            { type: 'rotate', value: 4 },
            { type: 'accelerate', value: 1.0, delay: 25 },
          ],
        },
        {
          type: 'aimed', bulletSprite: 'bullet-red', count: 3,
          speed: 3.5, angle: 90, spread: 20, interval: 40, duration: 3000,
        },
      ],
    },
    {
      name: 'Eternity Sign "Time\'s Final Toll"',
      hp: 1250,
      timeLimit: 3000, // 50s
      captureBonus: 3_000_000,
      patterns: [
        {
          type: 'spiral', bulletSprite: 'bullet-orange', count: 6,
          speed: 2.0, angle: 0, spread: 360, interval: 4, duration: 3000,
          modifiers: [
            { type: 'rotate', value: 7 },
            { type: 'accelerate', value: 0.8, delay: 20 },
          ],
        },
        {
          type: 'spiral', bulletSprite: 'bullet-yellow', count: 6,
          speed: 2.0, angle: 30, spread: 360, interval: 4, duration: 3000,
          modifiers: [
            { type: 'rotate', value: -7 },
            { type: 'accelerate', value: 0.8, delay: 20 },
          ],
        },
        {
          type: 'aimed', bulletSprite: 'bullet-red', count: 5,
          speed: 3.0, angle: 90, spread: 35, interval: 35, duration: 3000,
          modifiers: [{ type: 'accelerate', value: -0.5, delay: 20 }],
        },
      ],
    },
  ],
  currentSpellIndex: 0,
  phaseHp: [1250, 1250, 1250, 1250],
  isMidBoss: false,
};

// ---------------------------------------------------------------------------
// Stage definition
// ---------------------------------------------------------------------------

export const STAGE_3: StageDef = {
  id: 3,
  name: 'Clockwork Abyss',
  theme: 'clockwork',
  bgm: 'bgm-stage3',
  bossBgm: 'bgm-boss3',
  waves1,
  midBoss,
  waves2,
  boss,
};
