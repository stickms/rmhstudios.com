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
  MM_DRAWING_DURATION_SECONDS, MM_MAX_STROKES, MM_AUCTION_DURATION_SECONDS,
  MM_STARTING_CURRENCY, MM_BID_INCREMENT, MM_DEFAULT_ROUNDS,
  EC_MAX_ROUNDS, EC_ROUND_DURATION_SECONDS, EC_MAX_EMOJIS, EC_MAX_GUESSES_PER_PLAYER,
  WW_TOTAL_ROUNDS, WW_WRITING_DURATION, WW_VOTING_DURATION,
  FF_TOTAL_QUESTIONS, FF_ANSWER_DURATION_SECONDS, FF_POT_START_VALUE,
  UE_ROTATIONS, UE_WRITE_TIMEOUT_SECONDS, UE_EDIT_TIMEOUT_SECONDS, UE_ACCUSATION_DURATION_SECONDS,
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

export const MINIMALIST_MASTERPIECE_SETTINGS: GameSettingsSchema = [
  { key: 'roundCount', type: 'integer', label: 'Number of Rounds', description: 'Number of drawing/auction rounds to play', default: MM_DEFAULT_ROUNDS, min: 1, max: 5, step: 1 },
  { key: 'drawingDuration', type: 'integer', label: 'Drawing Duration (seconds)', description: 'Time the artist has to draw a single prompt', default: MM_DRAWING_DURATION_SECONDS, min: 20, max: 90, step: 5 },
  { key: 'maxStrokes', type: 'integer', label: 'Max Strokes', description: 'Maximum number of brush strokes allowed per drawing', default: MM_MAX_STROKES, min: 5, max: 30, step: 5 },
  { key: 'auctionDuration', type: 'integer', label: 'Auction Duration (seconds)', description: 'Time for the bidding phase on each artwork', default: MM_AUCTION_DURATION_SECONDS, min: 15, max: 60, step: 5 },
  { key: 'startingCurrency', type: 'integer', label: 'Starting Currency', description: 'Amount of currency each player starts with', default: MM_STARTING_CURRENCY, min: 200, max: 1000, step: 50 },
  { key: 'bidIncrement', type: 'integer', label: 'Minimum Bid Increment', description: 'Minimum amount above the current bid', default: MM_BID_INCREMENT, min: 10, max: 100, step: 5 },
];

export const EMOJI_CINEMA_SETTINGS: GameSettingsSchema = [
  { key: 'maxRounds', type: 'integer', label: 'Number of Rounds', description: 'Number of emoji-encoding rounds to play', default: EC_MAX_ROUNDS, min: 2, max: 6, step: 1 },
  { key: 'roundDuration', type: 'integer', label: 'Encoding Duration (seconds)', description: 'Time the encoder has to build their emoji sequence', default: EC_ROUND_DURATION_SECONDS, min: 20, max: 90, step: 5 },
  { key: 'maxEmojis', type: 'integer', label: 'Max Emojis', description: 'Maximum number of emojis the encoder can use', default: EC_MAX_EMOJIS, min: 3, max: 8, step: 1 },
  { key: 'maxGuessesPerPlayer', type: 'integer', label: 'Guesses Per Player', description: 'Maximum guesses each player can submit per round', default: EC_MAX_GUESSES_PER_PLAYER, min: 1, max: 5, step: 1 },
];

export const WIT_WAR_SETTINGS: GameSettingsSchema = [
  { key: 'totalRounds', type: 'integer', label: 'Number of Rounds', description: 'How many rounds of prompt matchups to play', default: WW_TOTAL_ROUNDS, min: 1, max: 3, step: 1 },
  { key: 'writingDuration', type: 'integer', label: 'Writing Duration (seconds)', description: 'Time players have to write answers to their prompts', default: WW_WRITING_DURATION, min: 30, max: 120, step: 10 },
  { key: 'votingDuration', type: 'integer', label: 'Voting Duration (seconds)', description: 'Time to vote on each head-to-head matchup', default: WW_VOTING_DURATION, min: 10, max: 30, step: 5 },
];

export const FACT_OR_FRICTION_SETTINGS: GameSettingsSchema = [
  { key: 'totalQuestions', type: 'integer', label: 'Number of Questions', description: 'How many trivia questions to play', default: FF_TOTAL_QUESTIONS, min: 4, max: 12, step: 1 },
  { key: 'answerDuration', type: 'integer', label: 'Answer Duration (seconds)', description: 'Time players have to lock in their answer each round', default: FF_ANSWER_DURATION_SECONDS, min: 10, max: 45, step: 5 },
  { key: 'potStartValue', type: 'integer', label: 'Starting Pot Value', description: 'Points in the pot at the start of each question', default: FF_POT_START_VALUE, min: 500, max: 2000, step: 100 },
  { key: 'enableScoreFloor', type: 'boolean', label: 'Score Floor', description: 'Prevent players from going below -500 points', default: true },
  { key: 'difficulty', type: 'select', label: 'Difficulty', description: 'Difficulty of the trivia questions', default: 'mixed', options: ['easy', 'medium', 'hard', 'mixed'] },
];

