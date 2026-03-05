export type PuzzleCategory =
    | 'math'
    | 'pattern'
    | 'language'
    | 'spatial'
    | 'memory'
    | 'reaction'
    | 'minigame'
    | 'fling'
    | 'powerup'
    | 'meta'
    | 'emoji'
    | 'trivia'
    | 'roman';

export interface PuzzleDefinition {
    id: string;
    category: PuzzleCategory;
    instruction: string;
    difficulty: number; // 1-10
    timeLimit: number; // seconds
    basePoints: number;
    isPriority?: boolean;
    data: PuzzleData;
}

export interface MetaPuzzleData {
    type: 'meta';
    variant: 'gameTime' | 'lives' | 'intensity' | 'combo' | 'maxCombo' | 'activeCount' | 'realTimeHour' | 'score';
    answer?: number;
    options?: number[];
}

export interface MathPuzzleData {
    type: 'math';
    variant: 'arithmetic' | 'algebra' | 'geometry' | 'compare' | 'nearest' | 'operator' | 'percent' | 'sequence' | 'digit_sum' | 'modulo' | 'power' | 'prime_check';
    expression: string;
    answer: number | string;
    options?: (number | string)[];
}

export interface PatternPuzzleData {
    type: 'pattern';
    variant: 'alternating' | 'growing' | 'rotating' | 'color_cycle' | 'fibonacci' | 'double_step';
    sequence: ShapeInfo[];
    answer: ShapeInfo;
    options: ShapeInfo[];
    missingIndex: number;
    // For numeric sequence variants, store the numeric context
    numericSequence?: number[];
    numericAnswer?: number;
    numericOptions?: number[];
}

export interface LanguagePuzzleData {
    type: 'language';
    variant: 'typing' | 'anagram' | 'spelling' | 'vowels' | 'reverse' | 'category' | 'affix' | 'consonants' | 'length' | 'palindrome' | 'first_letter' | 'rhyme';
    prompt: string;
    answer: string;
    options?: string[];
}

export interface SpatialPuzzleData {
    type: 'spatial';
    variant: 'count' | 'match' | 'odd' | 'color' | 'size' | 'rotation' | 'pair';
    shapes: ShapeInfo[];
    answer: number | string;
    answerIndices?: number[];
    options?: (number | string)[];
}

export interface ShapeInfo {
    shape: 'circle' | 'square' | 'triangle' | 'diamond' | 'hexagon';
    color: string;
    size: number;
    rotation?: number;
}

export interface MemoryPuzzleData {
    type: 'memory';
    variant: 'numbers' | 'colors' | 'shapes';
    sequence: (string | number)[];
    showDuration: number; // ms
    inputDuration: number; // ms
}

export interface ReactionPuzzleData {
    type: 'reaction';
    variant: 'click' | 'sequence' | 'moving' | 'decoy' | 'double' | 'jitter' | 'burst';
    targetCount: number;
    decoys?: number;
}

export type FlingDirection = 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface MinigamePuzzleData {
    type: 'minigame';
    variant: 'click_when_go' | 'whack' | 'pick_biggest' | 'pick_odd' | 'double_tap' | 'dont_click' | 'countdown' | 'tap_fast' | 'fling_direction';
    shapes?: ShapeInfo[];
    answerIndex?: number;
    targetDirection?: FlingDirection;
}

export interface PowerUpPuzzleData {
    type: 'powerup';
    variant: 'timeDilation' | 'purge' | 'secondChance';
    actionType: 'slider' | 'spam' | 'hold';
    targetValue: number;
    effectDescription: string;
}

export interface EmojiPuzzleData {
    type: 'emoji';
    variant: 'odd_one_out' | 'count' | 'match' | 'sequence';
    prompt: string;
    answer: string;
    options: string[];
}

export interface TriviaPuzzleData {
    type: 'trivia';
    question: string;
    answer: string;
    options: string[];
}

export interface RomanPuzzleData {
    type: 'roman';
    variant: 'to_decimal' | 'to_roman';
    roman: string;
    decimal: number;
    answer: string;
    options: string[];
}

// Union type for all puzzle data
export type PuzzleData =
    | MathPuzzleData
    | PatternPuzzleData
    | LanguagePuzzleData
    | SpatialPuzzleData
    | MemoryPuzzleData
    | ReactionPuzzleData
    | MinigamePuzzleData
    | PowerUpPuzzleData
    | MetaPuzzleData
    | EmojiPuzzleData
    | TriviaPuzzleData
    | RomanPuzzleData;

export interface ActivePuzzle extends PuzzleDefinition {
    spawnTime: number;
    timeRemaining: number;
    solved: boolean;
    expired: boolean;
    position: { x: number; y: number };
    memoryPhase?: 'show' | 'input';
    memoryShowEndsAt?: number;
}

export interface GameState {
    status: 'menu' | 'playing' | 'gameover';
    score: number;
    combo: number;
    maxCombo: number;
    difficulty: number;
    puzzlesSolved: number;
    puzzlesMissed: number;
    activePuzzles: ActivePuzzle[];
    totalTime: number;
    startTime: number;
    lastTickAt: number;
    missThreshold: number;
    maxActivePuzzles: number;
    correctStreak: number;
    speedBonus: number;
    burstActive: boolean;
    burstEndsAt: number;
    nextBurstAt: number;
    lastPowerupSpawnAt: number;
    activeEffect: { type: 'timeDilation' | 'purge' | 'secondChance'; endsAt: number } | null;
    isSaturated: boolean;
}

export interface DifficultyConfig {
    spawnInterval: number;
    minTimeLimit: number;
    maxActiveCategories: number;
    multiStepChance: number;
}

export const CATEGORY_COLORS: Record<PuzzleCategory, string> = {
    math: '#00e5ff',
    pattern: '#ff6ec7',
    language: '#76ff03',
    spatial: '#ffab00',
    memory: '#b388ff',
    reaction: '#ff5252',
    minigame: '#ff4081',
    fling: '#ff4081',
    powerup: '#ffd740',
    meta: '#9c27b0',
    emoji: '#ffeb3b',
    trivia: '#e040fb',
    roman: '#ffc107',
};

export const SHAPE_COLOR_NAMES: Record<string, string> = {
    '#ff5252': 'Red',
    '#00e5ff': 'Cyan',
    '#76ff03': 'Green',
    '#ffab00': 'Orange',
    '#b388ff': 'Purple',
    '#ff6ec7': 'Pink',
};

export const CATEGORY_LABELS: Record<PuzzleCategory, string> = {
    math: '🧮 Math',
    pattern: '🔄 Pattern',
    language: '📝 Language',
    spatial: '🔲 Spatial',
    memory: '🧠 Memory',
    reaction: '⚡ Reaction',
    minigame: '🎮 Mini',
    fling: '👉 Fling',
    powerup: '⭐ Power-Up',
    meta: '🎯 Meta',
    emoji: '😀 Emoji',
    trivia: '🧩 Trivia',
    roman: '🏛️ Roman',
};

export const CATEGORY_ICONS: Record<PuzzleCategory, string> = {
    math: '🧮',
    pattern: '🔄',
    language: '📝',
    spatial: '🔲',
    memory: '🧠',
    reaction: '⚡',
    minigame: '🎮',
    fling: '👉',
    powerup: '⭐',
    meta: '🎯',
    emoji: '😀',
    trivia: '🧩',
    roman: '🏛️',
};
