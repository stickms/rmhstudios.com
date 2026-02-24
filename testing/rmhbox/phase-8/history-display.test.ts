/**
 * Phase 8 — History Display Tests for Identity Crisis & Ranking File
 *
 * Tests history display configuration per §8.1.16 and §8.2.15.
 *
 * Reference: docs/rmhbox/design-spec/core.md §14A.5
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getHistoryDisplay,
  type GameLog,
  type HistoryDisplayConfig,
} from '../../../lib/rmhbox/history-display-registry';

// Import registrations to trigger side effects
import '../../../lib/rmhbox/history-display-registrations';

// ─── Mock Game Logs ──────────────────────────────────────────────

const mockICGameLog: GameLog = {
  minigameId: 'identity-crisis',
  version: 1,
  players: [
    { userId: 'user-alice-001', userName: 'Alice' },
    { userId: 'user-bob-002', userName: 'Bob' },
  ],
  initialState: {
    identityAssignments: [
      { userId: 'user-alice-001', assignedIdentity: 'Albert Einstein' },
      { userId: 'user-bob-002', assignedIdentity: 'Mickey Mouse' },
    ],
  },
  actions: [
    { seq: 1, type: 'question_asked', payload: { askerId: 'user-alice-001', questionText: 'Am I a scientist?' }, timestamp: 1000 },
    { seq: 2, type: 'vote_result', payload: { yes: 2, no: 1, maybe: 0, majorityAnswer: 'yes' }, timestamp: 2000 },
    { seq: 3, type: 'early_guess', payload: { userId: 'user-alice-001', guess: 'Einstein', correct: true, roundNumber: 1 }, timestamp: 3000 },
    { seq: 4, type: 'final_guess', payload: { userId: 'user-bob-002', guess: 'Mickey', correct: true }, timestamp: 4000 },
    { seq: 5, type: 'identity_reveal', payload: { userId: 'user-alice-001', assignedIdentity: 'Albert Einstein', guessedCorrectly: true }, timestamp: 5000 },
  ],
  finalResults: [
    { userId: 'user-alice-001', userName: 'Alice', score: 100, rank: 1 },
    { userId: 'user-bob-002', userName: 'Bob', score: 80, rank: 2 },
  ],
};

const mockRFGameLog: GameLog = {
  minigameId: 'ranking-file',
  version: 1,
  players: [
    { userId: 'user-alice-001', userName: 'Alice' },
    { userId: 'user-bob-002', userName: 'Bob' },
  ],
  initialState: {},
  actions: [
    { seq: 1, type: 'round_start', payload: { category: 'Fast Food', items: ["McDonald's", 'Burger King', "Wendy's", 'Chick-fil-A', 'Taco Bell'], roundNumber: 1 }, timestamp: 1000 },
    { seq: 2, type: 'ranking_submitted', payload: { userId: 'user-alice-001' }, timestamp: 2000 },
    { seq: 3, type: 'round_result', payload: { consensusRanking: ["McDonald's", 'Chick-fil-A', 'Burger King', "Wendy's", 'Taco Bell'], playerScores: [] }, timestamp: 3000 },
    { seq: 4, type: 'round_start', payload: { category: '90s Movies', items: ['Titanic', 'Pulp Fiction', 'The Matrix', 'Forrest Gump', 'Jurassic Park'], roundNumber: 2 }, timestamp: 4000 },
  ],
  finalResults: [
    { userId: 'user-alice-001', userName: 'Alice', score: 150, rank: 1 },
    { userId: 'user-bob-002', userName: 'Bob', score: 120, rank: 2 },
  ],
};

// ─── Identity Crisis History Display (§8.1.16.3) ────────────────

describe('Identity Crisis History Display (§8.1.16.3)', () => {
  let config: HistoryDisplayConfig;

  beforeEach(() => {
    config = getHistoryDisplay('identity-crisis')!;
  });

  it('getHistoryDisplay should return a valid config', () => {
    expect(config).not.toBeNull();
    expect(config.minigameId).toBe('identity-crisis');
    expect(config.searchableFields.length).toBeGreaterThan(0);
    expect(config.filterableFields.length).toBeGreaterThan(0);
    expect(typeof config.getSummary).toBe('function');
  });

  it('searchable fields should extract identities from a mock game log', () => {
    const identitiesField = config.searchableFields.find((f) => f.key === 'identities')!;
    expect(identitiesField).toBeDefined();
    const extracted = identitiesField.extract(mockICGameLog);
    expect(extracted).toEqual(['Albert Einstein', 'Mickey Mouse']);
  });

  it('searchable fields should extract questions from a mock game log', () => {
    const questionsField = config.searchableFields.find((f) => f.key === 'questions')!;
    expect(questionsField).toBeDefined();
    const extracted = questionsField.extract(mockICGameLog);
    expect(extracted).toEqual(['Am I a scientist?']);
  });

  it('filterable fields should include guessedCorrectly, madeEarlyGuess, identityCategory', () => {
    const keys = config.filterableFields.map((f) => f.key);
    expect(keys).toContain('guessedCorrectly');
    expect(keys).toContain('madeEarlyGuess');
    expect(keys).toContain('identityCategory');

    const guessedCorrectly = config.filterableFields.find((f) => f.key === 'guessedCorrectly')!;
    expect(guessedCorrectly.type).toBe('boolean');

    const madeEarlyGuess = config.filterableFields.find((f) => f.key === 'madeEarlyGuess')!;
    expect(madeEarlyGuess.type).toBe('boolean');

    const identityCategory = config.filterableFields.find((f) => f.key === 'identityCategory')!;
    expect(identityCategory.type).toBe('select');
  });

  it('getSummary should return a meaningful string for a mock game log', () => {
    const summary = config.getSummary(mockICGameLog);
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
    // The registration counts final_guess actions with correct=true
    expect(summary).toContain('correct guesses');
  });

  it('DetailComponent should be defined', () => {
    expect(config.DetailComponent).toBeDefined();
  });
});

// ─── Ranking File History Display (§8.2.15.3) ───────────────────

describe('Ranking File History Display (§8.2.15.3)', () => {
  let config: HistoryDisplayConfig;

  beforeEach(() => {
    config = getHistoryDisplay('ranking-file')!;
  });

  it('getHistoryDisplay should return a valid config', () => {
    expect(config).not.toBeNull();
    expect(config.minigameId).toBe('ranking-file');
    expect(config.searchableFields.length).toBeGreaterThan(0);
    expect(config.filterableFields.length).toBeGreaterThan(0);
    expect(typeof config.getSummary).toBe('function');
  });

  it('searchable fields should extract categories from a mock game log', () => {
    const categoriesField = config.searchableFields.find((f) => f.key === 'categories')!;
    expect(categoriesField).toBeDefined();
    const extracted = categoriesField.extract(mockRFGameLog);
    expect(extracted).toEqual(['Fast Food', '90s Movies']);
  });

  it('searchable fields should extract items from a mock game log', () => {
    const itemsField = config.searchableFields.find((f) => f.key === 'items')!;
    expect(itemsField).toBeDefined();
    const extracted = itemsField.extract(mockRFGameLog);
    expect(extracted).toEqual(["McDonald's", 'Burger King', "Wendy's", 'Chick-fil-A', 'Taco Bell', 'Titanic', 'Pulp Fiction', 'The Matrix', 'Forrest Gump', 'Jurassic Park']);
  });

  it('filterable fields should include exactMatches, wasOutlier, roundCount', () => {
    const keys = config.filterableFields.map((f) => f.key);
    expect(keys).toContain('exactMatches');
    expect(keys).toContain('wasOutlier');
    expect(keys).toContain('roundCount');

    const exactMatches = config.filterableFields.find((f) => f.key === 'exactMatches')!;
    expect(exactMatches.type).toBe('range');

    const wasOutlier = config.filterableFields.find((f) => f.key === 'wasOutlier')!;
    expect(wasOutlier.type).toBe('boolean');

    const roundCount = config.filterableFields.find((f) => f.key === 'roundCount')!;
    expect(roundCount.type).toBe('range');
  });

  it('getSummary should return a meaningful string for a mock game log', () => {
    const summary = config.getSummary(mockRFGameLog);
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
    // The registration counts round_start actions and joins categories
    expect(summary).toContain('2 rounds');
    expect(summary).toContain('Fast Food');
    expect(summary).toContain('90s Movies');
  });

  it('DetailComponent should be defined', () => {
    expect(config.DetailComponent).toBeDefined();
  });
});