export const UNDERCOVER_EDITOR_SETTINGS: GameSettingsSchema = [
  { key: 'rotations', type: 'integer', label: 'Rotations', description: 'Number of write-edit cycles before accusation', default: UE_ROTATIONS, min: 1, max: 3, step: 1 },
  { key: 'writeTimeout', type: 'integer', label: 'Write Duration (seconds)', description: 'Time to write a sentence', default: UE_WRITE_TIMEOUT_SECONDS, min: 30, max: 90, step: 5 },
  { key: 'editTimeout', type: 'integer', label: 'Edit Duration (seconds)', description: 'Time for the Editor to make their secret edit', default: UE_EDIT_TIMEOUT_SECONDS, min: 15, max: 60, step: 5 },
  { key: 'accusationDuration', type: 'integer', label: 'Accusation Duration (seconds)', description: 'Time to vote on who the Editor was', default: UE_ACCUSATION_DURATION_SECONDS, min: 15, max: 60, step: 5 },
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
  'wit-war': {
    id: 'wit-war',
    displayName: 'Wit-War',
    description: 'Battle of wits! Write funny answers to prompts, then vote head-to-head for the best response.',
    category: 'word',
    icon: 'swords',
    minPlayers: 3,
    maxPlayers: 16,
    estimatedDurationSeconds: 240,
    supportsTeams: false,
    instructionDurationSeconds: 15,
    preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
    joinInProgressPolicy: 'spectate_only',
    tags: ['word', 'creative', 'voting', 'comedy'],
    settingsSchema: WIT_WAR_SETTINGS,
  },
  'fact-or-friction': {
    id: 'fact-or-friction',
    displayName: 'Fact or Friction',
    description: 'High-stakes trivia where wrong answers cost you! Race to answer for maximum points, but one mistake deducts from your score.',
    category: 'trivia',
    icon: 'flame',
    minPlayers: 2,
    maxPlayers: 16,
    estimatedDurationSeconds: 176,
    supportsTeams: false,
    instructionDurationSeconds: 15,
    preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
    joinInProgressPolicy: 'join_next_subround',
    tags: ['trivia', 'risk', 'speed', 'knowledge'],
    settingsSchema: FACT_OR_FRICTION_SETTINGS,
  },
  'undercover-editor': {
    id: 'undercover-editor',
    displayName: 'Undercover Editor',
    description: 'Write parallel stories together — but each story has a secret editor sneaking in a keyword. Can you match each story to its undercover editor?',
    category: 'creative',
    icon: 'pencil',
    minPlayers: 4,
    maxPlayers: 10,
    estimatedDurationSeconds: 300,
    supportsTeams: false,
    instructionDurationSeconds: 20,
    preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
    joinInProgressPolicy: 'spectate_only',
    tags: ['social-deduction', 'writing', 'creative', 'deception'],
    settingsSchema: UNDERCOVER_EDITOR_SETTINGS,
  },
  'minimalist-masterpiece': {
    id: 'minimalist-masterpiece',
    displayName: 'Minimalist Masterpiece',
    description: 'Draw with only 5 strokes, then bid on the art you think is best! The highest market value wins.',
    category: 'creative',
    icon: 'brush',
    minPlayers: 3,
    maxPlayers: 12,
    estimatedDurationSeconds: 148,
    supportsTeams: false,
    instructionDurationSeconds: 15,
    preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
    joinInProgressPolicy: 'spectate_only',
    tags: ['creative', 'drawing', 'auction', 'competitive'],
    settingsSchema: MINIMALIST_MASTERPIECE_SETTINGS,
  },
  'emoji-cinema': {
    id: 'emoji-cinema',
    displayName: 'Emoji Cinema',
    description: 'Describe movies using only emojis! Race to guess what film the Producer is depicting.',
    category: 'word',
    icon: 'clapperboard',
    minPlayers: 3,
    maxPlayers: 12,
    estimatedDurationSeconds: 180,
    supportsTeams: false,
    instructionDurationSeconds: 15,
    preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
    joinInProgressPolicy: 'join_next_subround',
    tags: ['word', 'creative', 'speed', 'movies', 'guessing'],
    settingsSchema: EMOJI_CINEMA_SETTINGS,
  },
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
  // 'cursor-curling': {
  //   id: 'cursor-curling',
  //   displayName: 'Cursor Curling',
  //   description: 'Slide your cursor stone closest to the target on a digital rink.',
  //   category: 'action',
  //   icon: '🥌',
  //   minPlayers: 2,
  //   maxPlayers: 8,
  //   estimatedDurationSeconds: 150,
  //   supportsTeams: false,
  //   instructionDurationSeconds: 15,
  //   preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
  //   joinInProgressPolicy: 'spectate_only',
  //   tags: ['action', 'physics'],
  // },
  // 'human-tetris': {
  //   id: 'human-tetris',
  //   displayName: 'Human Tetris',
  //   description: 'Cooperatively fit your team through approaching wall shapes.',
  //   category: 'action',
  //   icon: '🧱',
  //   minPlayers: 4,
  //   maxPlayers: 10,
  //   estimatedDurationSeconds: 120,
  //   supportsTeams: true,
  //   instructionDurationSeconds: 15,
  //   preloadAssets: { images: [], sounds: [], data: [], estimatedSizeBytes: 0 },
  //   joinInProgressPolicy: 'spectate_only',
  //   tags: ['action', 'cooperative'],
  // },
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
