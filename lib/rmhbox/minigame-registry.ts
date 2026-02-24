/**
 * RMHbox — Minigame Registry
 *
 * Maps minigame IDs to their metadata definitions.
 * Used for voting candidate selection, lobby validation,
 * and client-side game loading.
 *
 * Reference: docs/rmhbox/design-spec/core.md §20 (MinigameDefinition)
 */

import type { MinigameDefinition, GameSettingsSchema } from './types';
import {
  RT_TOTAL_ROUNDS, RT_INPUT_DURATION, RT_MAX_SUBMISSIONS,
  RT_SPEED_BONUS, RT_MULTI_SYLLABLE_MULT, RT_INVALID_PENALTY,
  UA_ASSASSIN,
  CC_TOTAL_ROUNDS, CC_INPUT_DURATION, CC_CATEGORIES_PER_ROUND,
  CC_PEER_REVIEW_DURATION, CC_CRASH_THRESHOLD_PERCENT,
  WR_NAV_DURATION, WR_EFFICIENCY_BONUS, WR_ONE_AWAY, WR_TOTAL_ROUNDS,
  CU_TOTAL_ENDS, CU_AIM_DURATION_SECONDS, CU_POWER_DURATION_SECONDS,
  HT_TOTAL_WAVES, HT_WALL_PREVIEW_SECONDS, HT_EASY_POSITION_SECONDS,
} from './constants';

// ─── Per-Minigame Settings Schemas ───────────────────────────────

export const RHYME_TIME_SETTINGS: GameSettingsSchema = [
  { key: 'totalRounds', type: 'integer', label: 'Number of Rounds', description: 'How many rounds of rhyming to play', default: RT_TOTAL_ROUNDS, min: 1, max: 5, step: 1 },
  { key: 'inputDuration', type: 'integer', label: 'Round Duration (seconds)', description: 'Time players have to submit rhymes each round', default: RT_INPUT_DURATION, min: 20, max: 90, step: 5 },
  { key: 'maxSubmissions', type: 'integer', label: 'Max Submissions', description: 'Maximum number of rhymes a player can submit per round', default: RT_MAX_SUBMISSIONS, min: 10, max: 50, step: 5 },
  { key: 'enableSpeedBonus', type: 'boolean', label: 'Speed Bonus', description: 'Award bonus points for submitting rare rhymes first', default: RT_SPEED_BONUS > 0 },
  { key: 'enableMultiSyllableBonus', type: 'boolean', label: 'Multi-Syllable Bonus', description: 'Double points for rhymes with more syllables than the root word', default: RT_MULTI_SYLLABLE_MULT > 1 },
  { key: 'invalidPenalty', type: 'integer', label: 'Invalid Rhyme Penalty', description: 'Points deducted for submitting a non-rhyming word', default: RT_INVALID_PENALTY, min: -5, max: 0, step: 1 },
];

export const UNDERCOVER_AGENT_SETTINGS: GameSettingsSchema = [
  { key: 'enableAssassin', type: 'boolean', label: 'Assassin Tile', description: 'Include the instant-loss assassin tile on the board', default: UA_ASSASSIN > 0 },
];

export const CATEGORY_CRASH_SETTINGS: GameSettingsSchema = [
  { key: 'totalRounds', type: 'integer', label: 'Number of Rounds', description: 'How many rounds to play', default: CC_TOTAL_ROUNDS, min: 1, max: 4, step: 1 },
  { key: 'inputDuration', type: 'integer', label: 'Brainstorm Duration (seconds)', description: 'Time to fill in answers for all categories', default: CC_INPUT_DURATION, min: 30, max: 120, step: 10 },
  { key: 'categoriesPerRound', type: 'integer', label: 'Categories Per Round', description: 'Number of categories to fill in each round', default: CC_CATEGORIES_PER_ROUND, min: 3, max: 7, step: 1 },
  { key: 'peerReviewDuration', type: 'integer', label: 'Peer Review Duration (seconds)', description: 'Time for players to review and challenge answers', default: CC_PEER_REVIEW_DURATION, min: 15, max: 60, step: 5 },
  { key: 'crashThreshold', type: 'integer', label: 'Crash Threshold (%)', description: 'Percentage of votes needed to reject a contested answer', default: CC_CRASH_THRESHOLD_PERCENT, min: 30, max: 80, step: 5 },
];

