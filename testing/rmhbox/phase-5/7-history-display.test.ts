/**
 * Phase 5 — History Display & Minigame Browser Tests
 *
 * Tests the history display registry, history display configurations
 * for Phase 5 minigames, and the minigame browser components.
 *
 * Reference: docs/rmhbox/design-spec/core.md §14A
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerHistoryDisplay,
  getHistoryDisplay,
  getAllHistoryDisplays,
  type GameLog,
  type HistoryDisplayConfig,
  type HistoryDetailProps,
} from '../../../lib/rmhbox/history-display-registry';

// Import registrations to trigger side effects
import '../../../lib/rmhbox/history-display-registrations';

import { getAllMinigames, MINIGAME_REGISTRY } from '../../../lib/rmhbox/minigame-registry';

// ─── Mock Game Logs ──────────────────────────────────────────────

function createMockRhymeTimeLog(): GameLog {
  return {
    minigameId: 'rhyme-time',
    version: 1,
    players: [
      { userId: 'user-1', userName: 'Alice' },
      { userId: 'user-2', userName: 'Bob' },
    ],
    initialState: { rounds: 3, secondsPerRound: 45 },
    actions: [
      { seq: 1, timestamp: 0, type: 'round_start', payload: { round: 1, rootWord: 'cat', validRhymeCount: 50 } },
      { seq: 2, timestamp: 1000, type: 'submission', payload: { userId: 'user-1', word: 'bat', valid: true, duplicate: false, rarityTier: 'common', score: 1 } },
      { seq: 3, timestamp: 2000, type: 'submission', payload: { userId: 'user-1', word: 'hat', valid: true, duplicate: false, rarityTier: 'rare', score: 5 } },
      { seq: 4, timestamp: 3000, type: 'submission', payload: { userId: 'user-2', word: 'bat', valid: true, duplicate: false, rarityTier: 'common', score: 1 } },
      { seq: 5, timestamp: 45000, type: 'round_end', payload: { round: 1, rootWord: 'cat', roundWinner: 'user-1', submissions: [] } },
      { seq: 6, timestamp: 46000, type: 'round_start', payload: { round: 2, rootWord: 'dog', validRhymeCount: 30 } },
      { seq: 7, timestamp: 90000, type: 'round_end', payload: { round: 2, rootWord: 'dog', roundWinner: 'user-2', submissions: [] } },
      { seq: 8, timestamp: 91000, type: 'round_start', payload: { round: 3, rootWord: 'sun', validRhymeCount: 40 } },
      { seq: 9, timestamp: 135000, type: 'round_end', payload: { round: 3, rootWord: 'sun', roundWinner: 'user-1', submissions: [] } },
      { seq: 10, timestamp: 136000, type: 'game_end', payload: { finalScores: [{ userId: 'user-1', totalScore: 30, rank: 1 }, { userId: 'user-2', totalScore: 20, rank: 2 }] } },
    ],
    finalResults: [
      { userId: 'user-1', userName: 'Alice', score: 30, rank: 1 },
      { userId: 'user-2', userName: 'Bob', score: 20, rank: 2 },
    ],
  };
}

function createMockUndercoverAgentLog(): GameLog {
  return {
    minigameId: 'undercover-agent',
    version: 1,
    players: [
      { userId: 'user-1', userName: 'Alice' },
      { userId: 'user-2', userName: 'Bob' },
      { userId: 'user-3', userName: 'Charlie' },
      { userId: 'user-4', userName: 'Diana' },
    ],
    initialState: {
      gridSize: 25,
      words: ['apple', 'car', 'moon', 'tree', 'river'],
      keyCard: { teamA: ['apple', 'car'], teamB: ['moon', 'tree'], neutral: ['river'], assassin: 'bomb' },
      teamASpymaster: 'user-1',
      teamBSpymaster: 'user-3',
      startingTeam: 'A',
    },
    actions: [
      { seq: 1, timestamp: 0, type: 'turn_start', payload: { team: 'A', role: 'spymaster', turnNumber: 1 } },
      { seq: 2, timestamp: 5000, type: 'clue_given', payload: { team: 'A', spymasterId: 'user-1', word: 'fruit', number: 1 } },
      { seq: 3, timestamp: 10000, type: 'guess', payload: { team: 'A', operativeId: 'user-2', word: 'apple', tileType: 'teamA', correct: true } },
      { seq: 4, timestamp: 60000, type: 'game_end', payload: { winningTeam: 'A', winCondition: 'all_found', remainingWords: { teamA: [], teamB: ['moon'] } } },
    ],
    finalResults: [
      { userId: 'user-1', userName: 'Alice', score: 100, rank: 1 },
      { userId: 'user-2', userName: 'Bob', score: 80, rank: 2 },
    ],
  };
}

function createMockCategoryCrashLog(): GameLog {
  return {
    minigameId: 'category-crash',
    version: 1,
    players: [
      { userId: 'user-1', userName: 'Alice' },
      { userId: 'user-2', userName: 'Bob' },
    ],
    initialState: { rounds: 2, categoriesPerRound: 3 },
    actions: [
      { seq: 1, timestamp: 0, type: 'round_start', payload: { round: 1, letter: 'S', categories: ['Animals', 'Countries', 'Foods'] } },
      { seq: 2, timestamp: 30000, type: 'answers_locked', payload: { userId: 'user-1', answers: [{ category: 'Animals', answer: 'Snake' }, { category: 'Countries', answer: 'Spain' }] } },
      { seq: 3, timestamp: 31000, type: 'answers_locked', payload: { userId: 'user-2', answers: [{ category: 'Animals', answer: 'Seal' }, { category: 'Countries', answer: 'Spain' }] } },
      { seq: 4, timestamp: 40000, type: 'crash_result', payload: { category: 'Countries', crashedAnswer: 'Spain', crashedPlayers: ['user-1', 'user-2'], survivingAnswers: [] } },
      { seq: 5, timestamp: 50000, type: 'round_start', payload: { round: 2, letter: 'T', categories: ['Cities', 'Movies'] } },
      { seq: 6, timestamp: 100000, type: 'game_end', payload: { finalScores: [{ userId: 'user-1', totalScore: 25, rank: 1 }] } },
    ],
    finalResults: [
      { userId: 'user-1', userName: 'Alice', score: 25, rank: 1 },
      { userId: 'user-2', userName: 'Bob', score: 15, rank: 2 },
    ],
  };
}

function createMockWikiRaceLog(): GameLog {
  return {
    minigameId: 'wiki-race',
    version: 1,
    players: [
      { userId: 'user-1', userName: 'Alice' },
      { userId: 'user-2', userName: 'Bob' },
    ],
    initialState: { rounds: 1, timeLimitSeconds: 120 },
    actions: [
      { seq: 1, timestamp: 0, type: 'round_start', payload: { round: 1, startArticle: 'Cat', targetArticle: 'Moon' } },
      { seq: 2, timestamp: 5000, type: 'navigate', payload: { userId: 'user-1', fromArticle: 'Cat', toArticle: 'Mammal', timestamp: 5000, clickIndex: 1 } },
      { seq: 3, timestamp: 10000, type: 'navigate', payload: { userId: 'user-1', fromArticle: 'Mammal', toArticle: 'Moon', timestamp: 10000, clickIndex: 2 } },
      { seq: 4, timestamp: 10000, type: 'player_finish', payload: { userId: 'user-1', pathLength: 2, timeMs: 10000, path: ['Cat', 'Mammal', 'Moon'] } },
      { seq: 5, timestamp: 120000, type: 'player_timeout', payload: { userId: 'user-2', lastArticle: 'Earth', pathLength: 8, path: ['Cat', 'Animal', 'Earth'] } },
      { seq: 6, timestamp: 120000, type: 'round_end', payload: { round: 1, finishers: [{ userId: 'user-1', pathLength: 2, timeMs: 10000 }] } },
      { seq: 7, timestamp: 120000, type: 'game_end', payload: { finalScores: [{ userId: 'user-1', totalScore: 500, rank: 1 }] } },
    ],
    finalResults: [
      { userId: 'user-1', userName: 'Alice', score: 500, rank: 1 },
      { userId: 'user-2', userName: 'Bob', score: 50, rank: 2 },
    ],
  };
}

// ─── Tests ───────────────────────────────────────────────────────

describe('History Display Registry (§14A.5)', () => {
  it('should have registered all 4 Phase 5 minigames', () => {
    const displays = getAllHistoryDisplays();
    expect(displays['rhyme-time']).toBeDefined();
    expect(displays['undercover-agent']).toBeDefined();
    expect(displays['category-crash']).toBeDefined();
    expect(displays['wiki-race']).toBeDefined();
  });

  it('getHistoryDisplay should return config for registered minigame', () => {
    const config = getHistoryDisplay('rhyme-time');
    expect(config).not.toBeNull();
    expect(config!.minigameId).toBe('rhyme-time');
    expect(config!.DetailComponent).toBeDefined();
    expect(config!.searchableFields.length).toBeGreaterThan(0);
    expect(config!.filterableFields.length).toBeGreaterThan(0);
    expect(typeof config!.getSummary).toBe('function');
  });

  it('getHistoryDisplay should return null for unregistered minigame', () => {
    const config = getHistoryDisplay('nonexistent-game');
    expect(config).toBeNull();
  });

  it('registerHistoryDisplay should add a new config', () => {
    const mockConfig: HistoryDisplayConfig = {
      minigameId: 'test-game',
      DetailComponent: (() => null) as React.ComponentType<HistoryDetailProps>,
      searchableFields: [],
      filterableFields: [],
      getSummary: () => 'test',
    };
    registerHistoryDisplay(mockConfig);
    expect(getHistoryDisplay('test-game')).toBe(mockConfig);
  });
});

describe('Rhyme Time History Display (§1.16)', () => {
  let config: HistoryDisplayConfig;
  let log: GameLog;

  beforeEach(() => {
    config = getHistoryDisplay('rhyme-time')!;
    log = createMockRhymeTimeLog();
  });

  it('should have correct searchable fields', () => {
    expect(config.searchableFields).toHaveLength(2);
    expect(config.searchableFields.map((f) => f.key)).toEqual(['rootWords', 'submissions']);
  });

  it('should extract root words from game log', () => {
    const rootWordsField = config.searchableFields.find((f) => f.key === 'rootWords')!;
    const extracted = rootWordsField.extract(log);
    expect(extracted).toEqual(['cat', 'dog', 'sun']);
  });

  it('should extract submissions from game log', () => {
    const submissionsField = config.searchableFields.find((f) => f.key === 'submissions')!;
    const extracted = submissionsField.extract(log);
    expect(extracted).toEqual(['bat', 'hat', 'bat']);
  });

  it('should generate correct summary', () => {
    const summary = config.getSummary(log);
    expect(summary).toBe('3 rounds — cat, dog, sun');
  });

  it('should have correct filterable fields', () => {
    expect(config.filterableFields).toHaveLength(2);
    expect(config.filterableFields.map((f) => f.key)).toEqual(['roundCount', 'hadSpeedBonus']);
    expect(config.filterableFields[0].type).toBe('range');
    expect(config.filterableFields[1].type).toBe('boolean');
  });
});

describe('Undercover Agent History Display (§2.17)', () => {
  let config: HistoryDisplayConfig;
  let log: GameLog;

  beforeEach(() => {
    config = getHistoryDisplay('undercover-agent')!;
    log = createMockUndercoverAgentLog();
  });

  it('should have correct searchable fields', () => {
    expect(config.searchableFields).toHaveLength(2);
    expect(config.searchableFields.map((f) => f.key)).toEqual(['clues', 'gridWords']);
  });

  it('should extract clues from game log', () => {
    const cluesField = config.searchableFields.find((f) => f.key === 'clues')!;
    const extracted = cluesField.extract(log);
    expect(extracted).toEqual(['fruit']);
  });

  it('should extract grid words from game log', () => {
    const gridWordsField = config.searchableFields.find((f) => f.key === 'gridWords')!;
    const extracted = gridWordsField.extract(log);
    expect(extracted).toEqual(['apple', 'car', 'moon', 'tree', 'river']);
  });

  it('should generate correct summary', () => {
    const summary = config.getSummary(log);
    expect(summary).toBe('Team A wins (all found)');
  });

  it('should have correct filterable fields', () => {
    expect(config.filterableFields).toHaveLength(3);
    expect(config.filterableFields.map((f) => f.key)).toEqual(['winCondition', 'team', 'role']);
    expect(config.filterableFields[0].type).toBe('select');
    expect(config.filterableFields[0].options!(log)).toEqual(['all_found', 'assassin', 'stalemate']);
  });
});

describe('Category Crash History Display (§3.15)', () => {
  let config: HistoryDisplayConfig;
  let log: GameLog;

  beforeEach(() => {
    config = getHistoryDisplay('category-crash')!;
    log = createMockCategoryCrashLog();
  });

  it('should have correct searchable fields', () => {
    expect(config.searchableFields).toHaveLength(2);
    expect(config.searchableFields.map((f) => f.key)).toEqual(['categories', 'answers']);
  });

  it('should extract categories from game log', () => {
    const categoriesField = config.searchableFields.find((f) => f.key === 'categories')!;
    const extracted = categoriesField.extract(log);
    expect(extracted).toEqual(['Animals', 'Countries', 'Foods', 'Cities', 'Movies']);
  });

  it('should extract answers from game log', () => {
    const answersField = config.searchableFields.find((f) => f.key === 'answers')!;
    const extracted = answersField.extract(log);
    expect(extracted).toEqual(['Snake', 'Spain', 'Seal', 'Spain']);
  });

  it('should generate correct summary', () => {
    const summary = config.getSummary(log);
    expect(summary).toBe('2 rounds — Letters: S, T');
  });

  it('should have correct filterable fields', () => {
    expect(config.filterableFields).toHaveLength(2);
    expect(config.filterableFields.map((f) => f.key)).toEqual(['letter', 'crashCount']);
    expect(config.filterableFields[0].type).toBe('select');
    expect(config.filterableFields[0].options!(log)).toEqual(['S', 'T']);
  });
});

describe('Wiki-Race History Display (§4.17)', () => {
  let config: HistoryDisplayConfig;
  let log: GameLog;

  beforeEach(() => {
    config = getHistoryDisplay('wiki-race')!;
    log = createMockWikiRaceLog();
  });

  it('should have correct searchable fields', () => {
    expect(config.searchableFields).toHaveLength(2);
    expect(config.searchableFields.map((f) => f.key)).toEqual(['articles', 'startTarget']);
  });

  it('should extract navigated articles from game log', () => {
    const articlesField = config.searchableFields.find((f) => f.key === 'articles')!;
    const extracted = articlesField.extract(log);
    expect(extracted).toEqual(['Mammal', 'Moon']);
  });

  it('should extract start/target articles from game log', () => {
    const startTargetField = config.searchableFields.find((f) => f.key === 'startTarget')!;
    const extracted = startTargetField.extract(log);
    expect(extracted).toEqual(['Cat', 'Moon']);
  });

  it('should generate correct summary for single round', () => {
    const summary = config.getSummary(log);
    expect(summary).toBe('Cat → Moon');
  });

  it('should generate correct summary for multiple rounds', () => {
    const multiRoundLog: GameLog = {
      ...log,
      initialState: { rounds: 2, timeLimitSeconds: 120 },
      actions: [
        { seq: 1, timestamp: 0, type: 'round_start', payload: { round: 1, startArticle: 'Cat', targetArticle: 'Moon' } },
        { seq: 2, timestamp: 120000, type: 'round_end', payload: { round: 1, finishers: [] } },
        { seq: 3, timestamp: 121000, type: 'round_start', payload: { round: 2, startArticle: 'Python', targetArticle: 'Mathematics' } },
        { seq: 4, timestamp: 240000, type: 'round_end', payload: { round: 2, finishers: [] } },
        { seq: 5, timestamp: 240000, type: 'game_end', payload: { finalScores: [] } },
      ],
    };
    const summary = config.getSummary(multiRoundLog);
    expect(summary).toBe('2 rounds — Cat → Moon, Python → Mathematics');
  });

  it('should have correct filterable fields', () => {
    expect(config.filterableFields).toHaveLength(3);
    expect(config.filterableFields.map((f) => f.key)).toEqual(['finished', 'pathLength', 'round']);
    expect(config.filterableFields[0].type).toBe('boolean');
    expect(config.filterableFields[1].type).toBe('range');
    expect(config.filterableFields[2].type).toBe('select');
    expect(config.filterableFields[2].options!(log)).toEqual(['1']);
  });
});

describe('Minigame Registry Integration', () => {
  it('all registered minigames should have entries in the registry', () => {
    const minigames = getAllMinigames();
    expect(minigames.length).toBeGreaterThanOrEqual(4);
  });

  it('each Phase 5 minigame should have a corresponding history display config', () => {
    const phase5Games = ['rhyme-time', 'undercover-agent', 'category-crash', 'wiki-race'];
    for (const gameId of phase5Games) {
      expect(MINIGAME_REGISTRY[gameId]).toBeDefined();
      expect(getHistoryDisplay(gameId)).not.toBeNull();
      expect(getHistoryDisplay(gameId)!.minigameId).toBe(gameId);
    }
  });

  it('history display configs should have non-empty searchable fields', () => {
    const phase5Games = ['rhyme-time', 'undercover-agent', 'category-crash', 'wiki-race'];
    for (const gameId of phase5Games) {
      const config = getHistoryDisplay(gameId)!;
      expect(config.searchableFields.length).toBeGreaterThan(0);
      for (const field of config.searchableFields) {
        expect(field.key).toBeTruthy();
        expect(field.label).toBeTruthy();
        expect(typeof field.extract).toBe('function');
      }
    }
  });

  it('history display configs should have non-empty filterable fields', () => {
    const phase5Games = ['rhyme-time', 'undercover-agent', 'category-crash', 'wiki-race'];
    for (const gameId of phase5Games) {
      const config = getHistoryDisplay(gameId)!;
      expect(config.filterableFields.length).toBeGreaterThan(0);
      for (const field of config.filterableFields) {
        expect(field.key).toBeTruthy();
        expect(field.label).toBeTruthy();
        expect(['select', 'range', 'boolean']).toContain(field.type);
      }
    }
  });

  it('history display getSummary should return non-empty strings for valid logs', () => {
    const logs: Record<string, GameLog> = {
      'rhyme-time': createMockRhymeTimeLog(),
      'undercover-agent': createMockUndercoverAgentLog(),
      'category-crash': createMockCategoryCrashLog(),
      'wiki-race': createMockWikiRaceLog(),
    };

    for (const [gameId, log] of Object.entries(logs)) {
      const config = getHistoryDisplay(gameId)!;
      const summary = config.getSummary(log);
      expect(summary).toBeTruthy();
      expect(typeof summary).toBe('string');
      expect(summary.length).toBeGreaterThan(0);
    }
  });
});
