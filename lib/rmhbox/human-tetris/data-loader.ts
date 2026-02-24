/**
 * RMHbox — Human Tetris Data Loader
 *
 * Loads wall shape templates from the static JSON data file and provides
 * shape selection, dead zone generation, and connectivity validation.
 *
 * - loadShapeTemplates(): reads and caches shapes.json
 * - selectShapeForWave(): picks a shape matching required player count and difficulty
 * - generateDeadZones(): places safe cells for surplus players
 * - validateConnectedness(): confirms all holes are reachable via flood-fill
 *
 * Reference: docs/rmhbox/design-spec/minigames-3.md §4.3
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { ShapeTemplate, GridPosition, WallShape } from '../../../server/rmhbox/minigames/human-tetris/types';
import {
  HT_GRID_COLS,
  HT_GRID_ROWS,
  HT_EXCLUSION_RATIO,
  HT_DEAD_ZONE_MIN_COUNT,
} from '../constants';

// ─── Shape Template Cache ────────────────────────────────────────

let cachedTemplates: ShapeTemplate[] | null = null;

/**
 * Load shape templates from the static JSON file.
 * Results are cached after the first load.
 */
export function loadShapeTemplates(): ShapeTemplate[] {
  if (cachedTemplates) return cachedTemplates;

  const filePath = resolve(process.cwd(), 'public/data/rmhbox/human-tetris/shapes.json');
  const raw = readFileSync(filePath, 'utf-8');
  cachedTemplates = JSON.parse(raw) as ShapeTemplate[];
  return cachedTemplates;
}

/**
 * Clear the cached templates (for testing).
 */
export function clearShapeCache(): void {
  cachedTemplates = null;
}

// ─── Shape Selection ─────────────────────────────────────────────

/**
 * Determine difficulty tier based on wave number and total waves.
 * Waves 1–3: easy, 4–6: medium, 7+: hard
 */
function getWaveDifficulty(wave: number): 'easy' | 'medium' | 'hard' {
  if (wave <= 3) return 'easy';
  if (wave <= 6) return 'medium';
  return 'hard';
}

/**
 * Compute the number of players required for the wall shape based on
 * wave difficulty and total player count.
 *
 * Easy waves: all players must participate.
 * Medium/hard: exclude ~20% (HT_EXCLUSION_RATIO) of players.
 */
function computeRequiredPlayers(
  playerCount: number,
  difficulty: 'easy' | 'medium' | 'hard',
): number {
  if (difficulty === 'easy') return playerCount;
  const excluded = Math.floor(playerCount * HT_EXCLUSION_RATIO);
  return Math.max(3, playerCount - excluded);
}

/**
 * Select an appropriate shape template for the current wave.
 *
 * Matches on difficulty tier, then filters by required player count.
 * Falls back to closest available shape if no exact match exists.
 */
export function selectShapeForWave(
  wave: number,
  playerCount: number,
  templates: ShapeTemplate[],
  usedIds: Set<string> = new Set(),
): { template: ShapeTemplate; requiredPlayers: number } {
  const difficulty = getWaveDifficulty(wave);
  const required = computeRequiredPlayers(playerCount, difficulty);

  // Filter by difficulty and required players ≤ available
  const candidates = templates.filter(
    (t) =>
      t.difficulty === difficulty &&
      t.requiredPlayers <= required &&
      !usedIds.has(t.id),
  );

  // Prefer exact match on requiredPlayers, then closest lower
  const sorted = [...candidates].sort(
    (a, b) => Math.abs(a.requiredPlayers - required) - Math.abs(b.requiredPlayers - required),
  );

  let selected = sorted[0];

  // Fallback: if no unused shape of this difficulty, try any difficulty
  if (!selected) {
    const fallbacks = templates.filter(
      (t) => t.requiredPlayers <= required && !usedIds.has(t.id),
    );
    const sortedFallback = [...fallbacks].sort(
      (a, b) => Math.abs(a.requiredPlayers - required) - Math.abs(b.requiredPlayers - required),
    );
    selected = sortedFallback[0];
  }

  // Last resort: allow reuse of already-used shapes
  if (!selected) {
    const allCandidates = templates.filter((t) => t.requiredPlayers <= required);
    const sortedAll = [...allCandidates].sort(
      (a, b) => Math.abs(a.requiredPlayers - required) - Math.abs(b.requiredPlayers - required),
    );
    selected = sortedAll[0] ?? templates[0];
  }

  return { template: selected, requiredPlayers: required };
}

