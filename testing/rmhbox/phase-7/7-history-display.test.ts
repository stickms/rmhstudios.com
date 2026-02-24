/**
 * Phase 7 — History Display Tests
 *
 * Tests the history display registrations for Phase 7 minigames:
 * Cursor Curling and Human Tetris.
 *
 * Reference: docs/rmhbox/design-spec/core.md §7.3.9, §7.4.11
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getHistoryDisplay,
  getAllHistoryDisplays,
  type GameLog,
  type HistoryDisplayConfig,
} from '../../../lib/rmhbox/history-display-registry';

// Import registrations to trigger side effects
import '../../../lib/rmhbox/history-display-registrations';

// ─── Mock Game Logs ──────────────────────────────────────────────

function createMockCursorCurlingLog(): GameLog {
  return {
    minigameId: 'cursor-curling',
    version: 1,
    players: [
      { userId: 'user-1', userName: 'Alice' },
      { userId: 'user-2', userName: 'Bob' },
    ],
    initialState: { totalEnds: 3, playerCount: 2, canvasSize: { width: 400, height: 600 } },
    actions: [
      { seq: 1, timestamp: 0, type: 'end_start', payload: { end: 1, throwOrder: ['user-1', 'user-2'] } },
      { seq: 2, timestamp: 5000, type: 'throw', payload: { end: 1, userId: 'user-1', angle: 0, power: 0.5, swept: false } },
      { seq: 3, timestamp: 10000, type: 'stone_rest', payload: { end: 1, userId: 'user-1', position: { x: 200, y: 100 }, distanceToBullseye: 0 } },
      { seq: 4, timestamp: 15000, type: 'throw', payload: { end: 1, userId: 'user-2', angle: 0.1, power: 0.6, swept: true } },
      { seq: 5, timestamp: 20000, type: 'stone_rest', payload: { end: 1, userId: 'user-2', position: { x: 210, y: 110 }, distanceToBullseye: 14.1 } },
      { seq: 6, timestamp: 25000, type: 'end_result', payload: { end: 1, closestUserId: 'user-1', scores: { 'user-1': 150, 'user-2': 60 } } },
      { seq: 7, timestamp: 30000, type: 'end_start', payload: { end: 2, throwOrder: ['user-2', 'user-1'] } },
      { seq: 8, timestamp: 60000, type: 'end_result', payload: { end: 2, closestUserId: 'user-2', scores: { 'user-1': 210, 'user-2': 160 } } },
      { seq: 9, timestamp: 65000, type: 'end_start', payload: { end: 3, throwOrder: ['user-1', 'user-2'] } },
      { seq: 10, timestamp: 90000, type: 'end_result', payload: { end: 3, closestUserId: 'user-1', scores: { 'user-1': 310, 'user-2': 220 } } },
      { seq: 11, timestamp: 95000, type: 'game_end', payload: { finalScores: { 'user-1': 310, 'user-2': 220 } } },
    ],
    finalResults: [
      { userId: 'user-1', userName: 'Alice', score: 310, rank: 1 },
      { userId: 'user-2', userName: 'Bob', score: 220, rank: 2 },
    ],
  };
}

function createMockHumanTetrisLog(): GameLog {
  return {
    minigameId: 'human-tetris',
    version: 1,
    players: [
      { userId: 'user-1', userName: 'Alice' },
      { userId: 'user-2', userName: 'Bob' },
      { userId: 'user-3', userName: 'Charlie' },
      { userId: 'user-4', userName: 'Diana' },
    ],
    initialState: { playerCount: 4, arenaSize: { width: 8, height: 6 }, totalWaves: 3 },
    actions: [
      { seq: 1, timestamp: 0, type: 'wave_start', payload: { wave: 1, wallShape: [{col:3,row:2},{col:4,row:2},{col:5,row:2},{col:3,row:3}], difficulty: 'easy' } },
      { seq: 2, timestamp: 11000, type: 'wave_impact', payload: { wave: 1, success: true, playersHit: [] } },
      { seq: 3, timestamp: 12000, type: 'wave_result', payload: { wave: 1, passed: true, teamScore: 400, streak: 1 } },
      { seq: 4, timestamp: 14000, type: 'wave_start', payload: { wave: 2, wallShape: [{col:2,row:1},{col:3,row:1},{col:4,row:1},{col:5,row:1}], difficulty: 'easy' } },
      { seq: 5, timestamp: 25000, type: 'wave_impact', payload: { wave: 2, success: false, playersHit: ['user-3'] } },
      { seq: 6, timestamp: 26000, type: 'wave_result', payload: { wave: 2, passed: false, teamScore: 150, streak: 0 } },
      { seq: 7, timestamp: 28000, type: 'wave_start', payload: { wave: 3, wallShape: [{col:3,row:2},{col:4,row:2},{col:3,row:3},{col:4,row:3}], difficulty: 'easy' } },
      { seq: 8, timestamp: 39000, type: 'wave_impact', payload: { wave: 3, success: true, playersHit: [] } },
      { seq: 9, timestamp: 40000, type: 'wave_result', payload: { wave: 3, passed: true, teamScore: 400, streak: 1 } },
      { seq: 10, timestamp: 42000, type: 'game_end', payload: { wavesCompleted: 3, perfectWaves: 2, longestStreak: 1 } },
    ],
    finalResults: [
      { userId: 'user-1', userName: 'Alice', score: 300, rank: 1 },
      { userId: 'user-2', userName: 'Bob', score: 250, rank: 2 },
      { userId: 'user-3', userName: 'Charlie', score: 200, rank: 3 },
      { userId: 'user-4', userName: 'Diana', score: 280, rank: 4 },
    ],
  };
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Registry Coverage', () => {
  it('getHistoryDisplay("cursor-curling") returns non-null', () => {
    const config = getHistoryDisplay('cursor-curling');
    expect(config).not.toBeNull();
  });

  it('getHistoryDisplay("human-tetris") returns non-null', () => {
    const config = getHistoryDisplay('human-tetris');
    expect(config).not.toBeNull();
  });

  it('cursor-curling config has DetailComponent, searchableFields, filterableFields, getSummary', () => {
    const config = getHistoryDisplay('cursor-curling')!;
    expect(config.DetailComponent).toBeDefined();
    expect(config.searchableFields.length).toBeGreaterThan(0);
    expect(config.filterableFields.length).toBeGreaterThan(0);
    expect(typeof config.getSummary).toBe('function');
  });

  it('human-tetris config has DetailComponent, searchableFields, filterableFields, getSummary', () => {
    const config = getHistoryDisplay('human-tetris')!;
    expect(config.DetailComponent).toBeDefined();
    expect(config.searchableFields.length).toBeGreaterThan(0);
    expect(config.filterableFields.length).toBeGreaterThan(0);
    expect(typeof config.getSummary).toBe('function');
  });
});

describe('Cursor Curling History Display (§7.3.9)', () => {
  let config: HistoryDisplayConfig;
  let log: GameLog;

  beforeEach(() => {
    config = getHistoryDisplay('cursor-curling')!;
    log = createMockCursorCurlingLog();
  });

  it('searchable fields include "playerNames"', () => {
    const keys = config.searchableFields.map((f) => f.key);
    expect(keys).toContain('playerNames');
  });

  it('searchable field "playerNames" extract() returns player names from mock log', () => {
    const playerNamesField = config.searchableFields.find((f) => f.key === 'playerNames')!;
    const extracted = playerNamesField.extract(log);
    expect(extracted).toEqual(['Alice', 'Bob']);
  });

  it('filterable fields include "hitBullseye" (boolean)', () => {
    const field = config.filterableFields.find((f) => f.key === 'hitBullseye');
    expect(field).toBeDefined();
    expect(field!.type).toBe('boolean');
  });

  it('filterable fields include "endCount" (range)', () => {
    const field = config.filterableFields.find((f) => f.key === 'endCount');
    expect(field).toBeDefined();
    expect(field!.type).toBe('range');
  });

  it('filterable fields include "sweepCount" (range)', () => {
    const field = config.filterableFields.find((f) => f.key === 'sweepCount');
    expect(field).toBeDefined();
    expect(field!.type).toBe('range');
  });

  it('getSummary returns meaningful string containing end count', () => {
    const summary = config.getSummary(log);
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).toContain('3 ends');
  });

  it('DetailComponent is defined', () => {
    expect(config.DetailComponent).toBeTruthy();
  });
});

describe('Human Tetris History Display (§7.4.11)', () => {
  let config: HistoryDisplayConfig;
  let log: GameLog;

  beforeEach(() => {
    config = getHistoryDisplay('human-tetris')!;
    log = createMockHumanTetrisLog();
  });

  it('searchable fields include "playerNames"', () => {
    const keys = config.searchableFields.map((f) => f.key);
    expect(keys).toContain('playerNames');
  });

  it('searchable field "playerNames" extract() returns player names from mock log', () => {
    const playerNamesField = config.searchableFields.find((f) => f.key === 'playerNames')!;
    const extracted = playerNamesField.extract(log);
    expect(extracted).toEqual(['Alice', 'Bob', 'Charlie', 'Diana']);
  });

  it('filterable fields include "linesCleared" (range)', () => {
    const field = config.filterableFields.find((f) => f.key === 'linesCleared');
    expect(field).toBeDefined();
    expect(field!.type).toBe('range');
  });

  it('filterable fields include "blocksPlaced" (range)', () => {
    const field = config.filterableFields.find((f) => f.key === 'blocksPlaced');
    expect(field).toBeDefined();
    expect(field!.type).toBe('range');
  });

  it('getSummary returns meaningful string containing wave count and passes', () => {
    const summary = config.getSummary(log);
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).toContain('3 waves');
    expect(summary).toContain('2 passed');
  });

  it('DetailComponent is defined', () => {
    expect(config.DetailComponent).toBeTruthy();
  });
});

describe('Cross-Game History Display', () => {
  it('getAllHistoryDisplays() includes both cursor-curling and human-tetris', () => {
    const displays = getAllHistoryDisplays();
    expect(displays['cursor-curling']).toBeDefined();
    expect(displays['human-tetris']).toBeDefined();
  });

  it('all Phase 5 games still registered (rhyme-time, undercover-agent, category-crash, wiki-race)', () => {
    const displays = getAllHistoryDisplays();
    expect(displays['rhyme-time']).toBeDefined();
    expect(displays['undercover-agent']).toBeDefined();
    expect(displays['category-crash']).toBeDefined();
    expect(displays['wiki-race']).toBeDefined();
  });
});
