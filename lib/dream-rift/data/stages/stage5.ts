/**
 * Stage 5 — Burning Carnival
 *
 * A nightmarish carnival ablaze with neon fire and manic laughter. The dream
 * is fracturing — reality warps at the edges. Patterns are chaotic with
 * overlapping layers, erratic spawns, and aggressive tracking. Flame dancers
 * and carnival puppets attack from all directions simultaneously.
 *
 * Mid-boss: The Ringmaster — master of the burning ring.
 * Boss: Ignis, the Laughing Flame — the carnival's living inferno.
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
  // Wave 1: Flame dancers from both sides simultaneously
  {
    delay: 45,
    enemies: [
      {
        type: 'flame_dancer', x: -16, y: 80, delay: 0, hp: 150,
        patterns: [
          {
            type: 'radial', bulletSprite: 'bullet-orange', count: 14,
            speed: 1.8, angle: 0, spread: 360, interval: 35, duration: 300,
            modifiers: [{ type: 'rotate', value: 5 }],
          },
          {
            type: 'aimed', bulletSprite: 'bullet-red', count: 3,
            speed: 3.0, angle: 90, spread: 20, interval: 30, duration: 300,
          },
        ],
        path: [{ x: 100, y: 80 }, { x: CX - 40, y: 120 }, { x: -16, y: 80 }],
        dropTable: [{ type: 'power', chance: 0.6, count: 3 }],
      },
      {
        type: 'flame_dancer', x: PW + 16, y: 80, delay: 0, hp: 150,
        patterns: [
          {
            type: 'radial', bulletSprite: 'bullet-orange', count: 14,
            speed: 1.8, angle: 0, spread: 360, interval: 35, duration: 300,
            modifiers: [{ type: 'rotate', value: -5 }],
          },
          {
            type: 'aimed', bulletSprite: 'bullet-red', count: 3,
            speed: 3.0, angle: 90, spread: 20, interval: 30, duration: 300,
          },
        ],
        path: [{ x: PW - 100, y: 80 }, { x: CX + 40, y: 120 }, { x: PW + 16, y: 80 }],
        dropTable: [{ type: 'point', chance: 0.7, count: 3 }],
      },
    ],
  },

  // Wave 2: Carnival puppets in chaotic stagger
  {
    delay: 180,
    enemies: Array.from({ length: 6 }, (_, i) => ({
      type: 'carnival_puppet' as const,
      x: 30 + (i * 64) + (i % 2 === 0 ? 0 : 20),
      y: -16,
      delay: i * 12,
      hp: 110,
      patterns: [{
        type: 'stream' as const, bulletSprite: 'bullet-yellow', count: 5,
        speed: 2.5, angle: 90, spread: 60, interval: 15, duration: 200,
        modifiers: [{ type: 'delay' as const, value: 0, delay: 60 }],
      }],
      path: [
        { x: 30 + (i * 64) + (i % 2 === 0 ? 0 : 20), y: 60 + (i % 3) * 20 },
        { x: 30 + (i * 64) + (i % 2 === 0 ? 20 : -20), y: 160 },
        { x: 30 + (i * 64) + (i % 2 === 0 ? 0 : 20), y: PH + 16 },
      ],
      dropTable: [{ type: 'power' as const, chance: 0.4, count: 2 }],
    })),
  },

  // Wave 3: Mixed flame + puppet chaos
  {
    delay: 200,
    enemies: [
      {
        type: 'flame_dancer', x: CX, y: -16, delay: 0, hp: 150,
        patterns: [
          {
            type: 'radial', bulletSprite: 'bullet-red', count: 18,
            speed: 1.6, angle: 0, spread: 360, interval: 30, duration: 360,
            modifiers: [{ type: 'rotate', value: 4 }],
          },
        ],
        path: [{ x: CX, y: 100 }, { x: CX, y: 100 }, { x: CX, y: -16 }],
        dropTable: [{ type: 'power', chance: 0.8, count: 4 }],
      },
      {
        type: 'carnival_puppet', x: -16, y: 60, delay: 30, hp: 110,
        patterns: [{
          type: 'aimed', bulletSprite: 'bullet-yellow', count: 6,
          speed: 2.8, angle: 90, spread: 50, interval: 20, duration: 240,
        }],
        path: [{ x: 80, y: 60 }, { x: PW - 80, y: 80 }, { x: PW + 16, y: 60 }],
        dropTable: [{ type: 'point', chance: 0.5, count: 2 }],
      },
      {
        type: 'carnival_puppet', x: PW + 16, y: 140, delay: 30, hp: 110,
        patterns: [{
          type: 'aimed', bulletSprite: 'bullet-yellow', count: 6,
          speed: 2.8, angle: 90, spread: 50, interval: 20, duration: 240,
        }],
        path: [{ x: PW - 80, y: 140 }, { x: 80, y: 120 }, { x: -16, y: 140 }],
        dropTable: [{ type: 'point', chance: 0.5, count: 2 }],
      },
    ],
  },

  // Wave 4: Dense overlapping puppet rain
  {
    delay: 180,
    enemies: Array.from({ length: 8 }, (_, i) => ({
      type: 'carnival_puppet' as const,
      x: 24 + i * 48,
      y: -16,
      delay: i * 8,
      hp: 110,
      patterns: [{
        type: 'radial' as const, bulletSprite: 'bullet-orange', count: 6,
        speed: 2.0, angle: 0, spread: 360, interval: 50, duration: 200,
      }],
      path: [
        { x: 24 + i * 48, y: 50 + (i % 2) * 30 },
        { x: 24 + i * 48, y: 180 },
        { x: 24 + i * 48, y: PH + 16 },
      ],
      dropTable: [{ type: 'point' as const, chance: 0.4, count: 1 }],
    })),
  },
];

// ---------------------------------------------------------------------------
// Mid-boss: The Ringmaster
// ---------------------------------------------------------------------------

const midBoss: Boss = {
  id: -1,
  position: { x: CX, y: 90 },
  velocity: { x: 0, y: 0 },
  active: true,
  sprite: 'boss-ringmaster',
  hp: 2500,
  maxHp: 2500,
  type: 'boss',
  patterns: [
    {
      type: 'radial', bulletSprite: 'bullet-orange', count: 18,
      speed: 2.0, angle: 0, spread: 360, interval: 25, duration: 2400,
      modifiers: [{ type: 'rotate', value: 5 }],
    },
  ],
  currentPatternIndex: 0,
  patternTimer: 0,
  dropTable: [
    { type: 'power', chance: 1.0, count: 16 },
    { type: 'point', chance: 1.0, count: 14 },
    { type: 'bomb', chance: 1.0, count: 1 },
  ],
  name: 'The Ringmaster',
  spellCards: [
    {
      name: 'Flame Sign "Ring of Fire"',
      hp: 850,
      timeLimit: 2100, // 35s
      captureBonus: 1_500_000,
      patterns: [
        {
          type: 'radial', bulletSprite: 'bullet-red', count: 20,
          speed: 2.0, angle: 0, spread: 360, interval: 20, duration: 2100,
          modifiers: [{ type: 'rotate', value: 6 }],
        },
        {
          type: 'aimed', bulletSprite: 'bullet-orange', count: 4,
          speed: 3.0, angle: 90, spread: 30, interval: 35, duration: 2100,
        },
      ],
    },
    {
      name: 'Carnival Sign "Manic Juggle"',
      hp: 850,
      timeLimit: 2400, // 40s
      captureBonus: 1_800_000,
      patterns: [
        {
          type: 'spiral', bulletSprite: 'bullet-orange', count: 5,
          speed: 2.2, angle: 0, spread: 360, interval: 6, duration: 2400,
          modifiers: [{ type: 'rotate', value: 7 }],
        },
        {
          type: 'spiral', bulletSprite: 'bullet-yellow', count: 5,
          speed: 2.2, angle: 36, spread: 360, interval: 6, duration: 2400,
          modifiers: [{ type: 'rotate', value: -7 }],
        },
        {
          type: 'aimed', bulletSprite: 'bullet-red', count: 3,
          speed: 3.5, angle: 90, spread: 15, interval: 40, duration: 2400,
        },
      ],
    },
    {
      name: 'Chaos Sign "Tent of Madness"',
      hp: 800,
      timeLimit: 2400, // 40s
      captureBonus: 2_000_000,
      patterns: [
        {
          type: 'radial', bulletSprite: 'bullet-red', count: 24,
          speed: 1.8, angle: 0, spread: 360, interval: 15, duration: 2400,
          modifiers: [{ type: 'rotate', value: 8 }],
        },
        {
          type: 'wall', bulletSprite: 'bullet-orange', count: 16,
          speed: 2.5, angle: 90, spread: 170, interval: 25, duration: 2400,
        },
      ],
    },
  ],
  currentSpellIndex: 0,
  phaseHp: [850, 850, 800],
  isMidBoss: true,
};

// ---------------------------------------------------------------------------
// Wave definitions — second half
// ---------------------------------------------------------------------------

const waves2: WaveDef[] = [
  // Wave 5: Flame dancers in triple formation
  {
    delay: 60,
    enemies: Array.from({ length: 3 }, (_, i) => ({
      type: 'flame_dancer' as const,
      x: 80 + i * 112,
      y: -16,
      delay: i * 15,
      hp: 150,
      patterns: [
        {
          type: 'radial' as const, bulletSprite: 'bullet-orange', count: 16,
          speed: 2.0, angle: 0, spread: 360, interval: 30, duration: 300,
          modifiers: [{ type: 'rotate' as const, value: i === 1 ? 0 : (i === 0 ? 5 : -5) }],
        },
        {
          type: 'aimed' as const, bulletSprite: 'bullet-red', count: 4,
          speed: 3.0, angle: 90, spread: 25, interval: 25, duration: 300,
        },
      ],
      path: [
        { x: 80 + i * 112, y: 80 },
        { x: 80 + i * 112, y: 80 },
        { x: 80 + i * 112, y: -16 },
      ],
      dropTable: [
        { type: 'power' as const, chance: 0.6, count: 3 },
        { type: 'point' as const, chance: 0.7, count: 3 },
      ],
    })),
  },

  // Wave 6: Alternating puppet and wall fairy assault
  {
    delay: 200,
    enemies: [
      ...Array.from({ length: 4 }, (_, i) => ({
        type: 'carnival_puppet' as const,
        x: i % 2 === 0 ? -16 : PW + 16,
        y: 60 + Math.floor(i / 2) * 50,
        delay: i * 15,
        hp: 110,
        patterns: [{
          type: 'aimed' as const, bulletSprite: 'bullet-yellow', count: 7,
          speed: 3.0, angle: 90, spread: 55, interval: 18, duration: 200,
        }],
        path: i % 2 === 0
          ? [{ x: 80, y: 60 + Math.floor(i / 2) * 50 }, { x: PW - 80, y: 70 + Math.floor(i / 2) * 50 }, { x: PW + 16, y: 60 + Math.floor(i / 2) * 50 }]
          : [{ x: PW - 80, y: 60 + Math.floor(i / 2) * 50 }, { x: 80, y: 70 + Math.floor(i / 2) * 50 }, { x: -16, y: 60 + Math.floor(i / 2) * 50 }],
        dropTable: [{ type: 'point' as const, chance: 0.4, count: 2 }],
      })),
      {
        type: 'fairy_wall' as const, x: CX, y: -16, delay: 40, hp: 80,
        patterns: [{
          type: 'wall' as const, bulletSprite: 'bullet-red', count: 20,
          speed: 2.0, angle: 90, spread: 170, interval: 25, duration: 240,
        }],
        path: [{ x: CX, y: 50 }, { x: CX, y: 50 }, { x: CX, y: -16 }],
        dropTable: [{ type: 'power' as const, chance: 0.7, count: 3 }],
      },
    ],
  },

  // Wave 7: Dense flame + puppet layered chaos
  {
    delay: 200,
    enemies: [
      {
        type: 'flame_dancer', x: CX - 80, y: -16, delay: 0, hp: 150,
        patterns: [{
          type: 'spiral', bulletSprite: 'bullet-red', count: 4,
          speed: 2.0, angle: 0, spread: 360, interval: 8, duration: 300,
          modifiers: [{ type: 'rotate', value: 6 }],
        }],
        path: [{ x: CX - 80, y: 90 }, { x: CX - 80, y: 90 }, { x: CX - 80, y: -16 }],
        dropTable: [{ type: 'power', chance: 0.7, count: 3 }],
      },
      {
        type: 'flame_dancer', x: CX + 80, y: -16, delay: 0, hp: 150,
        patterns: [{
          type: 'spiral', bulletSprite: 'bullet-orange', count: 4,
          speed: 2.0, angle: 45, spread: 360, interval: 8, duration: 300,
          modifiers: [{ type: 'rotate', value: -6 }],
        }],
        path: [{ x: CX + 80, y: 90 }, { x: CX + 80, y: 90 }, { x: CX + 80, y: -16 }],
        dropTable: [{ type: 'point', chance: 0.8, count: 3 }],
      },
      ...Array.from({ length: 4 }, (_, i) => ({
        type: 'carnival_puppet' as const,
        x: 48 + i * 96,
        y: -16,
        delay: 30 + i * 10,
        hp: 110,
        patterns: [{
          type: 'aimed' as const, bulletSprite: 'bullet-yellow', count: 5,
          speed: 2.8, angle: 90, spread: 45, interval: 20, duration: 200,
        }],
        path: [
          { x: 48 + i * 96, y: 60 },
          { x: 48 + i * 96, y: 180 },
          { x: 48 + i * 96, y: PH + 16 },
        ],
        dropTable: [{ type: 'point' as const, chance: 0.4, count: 2 }],
      })),
    ],
  },
];

// ---------------------------------------------------------------------------
// Boss: Ignis, the Laughing Flame
// ---------------------------------------------------------------------------

const boss: Boss = {
  id: -2,
  position: { x: CX, y: 80 },
  velocity: { x: 0, y: 0 },
  active: true,
  sprite: 'boss-ignis',
  hp: 7500,
  maxHp: 7500,
  type: 'boss',
  patterns: [
    {
      type: 'radial', bulletSprite: 'bullet-red', count: 20,
      speed: 2.0, angle: 0, spread: 360, interval: 25, duration: 9999,
      modifiers: [{ type: 'rotate', value: 5 }],
    },
  ],
  currentPatternIndex: 0,
  patternTimer: 0,
  dropTable: [
    { type: 'power', chance: 1.0, count: 32 },
    { type: 'point', chance: 1.0, count: 28 },
    { type: 'life', chance: 1.0, count: 1 },
    { type: 'bomb', chance: 1.0, count: 1 },
  ],
  name: 'Ignis, the Laughing Flame',
  spellCards: [
    {
      name: 'Blaze Sign "Ember Waltz"',
      hp: 1500,
      timeLimit: 2400, // 40s
      captureBonus: 2_000_000,
      patterns: [
        {
          type: 'spiral', bulletSprite: 'bullet-red', count: 6,
          speed: 2.0, angle: 0, spread: 360, interval: 5, duration: 2400,
          modifiers: [{ type: 'rotate', value: 5 }],
        },
        {
          type: 'spiral', bulletSprite: 'bullet-orange', count: 6,
          speed: 2.0, angle: 30, spread: 360, interval: 5, duration: 2400,
          modifiers: [{ type: 'rotate', value: -5 }],
        },
      ],
    },
    {
      name: 'Inferno Sign "Laughing Firestorm"',
      hp: 1500,
      timeLimit: 2400, // 40s
      captureBonus: 2_500_000,
      patterns: [
        {
          type: 'radial', bulletSprite: 'bullet-red', count: 24,
          speed: 2.2, angle: 0, spread: 360, interval: 18, duration: 2400,
          modifiers: [{ type: 'rotate', value: 6 }],
        },
        {
          type: 'aimed', bulletSprite: 'bullet-orange', count: 5,
          speed: 3.5, angle: 90, spread: 35, interval: 25, duration: 2400,
        },
        {
          type: 'wall', bulletSprite: 'bullet-yellow', count: 14,
          speed: 2.0, angle: 90, spread: 160, interval: 35, duration: 2400,
        },
      ],
    },
    {
      name: 'Carnival Sign "Wheel of Misfortune"',
      hp: 1500,
      timeLimit: 3000, // 50s
      captureBonus: 3_000_000,
      patterns: [
        {
          type: 'spiral', bulletSprite: 'bullet-orange', count: 8,
          speed: 1.8, angle: 0, spread: 360, interval: 4, duration: 3000,
          modifiers: [
            { type: 'rotate', value: 8 },
            { type: 'accelerate', value: 0.5, delay: 20 },
          ],
        },
        {
          type: 'aimed', bulletSprite: 'bullet-red', count: 4,
          speed: 3.0, angle: 90, spread: 25, interval: 30, duration: 3000,
        },
      ],
    },
    {
      name: 'Nightmare Sign "Burning Big Top"',
      hp: 1500,
      timeLimit: 3000, // 50s
      captureBonus: 3_500_000,
      patterns: [
        {
          type: 'radial', bulletSprite: 'bullet-red', count: 28,
          speed: 1.8, angle: 0, spread: 360, interval: 12, duration: 3000,
          modifiers: [{ type: 'rotate', value: 7 }],
        },
        {
          type: 'radial', bulletSprite: 'bullet-orange', count: 28,
          speed: 1.8, angle: 6.4, spread: 360, interval: 12, duration: 3000,
          modifiers: [{ type: 'rotate', value: -7 }],
        },
        {
          type: 'aimed', bulletSprite: 'bullet-yellow', count: 6,
          speed: 3.5, angle: 90, spread: 45, interval: 20, duration: 3000,
        },
      ],
    },
    {
      name: 'Last Word "Ashes of Laughter"',
      hp: 1500,
      timeLimit: 3600, // 60s
      captureBonus: 5_000_000,
      patterns: [
        {
          type: 'spiral', bulletSprite: 'bullet-red', count: 7,
          speed: 2.0, angle: 0, spread: 360, interval: 3, duration: 3600,
          modifiers: [{ type: 'rotate', value: 9 }, { type: 'accelerate', value: 0.3, delay: 25 }],
        },
        {
          type: 'spiral', bulletSprite: 'bullet-orange', count: 7,
          speed: 2.0, angle: 25.7, spread: 360, interval: 3, duration: 3600,
          modifiers: [{ type: 'rotate', value: -9 }, { type: 'accelerate', value: 0.3, delay: 25 }],
        },
        {
          type: 'wall', bulletSprite: 'bullet-yellow', count: 18,
          speed: 2.2, angle: 90, spread: 170, interval: 20, duration: 3600,
        },
        {
          type: 'aimed', bulletSprite: 'bullet-red', count: 5,
          speed: 3.5, angle: 90, spread: 30, interval: 25, duration: 3600,
        },
      ],
    },
  ],
  currentSpellIndex: 0,
  phaseHp: [1500, 1500, 1500, 1500, 1500],
  isMidBoss: false,
};

// ---------------------------------------------------------------------------
// Stage definition
// ---------------------------------------------------------------------------

export const STAGE_5: StageDef = {
  id: 5,
  name: 'Burning Carnival',
  theme: 'carnival',
  bgm: 'bgm-stage5',
  bossBgm: 'bgm-boss5',
  waves1,
  midBoss,
  waves2,
  boss,
};
