/**
 * Stage 2 — Drowning Library
 *
 * An endless library submerged in dark ink. Pages flutter through the air
 * and words drip from the ceiling as living ink spirits guard forgotten
 * knowledge. Patterns use ink-splash spreads and page-flutter formations.
 *
 * Mid-boss: The Archivist — a spectral librarian.
 * Boss: Lexica, the Unwritten Word — master of ink and forgotten prose.
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
  // Wave 1: Ink spirits drifting down from above
  {
    delay: 60,
    enemies: [
      {
        type: 'ink_spirit', x: CX - 80, y: -16, delay: 0, hp: 70,
        patterns: [{
          type: 'aimed', bulletSprite: 'bullet-purple', count: 3,
          speed: 1.6, angle: 90, spread: 30, interval: 50, duration: 240,
          modifiers: [{ type: 'split', value: 3, delay: 30 }],
        }],
        path: [{ x: CX - 80, y: 100 }, { x: CX - 60, y: 200 }, { x: CX - 80, y: PH + 16 }],
        dropTable: [{ type: 'power', chance: 0.5, count: 2 }],
      },
      {
        type: 'ink_spirit', x: CX + 80, y: -16, delay: 30, hp: 70,
        patterns: [{
          type: 'aimed', bulletSprite: 'bullet-purple', count: 3,
          speed: 1.6, angle: 90, spread: 30, interval: 50, duration: 240,
          modifiers: [{ type: 'split', value: 3, delay: 30 }],
        }],
        path: [{ x: CX + 80, y: 100 }, { x: CX + 60, y: 200 }, { x: CX + 80, y: PH + 16 }],
        dropTable: [{ type: 'point', chance: 0.6, count: 2 }],
      },
    ],
  },

  // Wave 2: Page phantoms sweep from the sides in crossing lines
  {
    delay: 180,
    enemies: [
      ...Array.from({ length: 4 }, (_, i) => ({
        type: 'page_phantom' as const,
        x: -16,
        y: 60 + i * 30,
        delay: i * 15,
        hp: 50,
        patterns: [{
          type: 'aimed' as const, bulletSprite: 'bullet-white', count: 3,
          speed: 2.2, angle: 90, spread: 25, interval: 60, duration: 200,
        }],
        path: [
          { x: 80, y: 60 + i * 30 },
          { x: PW - 80, y: 80 + i * 30 },
          { x: PW + 16, y: 60 + i * 30 },
        ],
        dropTable: [{ type: 'point' as const, chance: 0.5, count: 1 }],
      })),
    ],
  },

  // Wave 3: Mixed ink spirits with radial fairy support
  {
    delay: 240,
    enemies: [
      {
        type: 'ink_spirit', x: CX, y: -16, delay: 0, hp: 70,
        patterns: [{
          type: 'radial', bulletSprite: 'bullet-purple', count: 8,
          speed: 1.5, angle: 0, spread: 360, interval: 60, duration: 300,
        }],
        path: [{ x: CX, y: 120 }, { x: CX, y: 120 }, { x: CX, y: -16 }],
        dropTable: [{ type: 'power', chance: 0.7, count: 3 }],
      },
      {
        type: 'fairy_radial', x: CX - 100, y: -16, delay: 30, hp: 60,
        patterns: [{
          type: 'radial', bulletSprite: 'bullet-blue', count: 6,
          speed: 1.8, angle: 0, spread: 360, interval: 80, duration: 240,
        }],
        path: [{ x: CX - 100, y: 80 }, { x: CX - 100, y: 80 }, { x: CX - 100, y: -16 }],
        dropTable: [{ type: 'point', chance: 0.6, count: 2 }],
      },
      {
        type: 'fairy_radial', x: CX + 100, y: -16, delay: 30, hp: 60,
        patterns: [{
          type: 'radial', bulletSprite: 'bullet-blue', count: 6,
          speed: 1.8, angle: 0, spread: 360, interval: 80, duration: 240,
        }],
        path: [{ x: CX + 100, y: 80 }, { x: CX + 100, y: 80 }, { x: CX + 100, y: -16 }],
        dropTable: [{ type: 'point', chance: 0.6, count: 2 }],
      },
    ],
  },

  // Wave 4: Dense page phantoms from above
  {
    delay: 180,
    enemies: Array.from({ length: 6 }, (_, i) => ({
      type: 'page_phantom' as const,
      x: 40 + i * 56,
      y: -16,
      delay: i * 12,
      hp: 50,
      patterns: [{
        type: 'aimed' as const, bulletSprite: 'bullet-white', count: 4,
        speed: 2.4, angle: 90, spread: 35, interval: 55, duration: 200,
      }],
      path: [
        { x: 40 + i * 56, y: 60 },
        { x: 40 + i * 56, y: 200 },
        { x: 40 + i * 56, y: PH + 16 },
      ],
      dropTable: [{ type: 'power' as const, chance: 0.4, count: 1 }],
    })),
  },
];

// ---------------------------------------------------------------------------
// Mid-boss: The Archivist
// ---------------------------------------------------------------------------

const midBoss: Boss = {
  id: -1,
  position: { x: CX, y: 90 },
  velocity: { x: 0, y: 0 },
  active: true,
  sprite: 'boss-archivist',
  hp: 1000,
  maxHp: 1000,
  type: 'boss',
  patterns: [
    {
      type: 'radial', bulletSprite: 'bullet-purple', count: 10,
      speed: 1.8, angle: 0, spread: 360, interval: 50, duration: 1800,
    },
  ],
  currentPatternIndex: 0,
  patternTimer: 0,
  dropTable: [
    { type: 'power', chance: 1.0, count: 10 },
    { type: 'point', chance: 1.0, count: 8 },
    { type: 'bomb', chance: 0.8, count: 1 },
  ],
  name: 'The Archivist',
  spellCards: [
    {
      name: 'Ink Sign "Dripping Manuscript"',
      hp: 500,
      timeLimit: 1800, // 30s
      captureBonus: 800_000,
      patterns: [
        {
          type: 'stream', bulletSprite: 'bullet-purple', count: 4,
          speed: 2.0, angle: 90, spread: 40, interval: 12, duration: 1800,
          modifiers: [{ type: 'split', value: 2, delay: 40 }],
        },
      ],
    },
    {
      name: 'Page Sign "Scattered Chapters"',
      hp: 500,
      timeLimit: 1800, // 30s
      captureBonus: 1_000_000,
      patterns: [
        {
          type: 'radial', bulletSprite: 'bullet-white', count: 14,
          speed: 1.5, angle: 0, spread: 360, interval: 35, duration: 1800,
          modifiers: [{ type: 'rotate', value: 4 }],
        },
        {
          type: 'aimed', bulletSprite: 'bullet-purple', count: 3,
          speed: 2.5, angle: 90, spread: 20, interval: 60, duration: 1800,
        },
      ],
    },
  ],
  currentSpellIndex: 0,
  phaseHp: [500, 500],
  isMidBoss: true,
};

// ---------------------------------------------------------------------------
// Wave definitions — second half
// ---------------------------------------------------------------------------

const waves2: WaveDef[] = [
  // Wave 5: Ink spirits from both sides converging
  {
    delay: 60,
    enemies: [
      {
        type: 'ink_spirit', x: -16, y: 80, delay: 0, hp: 70,
        patterns: [{
          type: 'aimed', bulletSprite: 'bullet-purple', count: 4,
          speed: 1.8, angle: 90, spread: 35, interval: 45, duration: 240,
          modifiers: [{ type: 'split', value: 2, delay: 25 }],
        }],
        path: [{ x: CX - 40, y: 120 }, { x: CX + 40, y: 140 }, { x: PW + 16, y: 80 }],
        dropTable: [{ type: 'power', chance: 0.6, count: 2 }],
      },
      {
        type: 'ink_spirit', x: PW + 16, y: 80, delay: 0, hp: 70,
        patterns: [{
          type: 'aimed', bulletSprite: 'bullet-purple', count: 4,
          speed: 1.8, angle: 90, spread: 35, interval: 45, duration: 240,
          modifiers: [{ type: 'split', value: 2, delay: 25 }],
        }],
        path: [{ x: CX + 40, y: 120 }, { x: CX - 40, y: 140 }, { x: -16, y: 80 }],
        dropTable: [{ type: 'point', chance: 0.7, count: 2 }],
      },
    ],
  },

  // Wave 6: Mixed formation — radial fairy centre, page phantoms flanking
  {
    delay: 200,
    enemies: [
      {
        type: 'fairy_radial', x: CX, y: -16, delay: 0, hp: 80,
        patterns: [{
          type: 'radial', bulletSprite: 'bullet-red', count: 10,
          speed: 1.8, angle: 0, spread: 360, interval: 55, duration: 360,
        }],
        path: [{ x: CX, y: 100 }, { x: CX, y: 100 }, { x: CX, y: -16 }],
        dropTable: [{ type: 'power', chance: 0.7, count: 3 }],
      },
      {
        type: 'page_phantom', x: -16, y: 60, delay: 20, hp: 50,
        patterns: [{
          type: 'aimed', bulletSprite: 'bullet-white', count: 5,
          speed: 2.5, angle: 90, spread: 40, interval: 50, duration: 200,
        }],
        path: [{ x: 80, y: 60 }, { x: PW - 80, y: 80 }, { x: PW + 16, y: 60 }],
        dropTable: [{ type: 'point', chance: 0.5, count: 1 }],
      },
      {
        type: 'page_phantom', x: PW + 16, y: 140, delay: 20, hp: 50,
        patterns: [{
          type: 'aimed', bulletSprite: 'bullet-white', count: 5,
          speed: 2.5, angle: 90, spread: 40, interval: 50, duration: 200,
        }],
        path: [{ x: PW - 80, y: 140 }, { x: 80, y: 120 }, { x: -16, y: 140 }],
        dropTable: [{ type: 'point', chance: 0.5, count: 1 }],
      },
    ],
  },

  // Wave 7: Dense ink spirit rain
  {
    delay: 240,
    enemies: Array.from({ length: 5 }, (_, i) => ({
      type: 'ink_spirit' as const,
      x: 40 + i * 76,
      y: -16,
      delay: i * 20,
      hp: 70,
      patterns: [{
        type: 'radial' as const, bulletSprite: 'bullet-purple', count: 6,
        speed: 1.5, angle: 0, spread: 360, interval: 70, duration: 280,
      }],
      path: [
        { x: 40 + i * 76, y: 80 },
        { x: 40 + i * 76, y: 200 },
        { x: 40 + i * 76, y: PH + 16 },
      ],
      dropTable: [
        { type: 'power' as const, chance: 0.5, count: 2 },
        { type: 'point' as const, chance: 0.6, count: 2 },
      ],
    })),
  },
];

// ---------------------------------------------------------------------------
// Boss: Lexica, the Unwritten Word
// ---------------------------------------------------------------------------

const boss: Boss = {
  id: -2,
  position: { x: CX, y: 80 },
  velocity: { x: 0, y: 0 },
  active: true,
  sprite: 'boss-lexica',
  hp: 3600,
  maxHp: 3600,
  type: 'boss',
  patterns: [
    {
      type: 'radial', bulletSprite: 'bullet-purple', count: 14,
      speed: 1.8, angle: 0, spread: 360, interval: 45, duration: 9999,
      modifiers: [{ type: 'rotate', value: 2 }],
    },
  ],
  currentPatternIndex: 0,
  patternTimer: 0,
  dropTable: [
    { type: 'power', chance: 1.0, count: 20 },
    { type: 'point', chance: 1.0, count: 16 },
    { type: 'life', chance: 1.0, count: 1 },
  ],
  name: 'Lexica, the Unwritten Word',
  spellCards: [
    {
      name: 'Prose Sign "Rivers of Ink"',
      hp: 1200,
      timeLimit: 2400, // 40s
      captureBonus: 1_200_000,
      patterns: [
        {
          type: 'stream', bulletSprite: 'bullet-purple', count: 5,
          speed: 2.0, angle: 90, spread: 50, interval: 10, duration: 2400,
          modifiers: [
            { type: 'rotate', value: 3 },
            { type: 'split', value: 2, delay: 40 },
          ],
        },
      ],
    },
    {
      name: 'Verse Sign "Thousand Page Typhoon"',
      hp: 1200,
      timeLimit: 2400, // 40s
      captureBonus: 1_500_000,
      patterns: [
        {
          type: 'radial', bulletSprite: 'bullet-white', count: 20,
          speed: 1.6, angle: 0, spread: 360, interval: 30, duration: 2400,
          modifiers: [{ type: 'rotate', value: -4 }],
        },
        {
          type: 'radial', bulletSprite: 'bullet-purple', count: 20,
          speed: 1.6, angle: 9, spread: 360, interval: 30, duration: 2400,
          modifiers: [{ type: 'rotate', value: 4 }],
        },
      ],
    },
    {
      name: 'Forbidden Sign "Erased Epilogue"',
      hp: 1200,
      timeLimit: 3000, // 50s
      captureBonus: 2_000_000,
      patterns: [
        {
          type: 'spiral', bulletSprite: 'bullet-purple', count: 4,
          speed: 2.2, angle: 0, spread: 360, interval: 6, duration: 3000,
          modifiers: [{ type: 'rotate', value: 5 }],
        },
        {
          type: 'aimed', bulletSprite: 'bullet-white', count: 5,
          speed: 2.8, angle: 90, spread: 40, interval: 50, duration: 3000,
        },
      ],
    },
  ],
  currentSpellIndex: 0,
  phaseHp: [1200, 1200, 1200],
  isMidBoss: false,
};

// ---------------------------------------------------------------------------
// Stage definition
// ---------------------------------------------------------------------------

export const STAGE_2: StageDef = {
  id: 2,
  name: 'Drowning Library',
  theme: 'library',
  bgm: 'bgm-stage2',
  bossBgm: 'bgm-boss2',
  waves1,
  midBoss,
  waves2,
  boss,
};
