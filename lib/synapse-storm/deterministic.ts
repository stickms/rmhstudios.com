/**
 * Deterministic PRNG and puzzle generation for multiplayer fairness.
 * All players receive the same puzzle stream given the same seed.
 */

import type {
    PuzzleDefinition,
    PuzzleCategory,
    ShapeInfo,
    LanguagePuzzleData,
    SpatialPuzzleData,
    MemoryPuzzleData,
    ReactionPuzzleData,
    PowerUpPuzzleData,
} from './types';
import { SHAPE_COLOR_NAMES } from './types';

// ─── Mulberry32 PRNG ───

export class SeededRNG {
    private state: number;

    constructor(seed: number) {
        this.state = seed | 0;
    }

    next(): number {
        this.state = (this.state + 0x6D2B79F5) | 0;
        let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    nextInt(min: number, max: number): number {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    pick<T>(arr: readonly T[]): T {
        return arr[Math.floor(this.next() * arr.length)];
    }

    shuffle<T>(arr: readonly T[]): T[] {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(this.next() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }
}

export function createSpawnRNG(matchSeed: number, spawnIndex: number): SeededRNG {
    const combined = matchSeed ^ (spawnIndex * 2654435761);
    return new SeededRNG(combined);
}

// ─── Deterministic spawn timing ───

export function getSpawnTimeForIndex(index: number, matchStartAt: number): number {
    const rng = new SeededRNG(index * 7919);
    let elapsed = 1000; // first spawn at 1s
    for (let i = 0; i < index; i++) {
        const progress = Math.min(1, i / 80);
        const difficulty = 1 + progress * 9;
        const baseInterval = Math.max(600, 3000 - difficulty * 200);
        const jitter = (rng.next() - 0.5) * 400;
        elapsed += baseInterval + jitter;
    }
    return matchStartAt + elapsed;
}

export function computeSpawnsUpTo(
    now: number,
    matchStartAt: number,
    lastSpawnIndex: number,
    maxActive: number,
    currentActiveCount: number
): { newSpawnIndices: number[]; nextSpawnIndex: number } {
    const newSpawnIndices: number[] = [];
    let idx = lastSpawnIndex;
    const maxNewSpawns = Math.max(0, maxActive - currentActiveCount);

    for (let attempt = 0; attempt < 50; attempt++) {
        const spawnTime = getSpawnTimeForIndex(idx, matchStartAt);
        if (spawnTime > now) break;
        if (newSpawnIndices.length < maxNewSpawns) {
            newSpawnIndices.push(idx);
        }
        idx++;
    }

    return { newSpawnIndices, nextSpawnIndex: idx };
}

// ─── Deterministic puzzle generator ───

const SHAPE_TYPES: ShapeInfo['shape'][] = ['circle', 'square', 'triangle', 'diamond', 'hexagon'];
const SHAPE_COLORS = ['#ff5252', '#00e5ff', '#76ff03', '#ffab00', '#b388ff', '#ff6ec7'];

const WORDS_POOL = [
    'brain', 'storm', 'pulse', 'nerve', 'focus', 'react', 'spark',
    'flash', 'swift', 'blaze', 'sharp', 'logic', 'think', 'solve',
    'power', 'speed', 'chess', 'pixel', 'glyph', 'nexus', 'prime',
    'crypt', 'omega', 'delta', 'sigma', 'alpha', 'laser', 'sonic',
    'turbo', 'hyper', 'ultra', 'cyber', 'boost', 'flame', 'frost',
    'lunar', 'solar', 'astro', 'quark', 'prism', 'surge', 'drift',
];

const CATEGORIES_ORDER: PuzzleCategory[] = ['math', 'pattern', 'language', 'spatial', 'reaction', 'memory'];

function scrambleWordSeeded(word: string, rng: SeededRNG): string {
    if (word.length <= 3) return word;
    const first = word[0];
    const last = word[word.length - 1];
    const inner = word.substring(1, word.length - 1).split('');
    const shuffled = rng.shuffle(inner);
    const scrambled = first + shuffled.join('') + last;
    return scrambled === word ? scrambleWordSeeded(word, rng) : scrambled;
}

function genMathDeterministic(rng: SeededRNG, difficulty: number): PuzzleDefinition {
    const types: ('arithmetic' | 'algebra' | 'geometry' | 'compare' | 'nearest' | 'operator')[] = ['arithmetic', 'compare', 'nearest', 'operator'];
    if (difficulty > 2) types.push('algebra');
    if (difficulty > 3) types.push('geometry');
    const ptype = rng.pick(types);

    let answer: number | string = 0, expression = '', instruction = '';
    let options: (number | string)[] | undefined;

    if (ptype === 'algebra') {
        const x = rng.nextInt(1, 12);
        const a = rng.nextInt(2, 5);
        const b = rng.nextInt(1, 10);
        const isAdd = rng.next() > 0.5;
        const c = isAdd ? a * x + b : a * x - b;
        answer = x;
        expression = isAdd ? `${a}x + ${b} = ${c}` : `${a}x - ${b} = ${c}`;
        instruction = 'Solve for x';
        options = rng.shuffle([answer, answer + rng.nextInt(1, 4), (answer - rng.nextInt(1, 4)) || answer + 5, answer + rng.nextInt(5, 8)]);
    } else if (ptype === 'geometry') {
        const w = rng.nextInt(3, 12);
        const h = rng.nextInt(3, 12);
        const isArea = rng.next() > 0.5;
        answer = isArea ? w * h : 2 * (w + h);
        expression = isArea ? `Area of ${w}×${h} rectangle` : `Perimeter of ${w}×${h} rect`;
        instruction = 'Calculate';
        options = rng.shuffle([answer, answer + rng.nextInt(1, 4), (answer - rng.nextInt(1, 4)) || answer + 5, answer + rng.nextInt(5, 8)]);
    } else if (ptype === 'compare') {
        const a1 = rng.nextInt(10, 50), b1 = rng.nextInt(1, 20);
        const a2 = rng.nextInt(10, 50), b2 = rng.nextInt(1, 20);
        const expr1 = `${a1}+${b1}`, expr2 = `${a2}+${b2}`;
        const val1 = a1 + b1, val2 = a2 + b2;
        expression = val1 !== val2 ? `${expr1} vs ${expr2}` : `${expr1} vs ${a2 + 1}+${b2}`;
        instruction = 'Which is larger?';
        answer = val1 > val2 ? expr1 : expr2;
        options = [expr1, expr2];
        if (rng.next() > 0.5) options.reverse();
    } else if (ptype === 'nearest') {
        const target = rng.nextInt(30, 99);
        expression = `${target}`;
        instruction = `Closest to ${target}?`;
        const diffs = [rng.nextInt(1, 3), rng.nextInt(4, 7), rng.nextInt(8, 12), rng.nextInt(13, 18)];
        const signs = [1, -1, 1, -1];
        options = diffs.map((d, i) => target + d * signs[i]);
        answer = target + diffs[0] * signs[0];
        options = rng.shuffle(options);
    } else if (ptype === 'operator') {
        const a = rng.nextInt(2, 12), b = rng.nextInt(2, 12);
        const ops = ['+', '-', '×'];
        const chosen = rng.pick(ops);
        let val = 0;
        if (chosen === '+') val = a + b;
        if (chosen === '-') val = a - b;
        if (chosen === '×') val = a * b;
        expression = `${a} _ ${b} = ${val}`;
        instruction = 'Missing operator?';
        answer = chosen;
        options = ['+', '-', '×', '÷'];
    } else {
        const ops = ['+', '-', '×'];
        if (difficulty > 4) ops.push('÷');
        const op = rng.pick(ops);
        const maxNum = Math.min(5 + difficulty * 3, 50);
        let a: number, b: number;
        switch (op) {
            case '+': a = rng.nextInt(1, maxNum); b = rng.nextInt(1, maxNum); answer = a + b; expression = `${a} + ${b}`; break;
            case '-': a = rng.nextInt(1, maxNum); b = rng.nextInt(1, a); answer = a - b; expression = `${a} - ${b}`; break;
            case '×': a = rng.nextInt(2, Math.min(12, maxNum)); b = rng.nextInt(2, Math.min(12, maxNum)); answer = a * b; expression = `${a} × ${b}`; break;
            case '÷': b = rng.nextInt(2, 12); answer = rng.nextInt(1, 12); a = b * (answer as number); expression = `${a} ÷ ${b}`; break;
            default: a = rng.nextInt(1, maxNum); b = rng.nextInt(1, maxNum); answer = a + b; expression = `${a} + ${b}`;
        }
        instruction = `What is ${expression}?`;
        options = rng.shuffle([answer as number, (answer as number) + rng.nextInt(1, 5), ((answer as number) - rng.nextInt(1, 5)) || ((answer as number) + 6), (answer as number) + rng.nextInt(6, 12)]);
    }

    return {
        id: '', category: 'math', instruction, difficulty,
        timeLimit: Math.max(5, 12 - difficulty * 0.4),
        basePoints: 100 + difficulty * 20,
        data: { type: 'math', variant: ptype, expression, answer, options },
    };
}

function genPatternDeterministic(rng: SeededRNG, difficulty: number): PuzzleDefinition {
    const variants: ('alternating' | 'growing' | 'rotating')[] = ['alternating', 'growing', 'rotating'];
    const ptype = rng.pick(variants);
    const baseShape = rng.pick(SHAPE_TYPES);
    const baseColor = rng.pick(SHAPE_COLORS);
    const seqLen = 5;
    const missingIndex = rng.nextInt(0, seqLen - 1);
    let sequence: ShapeInfo[] = [];

    switch (ptype) {
        case 'alternating': {
            const s1: ShapeInfo = { shape: baseShape, color: baseColor, size: 30 };
            const s2: ShapeInfo = { shape: rng.pick(SHAPE_TYPES.filter(s => s !== baseShape)), color: rng.pick(SHAPE_COLORS.filter(c => c !== baseColor)), size: 30 };
            sequence = Array.from({ length: seqLen }, (_, i) => (i % 2 === 0 ? s1 : s2));
            break;
        }
        case 'growing': {
            sequence = Array.from({ length: seqLen }, (_, i) => ({ shape: baseShape, color: baseColor, size: 15 + i * 12 }));
            break;
        }
        case 'rotating': {
            const rotShape = rng.pick(['square', 'triangle', 'hexagon'] as ShapeInfo['shape'][]);
            const rotStep = rng.pick([45, 90]);
            sequence = Array.from({ length: seqLen }, (_, i) => ({ shape: rotShape, color: baseColor, size: 30, rotation: i * rotStep }));
            break;
        }
    }

    const answer = { ...sequence[missingIndex] };
    const options: ShapeInfo[] = [answer];
    let attempts = 0;
    while (options.length < 4 && attempts < 20) {
        attempts++;
        let opt: ShapeInfo;
        if (ptype === 'growing') {
            const sizes = [15, 27, 39, 51, 63, 75, 87];
            opt = { shape: baseShape, color: baseColor, size: rng.pick(sizes.filter(s => s !== answer.size)) };
        } else if (ptype === 'rotating') {
            const rots = [0, 45, 90, 135, 180, 225, 270, 315];
            opt = { shape: answer.shape, color: baseColor, size: 30, rotation: rng.pick(rots.filter(r => r !== (answer.rotation || 0))) };
        } else {
            opt = { shape: rng.pick(SHAPE_TYPES), color: rng.pick(SHAPE_COLORS), size: 30 };
        }
        const isDup = options.some(o => o.shape === opt.shape && o.color === opt.color && o.size === opt.size && (o.rotation || 0) === (opt.rotation || 0));
        if (!isDup) options.push(opt);
    }

    return {
        id: '', category: 'pattern', instruction: 'What belongs in the GAP?', difficulty,
        timeLimit: Math.max(5, 12 - difficulty * 0.5),
        basePoints: 120 + difficulty * 25,
        data: { type: 'pattern', variant: ptype, sequence, answer, options: rng.shuffle(options), missingIndex },
    };
}

function genLanguageDeterministic(rng: SeededRNG, difficulty: number): PuzzleDefinition {
    const variants: ('typing' | 'anagram' | 'spelling' | 'vowels' | 'reverse' | 'category' | 'affix')[] =
        ['typing', 'anagram', 'spelling', 'vowels', 'reverse', 'category', 'affix'];
    const variant = rng.pick(variants);
    const word = rng.pick(WORDS_POOL);
    let prompt = '', answer = '', instruction = '';
    let options: string[] | undefined;

    switch (variant) {
        case 'typing': prompt = word.toUpperCase(); answer = word; instruction = 'Type this word:'; break;
        case 'anagram': prompt = scrambleWordSeeded(word, rng).toUpperCase(); answer = word; instruction = 'Unscramble:'; break;
        case 'spelling': { const idx = rng.nextInt(1, word.length - 2); prompt = word.substring(0, idx) + '_' + word.substring(idx + 1); answer = word[idx]; instruction = 'Missing letter:'; break; }
        case 'vowels': { prompt = word.toUpperCase(); const vowels = word.match(/[aeiou]/gi); answer = vowels ? vowels.length.toString() : '0'; instruction = 'How many vowels?'; break; }
        case 'reverse': prompt = word.toUpperCase(); answer = word.split('').reverse().join(''); instruction = 'Type backwards:'; break;
        case 'category': {
            const C_WORDS = ['DOG', 'CAT', 'BIRD', 'FISH'];
            const F_WORDS = ['APPLE', 'PEAR', 'PLUM', 'GRAPE'];
            const useC = rng.next() > 0.5;
            const targetWord = useC ? rng.pick(F_WORDS) : rng.pick(C_WORDS);
            const distractors = rng.shuffle(useC ? C_WORDS : F_WORDS).slice(0, 3);
            prompt = ''; answer = targetWord;
            options = rng.shuffle([targetWord, ...distractors]);
            instruction = 'Find the odd word out:'; break;
        }
        case 'affix': {
            const affixes = [
                { w: 'HYPER', p: 'HYP', s: 'ER' }, { w: 'SUPER', p: 'SUP', s: 'ER' },
                { w: 'REACT', p: 'RE', s: 'ACT' }, { w: 'BRAIN', p: 'BR', s: 'AIN' }
            ];
            const a = rng.pick(affixes);
            prompt = `${a.p}__`; answer = a.s; instruction = 'Complete the word:';
            options = rng.shuffle([a.s, 'OR', 'IS', 'ED']); break;
        }
    }

    const data: LanguagePuzzleData = { type: 'language', variant, prompt, answer, options };
    return {
        id: '', category: 'language', instruction, difficulty,
        timeLimit: Math.max(4, 10 - difficulty * 0.4),
        basePoints: 110 + difficulty * 15,
        data,
    };
}

function genSpatialDeterministic(rng: SeededRNG, difficulty: number): PuzzleDefinition {
    const variants: ('count' | 'odd' | 'color' | 'size' | 'rotation' | 'match')[] = ['count', 'odd', 'color', 'size', 'rotation', 'match'];
    const variant = rng.pick(variants);

    if (variant === 'count') {
        const targetShape = rng.pick(SHAPE_TYPES);
        const count = rng.nextInt(3, 6 + Math.floor(difficulty / 2));
        const shapes: ShapeInfo[] = [];
        for (let i = 0; i < count; i++) shapes.push({ shape: targetShape, color: rng.pick(SHAPE_COLORS), size: rng.nextInt(20, 40) });
        const dc = rng.nextInt(2, 4 + Math.floor(difficulty / 2));
        for (let i = 0; i < dc; i++) shapes.push({ shape: rng.pick(SHAPE_TYPES.filter(s => s !== targetShape)), color: rng.pick(SHAPE_COLORS), size: rng.nextInt(20, 40) });
        const data: SpatialPuzzleData = { type: 'spatial', variant: 'count', shapes: rng.shuffle(shapes), answer: count, options: rng.shuffle([count, count + 1, count - 1, count + 2]) };
        return {
            id: '', category: 'spatial', instruction: `Count the ${targetShape.charAt(0).toUpperCase() + targetShape.slice(1)}s`,
            difficulty, timeLimit: Math.max(5, 12 - difficulty * 0.5), basePoints: 130 + difficulty * 20, data,
        };
    }

    if (variant === 'rotation' || variant === 'match') {
        const count = rng.nextInt(5, 8);
        const shapes: ShapeInfo[] = [];
        let answerIndex = rng.nextInt(0, count - 1);
        let instruction = '';
        if (variant === 'rotation') {
            const shape = rng.pick(['square', 'triangle', 'hexagon'] as ShapeInfo['shape'][]);
            const color = rng.pick(SHAPE_COLORS);
            for (let i = 0; i < count; i++) shapes.push({ shape, color, size: 30, rotation: i === answerIndex ? 45 : 0 });
            instruction = 'Click the rotated shape';
        } else {
            const ts = rng.pick(SHAPE_TYPES), tc = rng.pick(SHAPE_COLORS);
            for (let i = 0; i < count; i++) {
                if (i === answerIndex) { shapes.push({ shape: ts, color: tc, size: 30 }); }
                else {
                    let s = rng.pick(SHAPE_TYPES), c = rng.pick(SHAPE_COLORS);
                    let att = 0;
                    while (s === ts && c === tc && att < 10) { s = rng.pick(SHAPE_TYPES); c = rng.pick(SHAPE_COLORS); att++; }
                    shapes.push({ shape: s, color: c, size: 30 });
                }
            }
            instruction = `Find the ${SHAPE_COLOR_NAMES[tc] || 'unknown'} ${ts}`;
        }
        return {
            id: '', category: 'spatial', instruction, difficulty,
            timeLimit: Math.max(4, 10 - difficulty * 0.4), basePoints: 120 + difficulty * 20,
            data: { type: 'spatial', variant, shapes, answer: answerIndex } as SpatialPuzzleData,
        };
    }

    if (variant === 'color' || variant === 'size') {
        const count = rng.nextInt(4, 7);
        const shapes: ShapeInfo[] = [];
        const answerIndex = rng.nextInt(0, count - 1);
        let instruction = '';
        if (variant === 'color') {
            const tc = rng.pick(SHAPE_COLORS), ts = rng.pick(SHAPE_TYPES);
            const dColors = SHAPE_COLORS.filter(c => c !== tc);
            for (let i = 0; i < count; i++) {
                if (i === answerIndex) shapes.push({ shape: ts, color: tc, size: 30 });
                else shapes.push({ shape: rng.pick(SHAPE_TYPES), color: rng.pick(dColors), size: 30 });
            }
            instruction = `Find the ${SHAPE_COLOR_NAMES[tc] || 'unknown'} ${ts}`;
        } else {
            const findLargest = rng.next() > 0.5;
            instruction = findLargest ? 'Click the largest shape' : 'Click the smallest shape';
            const diffSize = findLargest ? 50 : 15;
            for (let i = 0; i < count; i++) shapes.push({ shape: rng.pick(SHAPE_TYPES), color: rng.pick(SHAPE_COLORS), size: i === answerIndex ? diffSize : 30 + rng.nextInt(-5, 5) });
        }
        return {
            id: '', category: 'spatial', instruction, difficulty,
            timeLimit: Math.max(4, 10 - difficulty * 0.4), basePoints: 120 + difficulty * 20,
            data: { type: 'spatial', variant, shapes, answer: answerIndex } as SpatialPuzzleData,
        };
    }

    // odd
    const mainShape = rng.pick(SHAPE_TYPES);
    const mainColor = rng.pick(SHAPE_COLORS);
    const oddShape = rng.pick(SHAPE_TYPES.filter(s => s !== mainShape));
    const count = rng.nextInt(4, 7);
    const oddIndex = rng.nextInt(0, count - 1);
    const shapes: ShapeInfo[] = Array.from({ length: count }, (_, i) => ({ shape: i === oddIndex ? oddShape : mainShape, color: mainColor, size: 30 }));
    return {
        id: '', category: 'spatial', instruction: 'Click the odd one out', difficulty,
        timeLimit: Math.max(4, 10 - difficulty * 0.4), basePoints: 120 + difficulty * 20,
        data: { type: 'spatial', variant: 'odd', shapes, answer: oddIndex } as SpatialPuzzleData,
    };
}

function genMemoryDeterministic(rng: SeededRNG, difficulty: number): PuzzleDefinition {
    const variant = rng.pick(['numbers', 'colors'] as const);
    const len = Math.min(1 + Math.floor(difficulty / 2.5), 7);
    let sequence: (number | string)[];
    if (variant === 'colors') sequence = Array.from({ length: len }, () => rng.pick(SHAPE_COLORS));
    else sequence = Array.from({ length: len }, () => rng.nextInt(1, 9));
    const showDuration = Math.max(3, 8 - difficulty * 0.5);
    const inputDuration = Math.max(5, 12 - difficulty * 0.5);
    const data: MemoryPuzzleData = { type: 'memory', variant, sequence, showDuration: showDuration * 1000, inputDuration: inputDuration * 1000 };
    return { id: '', category: 'memory', instruction: 'Memorize!', difficulty, timeLimit: showDuration, basePoints: 150 + difficulty * 30, data };
}

function genReactionDeterministic(rng: SeededRNG, difficulty: number): PuzzleDefinition {
    const variants: ('click' | 'moving' | 'sequence' | 'decoy' | 'double' | 'jitter')[] = ['click', 'moving', 'sequence', 'decoy', 'double', 'jitter'];
    const variant = rng.pick(variants);
    const count = Math.min(1 + Math.floor(difficulty / 3), 5);
    const targetCount = variant === 'sequence' ? Math.max(3, count + 1) : (variant === 'double' ? 2 : count);
    const data: ReactionPuzzleData = { type: 'reaction', variant, targetCount, decoys: variant === 'decoy' ? rng.nextInt(2, 4) : undefined };
    let instruction = 'Click the targets!';
    if (variant === 'sequence') instruction = `Click in order (1 to ${targetCount})!`;
    if (variant === 'decoy') instruction = 'Click targets, avoid RED!';
    if (variant === 'double') instruction = 'Double-click targets!';
    if (variant === 'jitter') instruction = 'Catch the shaking targets!';
    return { id: '', category: 'reaction', instruction, difficulty, timeLimit: Math.max(3, 8 - difficulty * 0.4), basePoints: 80 + difficulty * 15, data };
}

function genPowerupDeterministic(rng: SeededRNG, difficulty: number): PuzzleDefinition {
    const variant = rng.pick(['timeDilation', 'purge', 'secondChance'] as const);
    const actionType = rng.pick(['slider', 'spam', 'hold'] as const);
    let instruction = '', effectDesc = '';
    if (variant === 'timeDilation') effectDesc = 'Timers run 50% slower!';
    if (variant === 'purge') effectDesc = 'Clears up to 3 oldest puzzles!';
    if (variant === 'secondChance') effectDesc = 'Removes 2 misses!';
    if (actionType === 'slider') instruction = 'Slide to 100% to activate!';
    if (actionType === 'spam') instruction = 'Spam click 10 times!';
    if (actionType === 'hold') instruction = 'Hold for 1.5s!';
    const data: PowerUpPuzzleData = { type: 'powerup', variant, actionType, targetValue: actionType === 'spam' ? 10 : 100, effectDescription: effectDesc };
    return { id: '', category: 'powerup', instruction, difficulty, timeLimit: Math.max(5, 10 - difficulty * 0.3), basePoints: 50, isPriority: true, data };
}

const deterministicGenerators: Record<PuzzleCategory, (rng: SeededRNG, d: number) => PuzzleDefinition> = {
    math: genMathDeterministic,
    pattern: genPatternDeterministic,
    language: genLanguageDeterministic,
    spatial: genSpatialDeterministic,
    memory: genMemoryDeterministic,
    reaction: genReactionDeterministic,
    powerup: genPowerupDeterministic,
};

/**
 * Generate a deterministic puzzle for multiplayer.
 * Category selection is based on seed + spawnIndex (not player state).
 */
export function generatePuzzleDeterministic(
    matchSeed: number,
    spawnIndex: number,
    difficulty: number,
): PuzzleDefinition {
    const rng = createSpawnRNG(matchSeed, spawnIndex);
    const clampedDiff = Math.min(10, Math.max(1, Math.round(difficulty)));

    // Powerup every ~15 spawns after index 10, deterministically
    const isPowerup = spawnIndex >= 10 && spawnIndex % 15 === 0;

    let category: PuzzleCategory;
    if (isPowerup) {
        category = 'powerup';
    } else {
        // Avoid consecutive memory puzzles at stream level
        const prevRng = createSpawnRNG(matchSeed, spawnIndex - 1);
        const prevCatIdx = Math.floor(prevRng.next() * CATEGORIES_ORDER.length);
        const prevCategory = CATEGORIES_ORDER[prevCatIdx];

        let available = [...CATEGORIES_ORDER];
        if (prevCategory === 'memory') {
            available = available.filter(c => c !== 'memory');
        }
        category = rng.pick(available);
    }

    const puzzle = deterministicGenerators[category](rng, clampedDiff);
    puzzle.id = `m-${spawnIndex}`;

    return puzzle;
}

/**
 * Compute difficulty at a given elapsed time (deterministic, matching engine logic).
 */
export function getDifficultyAtTime(elapsedSeconds: number, puzzlesSolvedEstimate: number): number {
    const scalarBySolves = Math.min(1, puzzlesSolvedEstimate / 80);
    const scalarByTime = Math.min(1, elapsedSeconds / 300);
    const intensityScalar = Math.max(scalarBySolves, scalarByTime);
    return Math.min(10, 1 + intensityScalar * 9);
}

/**
 * Generate a deterministic position for a puzzle card.
 */
export function deterministicPosition(matchSeed: number, spawnIndex: number): { x: number; y: number } {
    const rng = new SeededRNG(matchSeed ^ (spawnIndex * 48271));
    return {
        x: 5 + rng.next() * 70,
        y: 5 + rng.next() * 60,
    };
}
