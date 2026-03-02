/**
 * Stage 6 — The Rift Core
 *
 * The heart of the Dream Rift — a stunningly beautiful expanse of crystalline
 * spacetime fractures, aurora cascades, and geometric shards that rotate and
 * shimmer in impossible colours. Reality has shattered into prismatic fragments
 * that float in a void of deep indigo and violet. Light refracts through
 * crystal formations creating rainbows that arc across the infinite dark.
 *
 * This is the final stage. Every enemy is elite. Every pattern is layered.
 * The Rift Core itself hums with energy as aurora streams ripple between
 * floating crystal plateaus.
 *
 * Mid-boss: Prism Warden — guardian of the crystalline threshold.
 * Boss: The Dreamer — the consciousness at the centre of all dreams.
 *       Five spell card phases of escalating beauty and complexity.
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
  // Wave 1: Void weavers spiral in from corners
  {
    delay: 45,
    enemies: [
      {
        type: 'void_weaver', x: -16, y: -16, delay: 0, hp: 200,
        patterns: [{
          type: 'spiral', bulletSprite: 'bullet-purple', count: 5,
          speed: 2.0, angle: 0, spread: 360, interval: 6, duration: 360,
          modifiers: [
            { type: 'rotate', value: 4 },
            { type: 'accelerate', value: 0.3, delay: 40 },
          ],
        }],
        path: [{ x: 80, y: 80 }, { x: CX - 40, y: 140 }, { x: -16, y: PH + 16 }],
        dropTable: [
          { type: 'power', chance: 0.8, count: 4 },
          { type: 'point', chance: 1.0, count: 4 },
        ],
      },
      {
        type: 'void_weaver', x: PW + 16, y: -16, delay: 15, hp: 200,
        patterns: [{
          type: 'spiral', bulletSprite: 'bullet-purple', count: 5,
          speed: 2.0, angle: 0, spread: 360, interval: 6, duration: 360,
          modifiers: [
            { type: 'rotate', value: -4 },
            { type: 'accelerate', value: 0.3, delay: 40 },
          ],
        }],
        path: [{ x: PW - 80, y: 80 }, { x: CX + 40, y: 140 }, { x: PW + 16, y: PH + 16 }],
        dropTable: [
          { type: 'power', chance: 0.8, count: 4 },
          { type: 'point', chance: 1.0, count: 4 },
        ],
      },
    ],
  },

  // Wave 2: Rift fragments forming a crystalline wall
  {
    delay: 200,
    enemies: Array.from({ length: 5 }, (_, i) => ({
      type: 'rift_fragment' as const,
      x: 40 + i * 76,
      y: -16,
      delay: i * 12,
      hp: 180,
      patterns: [
        {
          type: 'wall' as const, bulletSprite: 'bullet-cyan', count: 14,
          speed: 1.8, angle: 90, spread: 160, interval: 30, duration: 300,
        },
        {
          type: 'aimed' as const, bulletSprite: 'bullet-white', count: 5,
          speed: 3.0, angle: 90, spread: 40, interval: 40, duration: 300,
        },
      ],
      path: [
        { x: 40 + i * 76, y: 60 },
        { x: 40 + i * 76, y: 60 },
        { x: 40 + i * 76, y: -16 },
      ],
      dropTable: [
        { type: 'power' as const, chance: 0.7, count: 3 },
        { type: 'point' as const, chance: 0.8, count: 3 },
      ],
    })),
  },

  // Wave 3: Aurora sparks dancing in arcs
  {
    delay: 200,
    enemies: [
      ...Array.from({ length: 4 }, (_, i) => {
        const side = i < 2 ? -1 : 1;
        const row = i % 2;
        return {
          type: 'aurora_spark' as const,
          x: side < 0 ? -16 : PW + 16,
          y: 60 + row * 50,
          delay: i * 15,
          hp: 140,
          patterns: [{
            type: 'stream' as const, bulletSprite: 'bullet-cyan', count: 3,
            speed: 2.8, angle: 90, spread: 30, interval: 10, duration: 300,
            modifiers: [
              { type: 'curve' as const, value: side * 3.0 },
              { type: 'rotate' as const, value: side * 2 },
            ],
          }],
          path: side < 0
            ? [{ x: 80, y: 60 + row * 50 }, { x: PW - 80, y: 80 + row * 50 }, { x: PW + 16, y: 60 + row * 50 }]
            : [{ x: PW - 80, y: 60 + row * 50 }, { x: 80, y: 80 + row * 50 }, { x: -16, y: 60 + row * 50 }],
          dropTable: [
            { type: 'power' as const, chance: 0.6, count: 3 },
            { type: 'point' as const, chance: 0.7, count: 3 },
          ],
        };
      }),
    ],
  },

  // Wave 4: Void weavers + rift fragments layered assault
  {
    delay: 200,
    enemies: [
      {
        type: 'void_weaver', x: CX, y: -16, delay: 0, hp: 200,
        patterns: [{
          type: 'spiral', bulletSprite: 'bullet-purple', count: 6,
          speed: 2.2, angle: 0, spread: 360, interval: 5, duration: 360,
          modifiers: [
            { type: 'rotate', value: 5 },
            { type: 'accelerate', value: 0.4, delay: 30 },
          ],
        }],
        path: [{ x: CX, y: 100 }, { x: CX, y: 100 }, { x: CX, y: -16 }],
        dropTable: [
          { type: 'power', chance: 1.0, count: 5 },
          { type: 'point', chance: 1.0, count: 5 },
          { type: 'bomb', chance: 0.15, count: 1 },
        ],
      },
      {
        type: 'rift_fragment', x: CX - 120, y: -16, delay: 30, hp: 180,
        patterns: [{
          type: 'wall', bulletSprite: 'bullet-cyan', count: 16,
          speed: 2.0, angle: 90, spread: 140, interval: 25, duration: 300,
        }],
        path: [{ x: CX - 120, y: 80 }, { x: CX - 120, y: 80 }, { x: CX - 120, y: -16 }],
        dropTable: [{ type: 'power', chance: 0.7, count: 3 }],
      },
      {
        type: 'rift_fragment', x: CX + 120, y: -16, delay: 30, hp: 180,
        patterns: [{
          type: 'wall', bulletSprite: 'bullet-cyan', count: 16,
          speed: 2.0, angle: 90, spread: 140, interval: 25, duration: 300,
        }],
        path: [{ x: CX + 120, y: 80 }, { x: CX + 120, y: 80 }, { x: CX + 120, y: -16 }],
        dropTable: [{ type: 'point', chance: 0.8, count: 3 }],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Mid-boss: Prism Warden
// ---------------------------------------------------------------------------

const midBoss: Boss = {
  id: -1,
  position: { x: CX, y: 90 },
  velocity: { x: 0, y: 0 },
  active: true,
  sprite: 'boss-prism-warden',
  hp: 3500,
  maxHp: 3500,
  type: 'boss',
  patterns: [
    {
      type: 'spiral', bulletSprite: 'bullet-cyan', count: 6,
      speed: 2.0, angle: 0, spread: 360, interval: 5, duration: 3000,
      modifiers: [{ type: 'rotate', value: 5 }],
    },
  ],
  currentPatternIndex: 0,
  patternTimer: 0,
  dropTable: [
    { type: 'power', chance: 1.0, count: 20 },
    { type: 'point', chance: 1.0, count: 16 },
    { type: 'bomb', chance: 1.0, count: 1 },
    { type: 'life', chance: 0.5, count: 1 },
  ],
  name: 'Prism Warden',
  spellCards: [
    {
      name: 'Crystal Sign "Prismatic Cascade"',
      hp: 1200,
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
      name: 'Aurora Sign "Refracted Starfall"',
      hp: 1200,
      timeLimit: 2400, // 40s
      captureBonus: 2_500_000,
      patterns: [
        {
          type: 'radial', bulletSprite: 'bullet-cyan', count: 20,
          speed: 1.8, angle: 0, spread: 360, interval: 20, duration: 2400,
          modifiers: [{ type: 'rotate', value: 4 }],
        },
        {
          type: 'radial', bulletSprite: 'bullet-purple', count: 20,
          speed: 1.8, angle: 9, spread: 360, interval: 20, duration: 2400,
          modifiers: [{ type: 'rotate', value: -4 }],
        },
        {
          type: 'aimed', bulletSprite: 'bullet-white', count: 5,
          speed: 3.0, angle: 90, spread: 35, interval: 30, duration: 2400,
        },
      ],
    },
    {
      name: 'Rift Sign "Spacetime Lattice"',
      hp: 1100,
      timeLimit: 2700, // 45s
      captureBonus: 3_000_000,
      patterns: [
        {
          type: 'wall', bulletSprite: 'bullet-cyan', count: 22,
          speed: 2.2, angle: 90, spread: 180, interval: 18, duration: 2700,
        },
        {
          type: 'spiral', bulletSprite: 'bullet-purple', count: 5,
          speed: 2.0, angle: 0, spread: 360, interval: 6, duration: 2700,
          modifiers: [{ type: 'rotate', value: 6 }, { type: 'accelerate', value: 0.4, delay: 25 }],
        },
        {
          type: 'aimed', bulletSprite: 'bullet-white', count: 4,
          speed: 3.5, angle: 90, spread: 25, interval: 35, duration: 2700,
        },
      ],
    },
  ],
  currentSpellIndex: 0,
  phaseHp: [1200, 1200, 1100],
  isMidBoss: true,
};

// ---------------------------------------------------------------------------
// Wave definitions — second half
// ---------------------------------------------------------------------------

const waves2: WaveDef[] = [
  // Wave 5: All three elite types combined
  {
    delay: 60,
    enemies: [
      {
        type: 'void_weaver', x: CX - 100, y: -16, delay: 0, hp: 200,
        patterns: [{
          type: 'spiral', bulletSprite: 'bullet-purple', count: 5,
          speed: 2.2, angle: 0, spread: 360, interval: 5, duration: 360,
          modifiers: [{ type: 'rotate', value: 5 }],
        }],
        path: [{ x: CX - 100, y: 90 }, { x: CX - 100, y: 90 }, { x: CX - 100, y: -16 }],
        dropTable: [{ type: 'power', chance: 0.8, count: 4 }],
      },
      {
        type: 'void_weaver', x: CX + 100, y: -16, delay: 0, hp: 200,
        patterns: [{
          type: 'spiral', bulletSprite: 'bullet-purple', count: 5,
          speed: 2.2, angle: 36, spread: 360, interval: 5, duration: 360,
          modifiers: [{ type: 'rotate', value: -5 }],
        }],
        path: [{ x: CX + 100, y: 90 }, { x: CX + 100, y: 90 }, { x: CX + 100, y: -16 }],
        dropTable: [{ type: 'point', chance: 1.0, count: 4 }],
      },
      {
        type: 'aurora_spark', x: CX, y: -16, delay: 20, hp: 140,
        patterns: [{
          type: 'stream', bulletSprite: 'bullet-cyan', count: 4,
          speed: 3.0, angle: 90, spread: 40, interval: 8, duration: 300,
          modifiers: [{ type: 'curve', value: 3.0 }, { type: 'rotate', value: 3 }],
        }],
        path: [{ x: CX, y: 110 }, { x: CX, y: 110 }, { x: CX, y: -16 }],
        dropTable: [{ type: 'power', chance: 0.7, count: 3 }],
      },
    ],
  },

  // Wave 6: Rift fragment crystal lattice
  {
    delay: 200,
    enemies: Array.from({ length: 6 }, (_, i) => ({
      type: 'rift_fragment' as const,
      x: 32 + i * 64,
      y: -16,
      delay: i * 10,
      hp: 180,
      patterns: [
        {
          type: 'wall' as const, bulletSprite: 'bullet-cyan', count: 12,
          speed: 2.0, angle: 90, spread: 120, interval: 25, duration: 240,
        },
        {
          type: 'aimed' as const, bulletSprite: 'bullet-white', count: 4,
          speed: 3.0, angle: 90, spread: 30, interval: 35, duration: 240,
        },
      ],
      path: [
        { x: 32 + i * 64, y: 55 },
        { x: 32 + i * 64, y: 55 },
        { x: 32 + i * 64, y: -16 },
      ],
      dropTable: [
        { type: 'power' as const, chance: 0.6, count: 3 },
        { type: 'point' as const, chance: 0.7, count: 3 },
      ],
    })),
  },

  // Wave 7: Aurora + void weaver spiral gauntlet
  {
    delay: 200,
    enemies: [
      ...Array.from({ length: 3 }, (_, i) => ({
        type: 'aurora_spark' as const,
        x: i % 2 === 0 ? -16 : PW + 16,
        y: 60 + i * 30,
        delay: i * 20,
        hp: 140,
        patterns: [{
          type: 'stream' as const, bulletSprite: 'bullet-cyan', count: 4,
          speed: 3.0, angle: 90, spread: 35, interval: 8, duration: 300,
          modifiers: [
            { type: 'curve' as const, value: i % 2 === 0 ? 3.5 : -3.5 },
            { type: 'rotate' as const, value: i % 2 === 0 ? 2 : -2 },
          ],
        }],
        path: i % 2 === 0
          ? [{ x: 80, y: 60 + i * 30 }, { x: PW - 80, y: 70 + i * 30 }, { x: PW + 16, y: 60 + i * 30 }]
          : [{ x: PW - 80, y: 60 + i * 30 }, { x: 80, y: 70 + i * 30 }, { x: -16, y: 60 + i * 30 }],
        dropTable: [{ type: 'point' as const, chance: 0.6, count: 3 }],
      })),
      {
        type: 'void_weaver' as const, x: CX, y: -16, delay: 40, hp: 200,
        patterns: [{
          type: 'spiral' as const, bulletSprite: 'bullet-purple', count: 7,
          speed: 2.0, angle: 0, spread: 360, interval: 4, duration: 360,
          modifiers: [
            { type: 'rotate' as const, value: 6 },
            { type: 'accelerate' as const, value: 0.4, delay: 25 },
          ],
        }],
        path: [{ x: CX, y: 100 }, { x: CX, y: 100 }, { x: CX, y: -16 }],
        dropTable: [
          { type: 'power' as const, chance: 1.0, count: 5 },
          { type: 'point' as const, chance: 1.0, count: 5 },
          { type: 'bomb' as const, chance: 0.2, count: 1 },
        ],
      },
    ],
  },

  // Wave 8: Final gauntlet — everything at once
  {
    delay: 180,
    enemies: [
      {
        type: 'void_weaver', x: CX - 100, y: -16, delay: 0, hp: 200,
        patterns: [{
          type: 'spiral', bulletSprite: 'bullet-purple', count: 6,
          speed: 2.0, angle: 0, spread: 360, interval: 5, duration: 360,
          modifiers: [{ type: 'rotate', value: 5 }],
        }],
        path: [{ x: CX - 100, y: 80 }, { x: CX - 100, y: 80 }, { x: CX - 100, y: -16 }],
        dropTable: [{ type: 'power', chance: 0.8, count: 4 }],
      },
      {
        type: 'void_weaver', x: CX + 100, y: -16, delay: 0, hp: 200,
        patterns: [{
          type: 'spiral', bulletSprite: 'bullet-purple', count: 6,
          speed: 2.0, angle: 30, spread: 360, interval: 5, duration: 360,
          modifiers: [{ type: 'rotate', value: -5 }],
        }],
        path: [{ x: CX + 100, y: 80 }, { x: CX + 100, y: 80 }, { x: CX + 100, y: -16 }],
        dropTable: [{ type: 'point', chance: 1.0, count: 4 }],
      },
      ...Array.from({ length: 4 }, (_, i) => ({
        type: 'rift_fragment' as const,
        x: 48 + i * 96,
        y: -16,
        delay: 20 + i * 8,
        hp: 180,
        patterns: [{
          type: 'wall' as const, bulletSprite: 'bullet-cyan', count: 14,
          speed: 2.0, angle: 90, spread: 140, interval: 25, duration: 240,
        }],
        path: [
          { x: 48 + i * 96, y: 55 },
          { x: 48 + i * 96, y: 55 },
          { x: 48 + i * 96, y: -16 },
        ],
        dropTable: [{ type: 'point' as const, chance: 0.6, count: 3 }],
      })),
    ],
  },
];

// ---------------------------------------------------------------------------
// Boss: The Dreamer
//
// The consciousness at the centre of all dreams. Five spell card phases that
// escalate from serene crystalline beauty to an overwhelming crescendo of
// every pattern type layered together. The Dreamer's attacks are the most
// visually dense and beautiful in the game.
// ---------------------------------------------------------------------------

const boss: Boss = {
  id: -2,
  position: { x: CX, y: 80 },
  velocity: { x: 0, y: 0 },
  active: true,
  sprite: 'boss-dreamer',
  hp: 12000,
  maxHp: 12000,
  type: 'boss',
  patterns: [
    {
      type: 'spiral', bulletSprite: 'bullet-cyan', count: 8,
      speed: 2.0, angle: 0, spread: 360, interval: 4, duration: 9999,
      modifiers: [{ type: 'rotate', value: 5 }],
    },
  ],
  currentPatternIndex: 0,
  patternTimer: 0,
  dropTable: [
    { type: 'power', chance: 1.0, count: 40 },
    { type: 'point', chance: 1.0, count: 40 },
    { type: 'life', chance: 1.0, count: 2 },
    { type: 'bomb', chance: 1.0, count: 2 },
    { type: 'fullPower', chance: 1.0, count: 1 },
  ],
  name: 'The Dreamer',
  spellCards: [
    // Phase 1: Crystalline Aurora — beautiful, relatively gentle opening.
    // Dual spirals of cyan and white create an aurora-like flowing pattern.
    {
      name: 'Dream Sign "Crystalline Aurora"',
      hp: 2400,
      timeLimit: 3000, // 50s
      captureBonus: 3_000_000,
      patterns: [
        {
          type: 'spiral', bulletSprite: 'bullet-cyan', count: 6,
          speed: 1.8, angle: 0, spread: 360, interval: 5, duration: 3000,
          modifiers: [
            { type: 'rotate', value: 4 },
            { type: 'curve', value: 1.5 },
          ],
        },
        {
          type: 'spiral', bulletSprite: 'bullet-white', count: 6,
          speed: 1.8, angle: 30, spread: 360, interval: 5, duration: 3000,
          modifiers: [
            { type: 'rotate', value: -4 },
            { type: 'curve', value: -1.5 },
          ],
        },
        {
          type: 'aimed', bulletSprite: 'bullet-purple', count: 3,
          speed: 2.5, angle: 90, spread: 20, interval: 50, duration: 3000,
        },
      ],
    },

    // Phase 2: Geometric Shards — walls of crystal rain down while radial
    // rings pulse outward. The gap-finding challenge begins.
    {
      name: 'Rift Sign "Geometric Shards of Eternity"',
      hp: 2400,
      timeLimit: 3000, // 50s
      captureBonus: 4_000_000,
      patterns: [
        {
          type: 'wall', bulletSprite: 'bullet-cyan', count: 24,
          speed: 2.2, angle: 90, spread: 180, interval: 18, duration: 3000,
        },
        {
          type: 'radial', bulletSprite: 'bullet-white', count: 18,
          speed: 1.8, angle: 0, spread: 360, interval: 25, duration: 3000,
          modifiers: [{ type: 'rotate', value: 3 }],
        },
        {
          type: 'radial', bulletSprite: 'bullet-purple', count: 18,
          speed: 1.8, angle: 10, spread: 360, interval: 25, duration: 3000,
          modifiers: [{ type: 'rotate', value: -3 }],
        },
      ],
    },

    // Phase 3: Fracture Cascade — the spacetime fractures intensify.
    // Triple spirals with speed changes and aimed bursts create a cascading
    // waterfall of colour.
    {
      name: 'Void Sign "Spacetime Fracture Cascade"',
      hp: 2400,
      timeLimit: 3600, // 60s
      captureBonus: 5_000_000,
      patterns: [
        {
          type: 'spiral', bulletSprite: 'bullet-purple', count: 7,
          speed: 2.2, angle: 0, spread: 360, interval: 4, duration: 3600,
          modifiers: [
            { type: 'rotate', value: 6 },
            { type: 'accelerate', value: -0.4, delay: 30 },
          ],
        },
        {
          type: 'spiral', bulletSprite: 'bullet-cyan', count: 7,
          speed: 2.2, angle: 25.7, spread: 360, interval: 4, duration: 3600,
          modifiers: [
            { type: 'rotate', value: -6 },
            { type: 'accelerate', value: -0.4, delay: 30 },
          ],
        },
        {
          type: 'aimed', bulletSprite: 'bullet-white', count: 6,
          speed: 3.5, angle: 90, spread: 40, interval: 25, duration: 3600,
          modifiers: [{ type: 'curve', value: 2.0 }],
        },
        {
          type: 'aimed', bulletSprite: 'bullet-white', count: 6,
          speed: 3.5, angle: 90, spread: 40, interval: 25, duration: 3600,
          modifiers: [{ type: 'curve', value: -2.0 }],
        },
      ],
    },

    // Phase 4: Prismatic Convergence — every colour converges in layered
    // radial rings that rotate at different speeds, overlapping into a
    // kaleidoscopic storm. Walls add pressure from above.
    {
      name: 'Prism Sign "Convergence of All Colour"',
      hp: 2400,
      timeLimit: 3600, // 60s
      captureBonus: 6_000_000,
      patterns: [
        {
          type: 'radial', bulletSprite: 'bullet-red', count: 20,
          speed: 1.8, angle: 0, spread: 360, interval: 18, duration: 3600,
          modifiers: [{ type: 'rotate', value: 5 }],
        },
        {
          type: 'radial', bulletSprite: 'bullet-cyan', count: 20,
          speed: 1.8, angle: 9, spread: 360, interval: 18, duration: 3600,
          modifiers: [{ type: 'rotate', value: -5 }],
        },
        {
          type: 'radial', bulletSprite: 'bullet-purple', count: 16,
          speed: 1.5, angle: 0, spread: 360, interval: 22, duration: 3600,
          modifiers: [{ type: 'rotate', value: 3 }],
        },
        {
          type: 'wall', bulletSprite: 'bullet-white', count: 20,
          speed: 2.0, angle: 90, spread: 170, interval: 22, duration: 3600,
        },
        {
          type: 'aimed', bulletSprite: 'bullet-orange', count: 4,
          speed: 3.5, angle: 90, spread: 25, interval: 30, duration: 3600,
        },
      ],
    },

    // Phase 5: The Dreamer's Last Word — the ultimate spell card.
    // Everything at maximum density and beauty. Layered spirals from both
    // rotation directions, pulsing radial rings, walls, and relentless
    // aimed tracking. The screen fills with a mesmerising geometry of light.
    {
      name: 'Last Word "The Dream That Dreamed Itself"',
      hp: 2400,
      timeLimit: 4200, // 70s
      captureBonus: 10_000_000,
      patterns: [
        // Primary spirals — the signature aurora helix
        {
          type: 'spiral', bulletSprite: 'bullet-cyan', count: 8,
          speed: 2.0, angle: 0, spread: 360, interval: 3, duration: 4200,
          modifiers: [
            { type: 'rotate', value: 7 },
            { type: 'curve', value: 2.0 },
            { type: 'accelerate', value: 0.3, delay: 30 },
          ],
        },
        {
          type: 'spiral', bulletSprite: 'bullet-purple', count: 8,
          speed: 2.0, angle: 22.5, spread: 360, interval: 3, duration: 4200,
          modifiers: [
            { type: 'rotate', value: -7 },
            { type: 'curve', value: -2.0 },
            { type: 'accelerate', value: 0.3, delay: 30 },
          ],
        },
        // Pulsing radial rings
        {
          type: 'radial', bulletSprite: 'bullet-white', count: 24,
          speed: 1.6, angle: 0, spread: 360, interval: 25, duration: 4200,
          modifiers: [{ type: 'rotate', value: 4 }],
        },
        // Crystal wall rain
        {
          type: 'wall', bulletSprite: 'bullet-cyan', count: 18,
          speed: 2.2, angle: 90, spread: 170, interval: 20, duration: 4200,
        },
        // Relentless aimed tracking
        {
          type: 'aimed', bulletSprite: 'bullet-white', count: 5,
          speed: 3.5, angle: 90, spread: 30, interval: 20, duration: 4200,
        },
      ],
    },
  ],
  currentSpellIndex: 0,
  phaseHp: [2400, 2400, 2400, 2400, 2400],
  isMidBoss: false,
};

// ---------------------------------------------------------------------------
// Stage definition
// ---------------------------------------------------------------------------

export const STAGE_6: StageDef = {
  id: 6,
  name: 'The Rift Core',
  theme: 'rift',
  bgm: 'bgm-stage6',
  bossBgm: 'bgm-boss6',
  waves1,
  midBoss,
  waves2,
  boss,
};