// ─── Dead Zone Generation ────────────────────────────────────────

/** Candidate corner/edge positions for dead zones. */
const DEAD_ZONE_CANDIDATES: GridPosition[] = [
  { col: 0, row: 0 },
  { col: HT_GRID_COLS - 1, row: 0 },
  { col: 0, row: HT_GRID_ROWS - 1 },
  { col: HT_GRID_COLS - 1, row: HT_GRID_ROWS - 1 },
  { col: 0, row: 1 },
  { col: HT_GRID_COLS - 1, row: 1 },
  { col: 0, row: HT_GRID_ROWS - 2 },
  { col: HT_GRID_COLS - 1, row: HT_GRID_ROWS - 2 },
  { col: 1, row: 0 },
  { col: HT_GRID_COLS - 2, row: 0 },
  { col: 1, row: HT_GRID_ROWS - 1 },
  { col: HT_GRID_COLS - 2, row: HT_GRID_ROWS - 1 },
];

/**
 * Generate dead zone positions that don't overlap with holes.
 * Returns at least HT_DEAD_ZONE_MIN_COUNT positions.
 */
export function generateDeadZones(
  holes: GridPosition[],
  playerCount: number,
  requiredPlayers: number,
): GridPosition[] {
  const holeSet = new Set(holes.map((h) => `${h.col},${h.row}`));
  const surplusPlayers = playerCount - requiredPlayers;
  const count = Math.max(HT_DEAD_ZONE_MIN_COUNT, surplusPlayers + 2);

  const deadZones: GridPosition[] = [];
  for (const candidate of DEAD_ZONE_CANDIDATES) {
    if (deadZones.length >= count) break;
    const key = `${candidate.col},${candidate.row}`;
    if (!holeSet.has(key)) {
      deadZones.push({ ...candidate });
    }
  }

  // If we still need more dead zones, add other edge cells
  if (deadZones.length < count) {
    for (let col = 0; col < HT_GRID_COLS; col++) {
      for (const row of [0, HT_GRID_ROWS - 1]) {
        if (deadZones.length >= count) break;
        const key = `${col},${row}`;
        if (!holeSet.has(key) && !deadZones.some((d) => d.col === col && d.row === row)) {
          deadZones.push({ col, row });
        }
      }
    }
  }

  return deadZones;
}

// ─── Connectivity Validation ─────────────────────────────────────

/**
 * Validates that all holes in a shape are connected orthogonally.
 * Uses flood-fill from the first hole position.
 */
export function validateConnectedness(holes: GridPosition[]): boolean {
  if (holes.length <= 1) return true;

  const holeSet = new Set(holes.map((h) => `${h.col},${h.row}`));
  const visited = new Set<string>();
  const queue: GridPosition[] = [holes[0]];
  visited.add(`${holes[0].col},${holes[0].row}`);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = [
      { col: current.col - 1, row: current.row },
      { col: current.col + 1, row: current.row },
      { col: current.col, row: current.row - 1 },
      { col: current.col, row: current.row + 1 },
    ];

    for (const n of neighbors) {
      const key = `${n.col},${n.row}`;
      if (holeSet.has(key) && !visited.has(key)) {
        visited.add(key);
        queue.push(n);
      }
    }
  }

  return visited.size === holes.length;
}

/**
 * Build a complete WallShape from a template, generating dead zones
 * and computing wall cells for client rendering.
 */
export function buildWallShape(
  template: ShapeTemplate,
  playerCount: number,
  requiredPlayers: number,
  enableDeadZones: boolean,
): WallShape {
  const deadZones = enableDeadZones
    ? generateDeadZones(template.holes, playerCount, requiredPlayers)
    : [];

  return {
    holes: [...template.holes],
    requiredPlayers,
    deadZones,
    difficulty: template.difficulty,
  };
}
