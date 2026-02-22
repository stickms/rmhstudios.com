export type PuzzleCategory =
    | 'math'
    | 'pattern'
    | 'language'
    | 'spatial'
    | 'memory'
    | 'reaction'
    | 'powerup';

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

// Union type for all puzzle data
export type PuzzleData =
    | MathPuzzleData
    | PatternPuzzleData
    | LanguagePuzzleData
    | SpatialPuzzleData
    | MemoryPuzzleData
    | ReactionPuzzleData
    | PowerUpPuzzleData;

export interface MathPuzzleData {
    type: 'math';
    variant: 'arithmetic' | 'algebra' | 'geometry' | 'compare' | 'nearest' | 'operator';
    expression: string;
    answer: number | string;
    options?: (number | string)[];
}

export interface PatternPuzzleData {
    type: 'pattern';
    variant: 'alternating' | 'growing' | 'rotating';
    sequence: ShapeInfo[];
    answer: ShapeInfo;
    options: ShapeInfo[];
    missingIndex: number;
}

export interface LanguagePuzzleData {
    type: 'language';
    variant: 'typing' | 'anagram' | 'spelling' | 'vowels' | 'reverse' | 'category' | 'affix';
    prompt: string;
    answer: string;
    options?: string[];
}

export interface SpatialPuzzleData {
    type: 'spatial';
    variant: 'count' | 'match' | 'odd' | 'color' | 'size' | 'rotation';
    shapes: ShapeInfo[];
    answer: number | string;
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
    variant: 'numbers' | 'colors';
    sequence: (string | number)[];
    showDuration: number; // ms
    inputDuration: number; // ms - for the second phase
}

export interface ReactionPuzzleData {
    type: 'reaction';
    variant: 'click' | 'sequence' | 'moving' | 'decoy' | 'double' | 'jitter';
    targetCount: number;
    decoys?: number;
}

export interface PowerUpPuzzleData {
    type: 'powerup';
    variant: 'timeDilation' | 'purge' | 'secondChance';
    actionType: 'slider' | 'spam' | 'hold';
    targetValue: number;
    effectDescription: string;
}

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
    spawnInterval: number; // ms between spawns
    minTimeLimit: number; // minimum seconds for puzzle timer
    maxActiveCategories: number; // how many categories are in pool
    multiStepChance: number; // 0-1 chance of harder puzzles
}

export const CATEGORY_COLORS: Record<PuzzleCategory, string> = {
    math: '#00e5ff',
    pattern: '#ff6ec7',
    language: '#76ff03',
    spatial: '#ffab00',
    memory: '#b388ff',
    reaction: '#ff5252',
    powerup: '#ffd740',
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
    powerup: '⭐ Power-Up',
};