export const WIKI_RACE_SETTINGS: GameSettingsSchema = [
  { key: 'totalRounds', type: 'integer', label: 'Number of Rounds', description: 'How many rounds of racing to play', default: WR_TOTAL_ROUNDS, min: 1, max: 5, step: 1 },
  { key: 'navDuration', type: 'integer', label: 'Race Duration (seconds)', description: 'Total time to navigate from start article to target', default: WR_NAV_DURATION, min: 60, max: 300, step: 15 },
  { key: 'enableEfficiencyBonus', type: 'boolean', label: 'Efficiency Bonus', description: 'Award bonus points for reaching the target in fewer clicks', default: WR_EFFICIENCY_BONUS > 0 },
  { key: 'enableOneAwayPoints', type: 'boolean', label: '"One Away" Points', description: 'Award consolation points to players who were one click from the target', default: WR_ONE_AWAY > 0 },
];

export const CURSOR_CURLING_SETTINGS: GameSettingsSchema = [
  { key: 'totalEnds', type: 'integer', label: 'Number of Ends', description: 'How many ends (rounds) to play', default: CU_TOTAL_ENDS, min: 2, max: 6, step: 1 },
  { key: 'aimDuration', type: 'integer', label: 'Aim Duration (seconds)', description: 'Time players have to aim their stone', default: CU_AIM_DURATION_SECONDS, min: 5, max: 30, step: 5 },
  { key: 'powerDuration', type: 'integer', label: 'Power Duration (seconds)', description: 'Time to set the throw power', default: CU_POWER_DURATION_SECONDS, min: 3, max: 10, step: 1 },
  { key: 'enableSweeping', type: 'boolean', label: 'Sweeping', description: 'Allow teammates to sweep the stone after release', default: true },
];

export const HUMAN_TETRIS_SETTINGS: GameSettingsSchema = [
  { key: 'totalWaves', type: 'integer', label: 'Number of Waves', description: 'How many wall-shape waves to survive', default: HT_TOTAL_WAVES, min: 4, max: 12, step: 1 },
  { key: 'wallPreviewDuration', type: 'integer', label: 'Wall Preview (seconds)', description: 'Time players see the incoming wall shape before it arrives', default: HT_WALL_PREVIEW_SECONDS, min: 2, max: 10, step: 1 },
  { key: 'startingPositionTime', type: 'integer', label: 'Position Time (seconds)', description: 'Time players have to move into position', default: HT_EASY_POSITION_SECONDS, min: 4, max: 15, step: 1 },
  { key: 'enableDeadZones', type: 'boolean', label: 'Dead Zones', description: 'Enable grid cells that eliminate players on contact', default: false },
];

// ─── Registry ────────────────────────────────────────────────────

