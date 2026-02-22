import type {
    PuzzleDefinition,
    PuzzleCategory,
    LanguagePuzzleData,
    SpatialPuzzleData,
    MemoryPuzzleData,
    ReactionPuzzleData,
    PowerUpPuzzleData,
    ShapeInfo,
} from './types';
import { SHAPE_COLOR_NAMES } from './types';

let puzzleIdCounter = 0;

function uid(): string {
    return `puzzle-${++puzzleIdCounter}-${Date.now()}`;
}

function rand(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

const SHAPE_TYPES: ShapeInfo['shape'][] = ['circle', 'square', 'triangle', 'diamond', 'hexagon'];
const SHAPE_COLORS = ['#ff5252', '#00e5ff', '#76ff03', '#ffab00', '#b388ff', '#ff6ec7'];

// ---- MATH PUZZLES ----
function generateMathPuzzle(difficulty: number): PuzzleDefinition {
    const types: ('arithmetic' | 'algebra' | 'geometry' | 'compare' | 'nearest' | 'operator')[] = ['arithmetic', 'compare', 'nearest', 'operator'];
    if (difficulty > 2) types.push('algebra');
    if (difficulty > 3) types.push('geometry');
    const ptype = pick(types);

    let answer: number | string, expression: string, instruction: string;
    let options: (number | string)[] | undefined = undefined;

    if (ptype === 'algebra') {
        const x = rand(1, 12);
        const a = rand(2, 5);
        const b = rand(1, 10);
        const isAddition = Math.random() > 0.5;
        const c = isAddition ? a * x + b : a * x - b;
        answer = x;
        expression = isAddition ? `${a}x + ${b} = ${c}` : `${a}x - ${b} = ${c}`;
        instruction = `Solve for x`;
        options = shuffle([answer, answer + rand(1, 4), answer - rand(1, 4) || answer + 5, answer + rand(5, 8)]);
    } else if (ptype === 'geometry') {
        const w = rand(3, 12);
        const h = rand(3, 12);
        const isArea = Math.random() > 0.5;
        answer = isArea ? w * h : 2 * (w + h);
        expression = isArea ? `Area of ${w}×${h} rectangle` : `Perimeter of ${w}×${h} rect`;
        instruction = `Calculate`;
        options = shuffle([answer, answer + rand(1, 4), answer - rand(1, 4) || answer + 5, answer + rand(5, 8)]);
    } else if (ptype === 'compare') {
        const a1 = rand(10, 50), b1 = rand(1, 20);
        const a2 = rand(10, 50), b2 = rand(1, 20);
        const expr1 = `${a1}+${b1}`;
        const expr2 = `${a2}+${b2}`;
        const val1 = a1 + b1;
        const val2 = a2 + b2;
        expression = val1 !== val2 ? `${expr1} vs ${expr2}` : `${expr1} vs ${a2 + 1}+${b2}`; // prevent tie
        instruction = `Which is larger?`;
        answer = val1 > val2 ? expr1 : expr2;
        options = [expr1, expr2];
        if (Math.random() > 0.5) options.reverse();
    } else if (ptype === 'nearest') {
        const target = rand(30, 99);
        expression = `${target}`;
        instruction = `Closest to ${target}?`;
        const diffs = [rand(1, 3), rand(4, 7), rand(8, 12), rand(13, 18)];
        const signs = [1, -1, 1, -1];
        options = diffs.map((d, i) => target + d * signs[i]);
        answer = target + diffs[0] * signs[0];
        options = shuffle(options);
    } else if (ptype === 'operator') {
        const a = rand(2, 12), b = rand(2, 12);
        const ops = ['+', '-', '×'];
        const chosen = pick(ops);
        let val = 0;
        if (chosen === '+') val = a + b;
        if (chosen === '-') val = a - b;
        if (chosen === '×') val = a * b;
        expression = `${a} _ ${b} = ${val}`;
        instruction = `Missing operator?`;
        answer = chosen;
        options = ['+', '-', '×', '÷'];
    } else {
        const ops = ['+', '-', '×'];
        if (difficulty > 4) ops.push('÷');
        const op = pick(ops);
        const maxNum = Math.min(5 + difficulty * 3, 50);
        let a: number, b: number;

        switch (op) {
            case '+': a = rand(1, maxNum); b = rand(1, maxNum); answer = a + b; expression = `${a} + ${b}`; break;
            case '-': a = rand(1, maxNum); b = rand(1, a); answer = a - b; expression = `${a} - ${b}`; break;
            case '×': a = rand(2, Math.min(12, maxNum)); b = rand(2, Math.min(12, maxNum)); answer = a * b; expression = `${a} × ${b}`; break;
            case '÷': b = rand(2, 12); answer = rand(1, 12); a = b * answer as number; expression = `${a} ÷ ${b}`; break;
            default: a = rand(1, maxNum); b = rand(1, maxNum); answer = a + b; expression = `${a} + ${b}`;
        }
        instruction = `What is ${expression}?`;
        options = shuffle([answer as number, (answer as number) + rand(1, 5), (answer as number) - rand(1, 5) || (answer as number) + 6, (answer as number) + rand(6, 12)]);
    }

    return {
        id: uid(),
        category: 'math',
        instruction,
        difficulty,
        timeLimit: Math.max(5, 12 - difficulty * 0.4),
        basePoints: 100 + difficulty * 20,
        data: { type: 'math', variant: ptype, expression, answer, options },
    };
}

// ---- PATTERN PUZZLES ----
function generatePatternPuzzle(difficulty: number): PuzzleDefinition {
    const variants: ('alternating' | 'growing' | 'rotating')[] = ['alternating', 'growing', 'rotating'];
    const ptype = pick(variants);

    let sequence: ShapeInfo[] = [];
    let answer: ShapeInfo;
    let options: ShapeInfo[] = [];

    const baseShape = pick(SHAPE_TYPES);
    const baseColor = pick(SHAPE_COLORS);
    const seqLen = 5;
    const missingIndex = rand(0, seqLen - 1);

    switch (ptype) {
        case 'alternating': {
            const shape1: ShapeInfo = { shape: baseShape, color: baseColor, size: 30 };
            let shape2Shape = pick(SHAPE_TYPES.filter(s => s !== baseShape));
            let shape2Color = pick(SHAPE_COLORS.filter(c => c !== baseColor));
            const shape2: ShapeInfo = { shape: shape2Shape, color: shape2Color, size: 30 };

            sequence = Array.from({ length: seqLen }, (_, i) => (i % 2 === 0 ? shape1 : shape2));
            break;
        }
        case 'growing': {
            const startSize = 15;
            const diff = 12; // increased for distinctness
            sequence = Array.from({ length: seqLen }, (_, i) => ({ shape: baseShape, color: baseColor, size: startSize + i * diff }));
            break;
        }
        case 'rotating': {
            const rotShape = pick(['square', 'triangle', 'hexagon'] as ShapeInfo['shape'][]);
            const rotStep = pick([45, 90]);
            sequence = Array.from({ length: seqLen }, (_, i) => ({ shape: rotShape, color: baseColor, size: 30, rotation: i * rotStep }));
            break;
        }
    }

    answer = { ...sequence[missingIndex] };

    // Generate options
    options = [answer];
    while (options.length < 4) {
        let opt: ShapeInfo;
        if (ptype === 'alternating') {
            const shape1: ShapeInfo = { shape: baseShape, color: baseColor, size: 30 };
            const shape2Shape = SHAPE_TYPES.find(s => s !== baseShape && !sequence.some(item => item.shape === s)) || pick(SHAPE_TYPES);
            const shape2: ShapeInfo = { shape: shape2Shape, color: pick(SHAPE_COLORS), size: 30 };
            opt = Math.random() > 0.5 ? shape1 : shape2;
        } else if (ptype === 'growing') {
            const sizes = [15, 27, 39, 51, 63, 75, 87];
            opt = { shape: baseShape, color: baseColor, size: pick(sizes.filter(s => s !== answer.size)) };
        } else {
            const rots = [0, 45, 90, 135, 180, 225, 270, 315];
            opt = { shape: answer.shape, color: baseColor, size: 30, rotation: pick(rots.filter(r => r !== (answer.rotation || 0))) };
        }

        const isDup = options.some(o =>
            o.shape === opt.shape &&
            o.color === opt.color &&
            o.size === opt.size &&
            (o.rotation || 0) === (opt.rotation || 0)
        );
        if (!isDup) {
            options.push(opt);
        }
    }
    options = shuffle(options);

    return {
        id: uid(),
        category: 'pattern',
        instruction: `What belongs in the GAP?`,
        difficulty,
        timeLimit: Math.max(5, 12 - difficulty * 0.5),
        basePoints: 120 + difficulty * 25,
        data: { type: 'pattern', variant: ptype, sequence, answer, options, missingIndex },
    };
}

// ---- LANGUAGE PUZZLES ----
const WORDS_POOL = [
    'brain', 'storm', 'pulse', 'nerve', 'focus', 'react', 'spark',
    'flash', 'swift', 'blaze', 'sharp', 'logic', 'think', 'solve',
    'power', 'speed', 'chess', 'pixel', 'glyph', 'nexus', 'prime',
    'crypt', 'omega', 'delta', 'sigma', 'alpha', 'laser', 'sonic',
    'turbo', 'hyper', 'ultra', 'cyber', 'boost', 'flame', 'frost',
    'lunar', 'solar', 'astro', 'quark', 'prism', 'surge', 'drift',
];

function scrambleWord(word: string): string {
    if (word.length <= 3) return word;
    // Only scramble inner letters to make it readable (Typoglycemia)
    const first = word[0];
    const last = word[word.length - 1];
    const inner = word.substring(1, word.length - 1).split('');

    for (let i = inner.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [inner[i], inner[j]] = [inner[j], inner[i]];
    }
    const scrambled = first + inner.join('') + last;
    return scrambled === word ? scrambleWord(word) : scrambled;
}

function generateLanguagePuzzle(difficulty: number): PuzzleDefinition {
    const variants: ('typing' | 'anagram' | 'spelling' | 'vowels' | 'reverse' | 'category' | 'affix')[] =
        ['typing', 'anagram', 'spelling', 'vowels', 'reverse', 'category', 'affix'];
    const variant = pick(variants);
    const word = pick(WORDS_POOL);

    let prompt: string, answer: string, instruction: string;
    let options: string[] | undefined;

    switch (variant) {
        case 'typing':
            prompt = word.toUpperCase();
            answer = word;
            instruction = `Type this word:`;
            break;
        case 'anagram':
            prompt = scrambleWord(word).toUpperCase();
            answer = word;
            instruction = `Unscramble:`;
            break;
        case 'spelling': {
            const idx = rand(1, word.length - 2);
            prompt = word.substring(0, idx) + '_' + word.substring(idx + 1);
            answer = word[idx];
            instruction = `Missing letter:`;
            break;
        }
        case 'vowels': {
            prompt = word.toUpperCase();
            const vowels = word.match(/[aeiou]/gi);
            answer = vowels ? vowels.length.toString() : '0';
            instruction = `How many vowels?`;
            break;
        }
        case 'reverse': {
            prompt = word.toUpperCase();
            answer = word.split('').reverse().join('');
            instruction = `Type backwards:`;
            break;
        }
        case 'category': {
            const C_WORDS = ['DOG', 'CAT', 'BIRD', 'FISH'];
            const F_WORDS = ['APPLE', 'PEAR', 'PLUM', 'GRAPE'];
            const useC = Math.random() > 0.5;
            const targetWord = useC ? pick(F_WORDS) : pick(C_WORDS);
            const distractors = shuffle(useC ? C_WORDS : F_WORDS).slice(0, 3);
            prompt = '';
            answer = targetWord;
            options = shuffle([targetWord, ...distractors]);
            instruction = `Find the odd word out:`;
            break;
        }
        case 'affix': {
            const affixes = [
                { w: 'HYPER', p: 'HYP', s: 'ER' },
                { w: 'SUPER', p: 'SUP', s: 'ER' },
                { w: 'REACT', p: 'RE', s: 'ACT' },
                { w: 'BRAIN', p: 'BR', s: 'AIN' }
            ];
            const a = pick(affixes);
            prompt = `${a.p}__`;
            answer = a.s;
            instruction = `Complete the word:`;
            options = shuffle([a.s, 'OR', 'IS', 'ED']);
            break;
        }
    }

    const data: LanguagePuzzleData = {
        type: 'language',
        variant,
        prompt: prompt!,
        answer: answer!,
        options
    };

    return {
        id: uid(),
        category: 'language',
        instruction: instruction!,
        difficulty,
        timeLimit: Math.max(4, 10 - difficulty * 0.4),
        basePoints: 110 + difficulty * 15,
        data,
    };
}

// ---- SPATIAL PUZZLES ----
function generateSpatialPuzzle(difficulty: number): PuzzleDefinition {
    const variants: ('count' | 'odd' | 'color' | 'size' | 'rotation' | 'match')[] = ['count', 'odd', 'color', 'size', 'rotation', 'match'];
    const variant = pick(variants);

    if (variant === 'count') {
        const targetShape = pick(SHAPE_TYPES);
        const count = rand(3, 6 + Math.floor(difficulty / 2));
        const shapes: ShapeInfo[] = [];

        // Add target shapes
        for (let i = 0; i < count; i++) {
            shapes.push({
                shape: targetShape,
                color: pick(SHAPE_COLORS),
                size: rand(20, 40),
            });
        }

        // Add distractors
        const distractorCount = rand(2, 4 + Math.floor(difficulty / 2));
        for (let i = 0; i < distractorCount; i++) {
            const s = pick(SHAPE_TYPES.filter((s) => s !== targetShape));
            shapes.push({
                shape: s,
                color: pick(SHAPE_COLORS),
                size: rand(20, 40),
            });
        }

        const options = shuffle([count, count + 1, count - 1, count + 2]);

        const data: SpatialPuzzleData = {
            type: 'spatial',
            variant: 'count',
            shapes: shuffle(shapes),
            answer: count,
            options,
        };

        return {
            id: uid(),
            category: 'spatial',
            instruction: `Count the ${targetShape.charAt(0).toUpperCase() + targetShape.slice(1)}s`,
            difficulty,
            timeLimit: Math.max(5, 12 - difficulty * 0.5),
            basePoints: 130 + difficulty * 20,
            data,
        };
    } else if (variant === 'rotation' || variant === 'match') {
        const count = rand(5, 8);
        const shapes: ShapeInfo[] = [];
        let answerIndex = 0;
        let instruction = '';

        if (variant === 'rotation') {
            const shape = pick(['square', 'triangle', 'hexagon'] as 'square'[]); // circles dont rotate visually
            const color = pick(SHAPE_COLORS);
            answerIndex = rand(0, count - 1);
            for (let i = 0; i < count; i++) {
                shapes.push({ shape, color, size: 30, rotation: i === answerIndex ? 45 : 0 });
            }
            instruction = `Click the rotated shape`;
        } else {
            // match
            const targetShape = pick(SHAPE_TYPES);
            const targetColor = pick(SHAPE_COLORS);
            answerIndex = rand(0, count - 1);
            for (let i = 0; i < count; i++) {
                if (i === answerIndex) {
                    shapes.push({ shape: targetShape, color: targetColor, size: 30 });
                } else {
                    let s = pick(SHAPE_TYPES);
                    let c = pick(SHAPE_COLORS);
                    while (s === targetShape && c === targetColor) {
                        s = pick(SHAPE_TYPES);
                        c = pick(SHAPE_COLORS);
                    }
                    shapes.push({ shape: s, color: c, size: 30 });
                }
            }
            const colorName = SHAPE_COLOR_NAMES[targetColor];
            instruction = `Find the ${colorName} ${targetShape}`;
        }

        const data: SpatialPuzzleData = {
            type: 'spatial',
            variant,
            shapes,
            answer: answerIndex,
        };

        return {
            id: uid(),
            category: 'spatial',
            instruction,
            difficulty,
            timeLimit: Math.max(4, 10 - difficulty * 0.4),
            basePoints: 120 + difficulty * 20,
            data,
        };
    } else if (variant === 'color' || variant === 'size') {
        // Find specific color or largest/smallest
        const count = rand(4, 7);
        const shapes: ShapeInfo[] = [];
        let answerIndex = 0;
        let instruction = '';

        if (variant === 'color') {
            const targetColor = pick(SHAPE_COLORS);
            const targetShape = pick(SHAPE_TYPES);
            const distractorColors = SHAPE_COLORS.filter(c => c !== targetColor);
            answerIndex = rand(0, count - 1);

            for (let i = 0; i < count; i++) {
                if (i === answerIndex) {
                    shapes.push({ shape: targetShape, color: targetColor, size: 30 });
                } else {
                    let s = pick(SHAPE_TYPES);
                    let c = pick(distractorColors);
                    while (s === targetShape && c === targetColor) {
                        s = pick(SHAPE_TYPES);
                        c = pick(distractorColors);
                    }
                    shapes.push({ shape: s, color: c, size: 30 });
                }
            }

            const colorName = SHAPE_COLOR_NAMES[targetColor];
            instruction = `Find the ${colorName} ${targetShape}`;
        } else {
            // Size
            const findLargest = Math.random() > 0.5;
            instruction = findLargest ? `Click the largest shape` : `Click the smallest shape`;
            const baseSize = 30;
            const diffSize = findLargest ? 50 : 15;
            answerIndex = rand(0, count - 1);

            for (let i = 0; i < count; i++) {
                shapes.push({
                    shape: pick(SHAPE_TYPES),
                    color: pick(SHAPE_COLORS),
                    size: i === answerIndex ? diffSize : baseSize + rand(-5, 5),
                });
            }
        }

        const data: SpatialPuzzleData = {
            type: 'spatial',
            variant,
            shapes,
            answer: answerIndex,
        };

        return {
            id: uid(),
            category: 'spatial',
            instruction,
            difficulty,
            timeLimit: Math.max(4, 10 - difficulty * 0.4),
            basePoints: 120 + difficulty * 20,
            data,
        };
    } else {
        // Odd one out
        const mainShape = pick(SHAPE_TYPES);
        const mainColor = pick(SHAPE_COLORS);
        const oddShape = pick(SHAPE_TYPES.filter((s) => s !== mainShape));
        const count = rand(4, 7);
        const oddIndex = rand(0, count - 1);

        const shapes: ShapeInfo[] = Array.from({ length: count }, (_, i) => ({
            shape: i === oddIndex ? oddShape : mainShape,
            color: mainColor,
            size: 30,
        }));

        const data: SpatialPuzzleData = {
            type: 'spatial',
            variant: 'odd',
            shapes,
            answer: oddIndex,
        };

        return {
            id: uid(),
            category: 'spatial',
            instruction: `Click the odd one out`,
            difficulty,
            timeLimit: Math.max(4, 10 - difficulty * 0.4),
            basePoints: 120 + difficulty * 20,
            data,
        };
    }
}

// ---- MEMORY PUZZLES ----
function generateMemoryPuzzle(difficulty: number): PuzzleDefinition {
    const variant = pick(['numbers', 'colors'] as const);
    // Start at 1 digit, scale up slowly
    const len = Math.min(1 + Math.floor(difficulty / 2.5), 7);

    let sequence: (number | string)[];
    if (variant === 'colors') {
        sequence = Array.from({ length: len }, () => pick(SHAPE_COLORS));
    } else {
        sequence = Array.from({ length: len }, () => rand(1, 9));
    }

    const showDuration = Math.max(3, 8 - difficulty * 0.5); // seconds, for the timer bar
    const inputDuration = Math.max(5, 12 - difficulty * 0.5); // seconds

    const data: MemoryPuzzleData = {
        type: 'memory',
        variant,
        sequence,
        showDuration: showDuration * 1000,
        inputDuration: inputDuration * 1000,
    };

    return {
        id: uid(),
        category: 'memory',
        instruction: `Memorize!`,
        difficulty,
        timeLimit: showDuration,
        basePoints: 150 + difficulty * 30,
        data,
    };
}

// ---- REACTION PUZZLES ----
function generateReactionPuzzle(difficulty: number): PuzzleDefinition {
    const variants: ('click' | 'moving' | 'sequence' | 'decoy' | 'double' | 'jitter')[] =
        ['click', 'moving', 'sequence', 'decoy', 'double', 'jitter'];
    const variant = pick(variants);
    const count = Math.min(1 + Math.floor(difficulty / 3), 5);
    const targetCount = variant === 'sequence' ? Math.max(3, count + 1) : (variant === 'double' ? 2 : count);

    const data: ReactionPuzzleData = {
        type: 'reaction',
        variant,
        targetCount,
        decoys: variant === 'decoy' ? rand(2, 4) : undefined,
    };

    let instruction = `Click the targets!`;
    if (variant === 'sequence') instruction = `Click in order (1 to ${targetCount})!`;
    if (variant === 'decoy') instruction = `Click targets, avoid RED!`;
    if (variant === 'double') instruction = `Double-click targets!`;
    if (variant === 'jitter') instruction = `Catch the shaking targets!`;

    return {
        id: uid(),
        category: 'reaction',
        instruction,
        difficulty,
        timeLimit: Math.max(3, 8 - difficulty * 0.4),
        basePoints: 80 + difficulty * 15,
        data,
    };
}

// ---- POWER-UP PUZZLES ----
function generatePowerUpPuzzle(difficulty: number): PuzzleDefinition {
    const variant = pick(['timeDilation', 'purge', 'secondChance'] as const);
    const actionType = pick(['slider', 'spam', 'hold'] as const);

    let instruction = '';
    let effectDesc = '';

    if (variant === 'timeDilation') effectDesc = 'Timers run 50% slower!';
    if (variant === 'purge') effectDesc = 'Clears up to 3 oldest puzzles!';
    if (variant === 'secondChance') effectDesc = 'Removes 2 misses!';

    if (actionType === 'slider') instruction = 'Slide to 100% to activate!';
    if (actionType === 'spam') instruction = 'Spam click 10 times!';
    if (actionType === 'hold') instruction = 'Hold for 1.5s!';

    const data: PowerUpPuzzleData = {
        type: 'powerup',
        variant,
        actionType,
        targetValue: actionType === 'spam' ? 10 : 100, // 10 clicks, or 100%
        effectDescription: effectDesc
    };

    return {
        id: uid(),
        category: 'powerup',
        instruction,
        difficulty,
        timeLimit: Math.max(5, 10 - difficulty * 0.3),
        basePoints: 50, // not about points, about utility
        isPriority: true,
        data,
    };
}

// ---- MAIN GENERATOR ----
const generators: Record<PuzzleCategory, (d: number) => PuzzleDefinition> = {
    math: generateMathPuzzle,
    pattern: generatePatternPuzzle,
    language: generateLanguagePuzzle,
    spatial: generateSpatialPuzzle,
    memory: generateMemoryPuzzle,
    reaction: generateReactionPuzzle,
    powerup: generatePowerUpPuzzle,
};

const CATEGORY_UNLOCK_ORDER: PuzzleCategory[] = [
    'math',
    'pattern',
    'language',
    'spatial',
    'reaction',
    'memory',
    'powerup',
];

export function getAvailableCategories(_difficulty: number): PuzzleCategory[] {
    return [...CATEGORY_UNLOCK_ORDER];
}

export function generatePuzzle(difficulty: number, activeCategories: PuzzleCategory[] = [], forceCategory?: PuzzleCategory): PuzzleDefinition {
    if (forceCategory) {
        return generators[forceCategory](Math.min(10, Math.max(1, Math.round(difficulty))));
    }

    const availableCategories = getAvailableCategories(difficulty);
    let categories = availableCategories;

    // Prevent duplicates of intense categories if they are already active
    if (activeCategories.includes('memory')) {
        categories = categories.filter(c => c !== 'memory');
    }
    if (activeCategories.includes('powerup')) {
        categories = categories.filter(c => c !== 'powerup');
    }

    // Fallback if we accidentally filtered everything
    if (categories.length === 0) categories = availableCategories;

    const category = pick(categories);
    const clampedDifficulty = Math.min(10, Math.max(1, Math.round(difficulty)));
    return generators[category](clampedDifficulty);
}

export function resetPuzzleCounter(): void {
    puzzleIdCounter = 0;
}