export const MINIGAME_REGISTRY: Record<string, MinigameDefinition> = {
  'rhyme-time': {
    id: 'rhyme-time',
    displayName: 'Rhyme Time',
    description: 'High-speed vocabulary sprint. Race to type valid rhymes — common rhymes score low, rare ones score big!',
    category: 'word',
    icon: 'mic-vocal',
    minPlayers: 2,
    maxPlayers: 16,
    estimatedDurationSeconds: 171,
    supportsTeams: false,
    instructionDurationSeconds: 15,
    preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
    joinInProgressPolicy: 'spectate_only',
    tags: ['word', 'speed', 'competitive', 'vocabulary'],
    settingsSchema: RHYME_TIME_SETTINGS,
  },
  'undercover-agent': {
    id: 'undercover-agent',
    displayName: 'Undercover Agent',
    description: 'Team-based word-association espionage. Spymasters give clues, Operatives guess tiles. Avoid the Assassin!',
    category: 'word',
    icon: 'shield-check',
    minPlayers: 4,
    maxPlayers: 16,
    estimatedDurationSeconds: 180,
    supportsTeams: true,
    instructionDurationSeconds: 15,
    preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
    joinInProgressPolicy: 'spectate_only',
    tags: ['word', 'teams', 'strategy', 'deduction'],
    settingsSchema: UNDERCOVER_AGENT_SETTINGS,
  },
  'category-crash': {
    id: 'category-crash',
    displayName: 'Category Crash',
    description: 'Brainstorming showdown! Fill categories with a random letter, then crash your opponents\' answers.',
    category: 'word',
    icon: 'list-collapse',
    minPlayers: 3,
    maxPlayers: 16,
    estimatedDurationSeconds: 212,
    supportsTeams: false,
    instructionDurationSeconds: 15,
    preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
    joinInProgressPolicy: 'join_next_subround',
    tags: ['word', 'categories'],
    settingsSchema: CATEGORY_CRASH_SETTINGS,
  },
  'wiki-race': {
    id: 'wiki-race',
    displayName: 'Wiki-Race',
    description: 'Competitive scavenger hunt through Wikipedia. Navigate from start to target using only internal links!',
    category: 'trivia',
    icon: 'globe',
    minPlayers: 2,
    maxPlayers: 10,
    estimatedDurationSeconds: 193,
    supportsTeams: false,
    instructionDurationSeconds: 15,
    preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
    joinInProgressPolicy: 'spectate_only',
    tags: ['trivia', 'race'],
    settingsSchema: WIKI_RACE_SETTINGS,
  },
  // ─── Unimplemented Minigames (commented out until server handlers exist) ───
  // 'fact-or-friction': {
  //   id: 'fact-or-friction',
  //   displayName: 'Fact or Friction',
  //   description: 'Distinguish real facts from convincing fakes.',
  //   category: 'trivia',
  //   icon: '🤔',
  //   minPlayers: 2,
  //   maxPlayers: 16,
  //   estimatedDurationSeconds: 120,
  //   supportsTeams: false,
  //   instructionDurationSeconds: 15,
  //   preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
  //   joinInProgressPolicy: 'join_next_subround',
  //   tags: ['trivia', 'bluffing'],
  // },
  // 'undercover-editor': {
  //   id: 'undercover-editor',
  //   displayName: 'Undercover Editor',
  //   description: 'Collaboratively write a story — but one editor is sabotaging it.',
  //   category: 'creative',
  //   icon: '✏️',
  //   minPlayers: 4,
  //   maxPlayers: 10,
  //   estimatedDurationSeconds: 240,
  //   supportsTeams: false,
  //   instructionDurationSeconds: 20,
  //   preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
  //   joinInProgressPolicy: 'spectate_only',
  //   tags: ['creative', 'deduction'],
  // },
  // 'minimalist-masterpiece': {
  //   id: 'minimalist-masterpiece',
  //   displayName: 'Minimalist Masterpiece',
  //   description: 'Draw with limited strokes — the audience bids on your art.',
  //   category: 'creative',
  //   icon: '🎨',
  //   minPlayers: 3,
  //   maxPlayers: 12,
  //   estimatedDurationSeconds: 150,
  //   supportsTeams: false,
  //   instructionDurationSeconds: 15,
  //   preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
  //   joinInProgressPolicy: 'spectate_only',
  //   tags: ['creative', 'drawing', 'auction'],
  // },
  // 'emoji-cinema': {
  //   id: 'emoji-cinema',
  //   displayName: 'Emoji Cinema',
  //   description: 'Describe movies using only emojis — others guess the title.',
  //   category: 'word',
  //   icon: '🎬',
  //   minPlayers: 3,
  //   maxPlayers: 12,
  //   estimatedDurationSeconds: 180,
  //   supportsTeams: false,
  //   instructionDurationSeconds: 15,
  //   preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
  //   joinInProgressPolicy: 'join_next_subround',
  //   tags: ['word', 'emoji', 'movies'],
  // },
  // 'sequence-sam': {
  //   id: 'sequence-sam',
  //   displayName: 'Sequence Sam',
  //   description: 'Memorize and replicate increasingly complex sequences.',
  //   category: 'action',
  //   icon: '🧠',
  //   minPlayers: 2,
  //   maxPlayers: 10,
  //   estimatedDurationSeconds: 120,
  //   supportsTeams: false,
  //   instructionDurationSeconds: 15,
  //   preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
  //   joinInProgressPolicy: 'spectate_only',
  //   tags: ['action', 'memory'],
  // },
  // 'human-keyboard': {
  //   id: 'human-keyboard',
  //   displayName: 'Human Keyboard',
  //   description: 'Each player controls one key — type words together cooperatively.',
  //   category: 'action',
  //   icon: '⌨️',
  //   minPlayers: 3,
  //   maxPlayers: 10,
  //   estimatedDurationSeconds: 120,
  //   supportsTeams: true,
  //   instructionDurationSeconds: 15,
  //   preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
  //   joinInProgressPolicy: 'spectate_only',
  //   tags: ['action', 'cooperative'],
  // },
  'cursor-curling': {
    id: 'cursor-curling',
    displayName: 'Cursor Curling',
    description: 'Slide your cursor stone closest to the target on a digital rink.',
    category: 'action',
    icon: 'target',
    minPlayers: 2,
    maxPlayers: 8,
    estimatedDurationSeconds: 120,
    supportsTeams: false,
    instructionDurationSeconds: 15,
    preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
    joinInProgressPolicy: 'spectate_only',
    tags: ['action', 'physics', 'precision', 'competitive'],
    settingsSchema: CURSOR_CURLING_SETTINGS,
  },
  'human-tetris': {
    id: 'human-tetris',
    displayName: 'Human Tetris',
    description: 'Cooperatively fit your team through approaching wall shapes.',
    category: 'action',
    icon: 'square-stack',
    minPlayers: 4,
    maxPlayers: 10,
    estimatedDurationSeconds: 120,
    supportsTeams: true,
    instructionDurationSeconds: 15,
    preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
    joinInProgressPolicy: 'spectate_only',
    tags: ['action', 'coordination', 'cooperative', 'spatial'],
    settingsSchema: HUMAN_TETRIS_SETTINGS,
  },
  // 'identity-crisis': {
  //   id: 'identity-crisis',
  //   displayName: 'Identity Crisis',
  //   description: 'Figure out who you are by asking yes/no questions.',
  //   category: 'word',
  //   icon: '🎭',
  //   minPlayers: 3,
  //   maxPlayers: 10,
  //   estimatedDurationSeconds: 180,
  //   supportsTeams: false,
  //   instructionDurationSeconds: 15,
  //   preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
  //   joinInProgressPolicy: 'spectate_only',
  //   tags: ['word', 'deduction'],
  // },
  // 'ranking-file': {
  //   id: 'ranking-file',
  //   displayName: 'Ranking File',
  //   description: 'Rank items in the correct order — closest to the official ranking wins.',
  //   category: 'trivia',
  //   icon: '📊',
  //   minPlayers: 3,
  //   maxPlayers: 12,
  //   estimatedDurationSeconds: 120,
  //   supportsTeams: false,
  //   instructionDurationSeconds: 15,
  //   preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
  //   joinInProgressPolicy: 'join_next_subround',
  //   tags: ['trivia', 'ranking'],
  // },
  // 'pixel-pushers': {
  //   id: 'pixel-pushers',
  //   displayName: 'Pixel Pushers',
  //   description: 'Cooperatively push pixels to match a target pattern using physics.',
  //   category: 'action',
  //   icon: '👾',
  //   minPlayers: 2,
  //   maxPlayers: 8,
  //   estimatedDurationSeconds: 120,
  //   supportsTeams: true,
  //   instructionDurationSeconds: 15,
  //   preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
  //   joinInProgressPolicy: 'join_immediately',
  //   tags: ['action', 'cooperative', 'physics'],
  // },
  // 'scroll-soul': {
  //   id: 'scroll-soul',
  //   displayName: 'Scroll Soul',
  //   description: 'Survive a fast-scrolling obstacle course — last one standing wins.',
  //   category: 'action',
  //   icon: '📜',
  //   minPlayers: 2,
  //   maxPlayers: 16,
  //   estimatedDurationSeconds: 90,
  //   supportsTeams: false,
  //   instructionDurationSeconds: 15,
  //   preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
  //   joinInProgressPolicy: 'spectate_only',
  //   tags: ['action', 'survival'],
  // },
};

// ─── Helper ──────────────────────────────────────────────────────

/**
 * Returns all minigames eligible for the given player count.
 * Filters by minPlayers <= playerCount <= maxPlayers.
 */
export function getEligibleMinigames(playerCount: number): MinigameDefinition[] {
  return Object.values(MINIGAME_REGISTRY).filter(
    (game) => playerCount >= game.minPlayers && playerCount <= game.maxPlayers,
  );
}

/**
 * Returns ALL registered minigames (no player count filter).
 */
export function getAllMinigames(): MinigameDefinition[] {
  return Object.values(MINIGAME_REGISTRY);
}

/**
 * Checks whether a minigame can be played with the given player count.
 */
export function isMinigamePlayable(minigameId: string, playerCount: number): boolean {
  const game = MINIGAME_REGISTRY[minigameId];
  if (!game) return false;
  return playerCount >= game.minPlayers && playerCount <= game.maxPlayers;
}
