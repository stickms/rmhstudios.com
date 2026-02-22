import type {
    PuzzleDefinition,
    PuzzleCategory,
    LanguagePuzzleData,
    SpatialPuzzleData,
    MemoryPuzzleData,
    ReactionPuzzleData,
    MinigamePuzzleData,
    FlingDirection,
    PowerUpPuzzleData,
    MetaPuzzleData,
    ShapeInfo,
    GameState,
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

/** Ensures options are unique, include the answer, and have at least minCount items. */
function ensureUniqueOptions<T>(raw: T[], answer: T, minCount: number, genExtra: () => T): T[] {
    const seen = new Set<T>([answer]);
    const result: T[] = [answer];
    for (const o of raw) {
        if (!seen.has(o)) {
            seen.add(o);
            result.push(o);
        }
    }
    for (let attempts = 0; result.length < minCount && attempts < 20; attempts++) {
        const extra = genExtra();
        if (!seen.has(extra)) {
            seen.add(extra);
            result.push(extra);
        }
    }
    return shuffle(result);
}

const SHAPE_TYPES: ShapeInfo['shape'][] = ['circle', 'square', 'triangle', 'diamond', 'hexagon'];
const SHAPE_COLORS = ['#ff5252', '#00e5ff', '#76ff03', '#ffab00', '#b388ff', '#ff6ec7'];

// ---- MATH PUZZLES ----
function generateMathPuzzle(difficulty: number): PuzzleDefinition {
    const types: ('arithmetic' | 'algebra' | 'geometry' | 'compare' | 'nearest' | 'operator' | 'percent' | 'sequence' | 'digit_sum')[] = ['arithmetic', 'compare', 'nearest', 'operator', 'percent', 'sequence', 'digit_sum'];
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
        options = ensureUniqueOptions(
            [answer + rand(1, 4), (answer - rand(1, 4)) || answer + 5, answer + rand(5, 8)],
            answer,
            4,
            () => (answer as number) + (rand(0, 1) ? rand(2, 15) : -rand(2, 10))
        );
    } else if (ptype === 'geometry') {
        const w = rand(3, 12);
        const h = rand(3, 12);
        const isArea = Math.random() > 0.5;
        answer = isArea ? w * h : 2 * (w + h);
        expression = isArea ? `Area of ${w}×${h} rectangle` : `Perimeter of ${w}×${h} rect`;
        instruction = `Calculate`;
        options = ensureUniqueOptions(
            [answer + rand(1, 4), (answer - rand(1, 4)) || answer + 5, answer + rand(5, 8)],
            answer,
            4,
            () => (answer as number) + (rand(0, 1) ? rand(2, 12) : -rand(2, 8))
        );
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
    } else if (ptype === 'percent') {
        const pct = pick([10, 25, 50, 75]);
        const num = pick([20, 40, 60, 80, 100, 120]);
        answer = Math.round((pct / 100) * num);
        expression = `${pct}% of ${num}`;
        instruction = `Calculate`;
        options = ensureUniqueOptions(
            [(answer as number) + 5, (answer as number) - 5 || (answer as number) + 3, (answer as number) + 10],
            answer as number,
            4,
            () => (answer as number) + rand(2, 15)
        );
    } else if (ptype === 'sequence') {
        const start = rand(1, 5);
        const step = pick([2, 3, 5]);
        const len = 4;
        const seq = Array.from({ length: len }, (_, i) => start + i * step);
        answer = seq[len - 1] + step;
        expression = seq.join(', ') + ', _';
        instruction = `Next number?`;
        options = ensureUniqueOptions(
            [(answer as number) + step, (answer as number) - step, seq[0]],
            answer as number,
            4,
            () => (answer as number) + rand(2, 8)
        );
    } else if (ptype === 'digit_sum') {
        const num = rand(100, 499);
        const digits = String(num).split('').map(Number);
        answer = digits.reduce((a, b) => a + b, 0);
        expression = `Sum of digits in ${num}`;
        instruction = `Calculate`;
        options = ensureUniqueOptions(
            [(answer as number) + 1, (answer as number) - 1 || (answer as number) + 3, (answer as number) + 2],
            answer as number,
            4,
            () => (answer as number) + rand(3, 10)
        );
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
        options = ensureUniqueOptions(
            [(answer as number) + rand(1, 5), (answer as number) - rand(1, 5) || (answer as number) + 6, (answer as number) + rand(6, 12)],
            answer as number,
            4,
            () => (answer as number) + (rand(0, 1) ? rand(2, 15) : -rand(2, 10))
        );
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
    const variants: ('alternating' | 'growing' | 'rotating' | 'color_cycle')[] = ['alternating', 'growing', 'rotating', 'color_cycle'];
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
        case 'color_cycle': {
            const cycleColors = shuffle([...SHAPE_COLORS]).slice(0, 3);
            const cycleShape = pick(SHAPE_TYPES);
            sequence = Array.from({ length: seqLen }, (_, i) => ({
                shape: cycleShape,
                color: cycleColors[i % cycleColors.length],
                size: 30
            }));
            break;
        }
    }

    answer = { ...sequence[missingIndex] };

    // Generate options - must include the correct answer and use actual sequence shapes for alternating
    options = [answer];
    const altShape1 = sequence[0];
    const altShape2 = sequence[1];
    while (options.length < 4) {
        let opt: ShapeInfo;
        if (ptype === 'alternating') {
            const isAnswerShape1 = answer.shape === altShape1.shape && answer.color === altShape1.color;
            const otherInPattern = isAnswerShape1 ? altShape2 : altShape1;
            const wrongShape = pick(SHAPE_TYPES.filter(s => s !== altShape1.shape && s !== altShape2.shape));
            const wrongColor = pick(SHAPE_COLORS.filter(c => c !== altShape1.color && c !== altShape2.color));
            opt = Math.random() > 0.33 ? otherInPattern : { shape: wrongShape, color: wrongColor, size: 30 };
        } else if (ptype === 'growing') {
            const sizes = [15, 27, 39, 51, 63, 75, 87];
            opt = { shape: baseShape, color: baseColor, size: pick(sizes.filter(s => s !== answer.size)) };
        } else if (ptype === 'color_cycle') {
            opt = { shape: answer.shape, color: pick(SHAPE_COLORS.filter(c => c !== answer.color)), size: 30 };
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
// Words by length for variety (especially "how many letters" puzzle)
const WORDS_BY_LENGTH: Record<number, string[]> = {
    3: ['axe', 'ion', 'arc', 'zen', 'hex', 'cat', 'cup', 'pie', 'gem', 'key', 'log', 'map', 'ray', 'run', 'web'],
    4: ['flow', 'code', 'wave', 'glow', 'mint', 'bolt', 'core', 'edge', 'fuel', 'jolt', 'link', 'meld', 'node', 'path', 'rift', 'scan', 'void', 'zap', 'pear', 'dusk'],
    5: ['brain', 'storm', 'pulse', 'nerve', 'focus', 'react', 'spark', 'flash', 'swift', 'blaze', 'sharp', 'logic', 'think', 'solve', 'power', 'speed', 'chess', 'pixel', 'glyph', 'nexus', 'prime', 'crypt', 'omega', 'delta', 'sigma', 'alpha', 'laser', 'sonic', 'turbo', 'hyper', 'ultra', 'cyber', 'boost', 'flame', 'frost', 'lunar', 'solar', 'astro', 'quark', 'prism', 'surge', 'drift', 'pitch', 'sword', 'coral', 'vault'],
    6: ['signal', 'matrix', 'vertex', 'puzzle', 'thrive', 'syntax', 'buffer', 'cipher', 'portal', 'fusion', 'zenith', 'pulsar', 'echoes', 'tundra', 'cobalt', 'velvet', 'mosaic', 'static', 'legacy', 'anchor', 'helix', 'mantra', 'oxygen', 'quartz'],
    7: ['circuit', 'quantum', 'cascade', 'pyramid', 'triumph', 'vortex', 'spectrum', 'harmony', 'marquee', 'citadel', 'phantom', 'plasma', 'emerald', 'sapphire', 'crystal', 'horizon'],
    8: ['algorithm', 'velocity', 'momentum', 'paramount', 'asteroid', 'fracture', 'levitate', 'pavilion', 'resonance', 'terminal'],
};
const WORDS_POOL = Object.values(WORDS_BY_LENGTH).flat();
// For typing/anagram/reverse/spelling: 4-6 chars for doable input speed
const TYPING_WORDS_POOL = [...WORDS_BY_LENGTH[4]!, ...WORDS_BY_LENGTH[5]!, ...WORDS_BY_LENGTH[6]!];

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
    const variants: ('typing' | 'anagram' | 'spelling' | 'vowels' | 'reverse' | 'category' | 'affix' | 'consonants' | 'length' | 'palindrome')[] =
        ['typing', 'anagram', 'spelling', 'vowels', 'reverse', 'category', 'affix', 'consonants', 'length', 'palindrome'];
    const variant = pick(variants);
    // Length/consonants/vowels need varied word lengths; typing variants use shorter words for input speed
    const word = ['length', 'consonants', 'vowels'].includes(variant)
        ? pick(WORDS_POOL)
        : pick(TYPING_WORDS_POOL);

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
            const CATEGORY_SETS = [
                { odd: ['DOG', 'CAT', 'BIRD'], in: ['APPLE', 'PEAR', 'PLUM'] },
                { odd: ['APPLE', 'PEAR', 'GRAPE'], in: ['LION', 'TIGER', 'BEAR'] },
                { odd: ['RED', 'BLUE', 'GREEN'], in: ['FROST', 'FLAME', 'STORM'] },
                { odd: ['RUN', 'JUMP', 'SWIM'], in: ['PIANO', 'GUITAR', 'DRUMS'] },
                { odd: ['SUN', 'MOON', 'STAR'], in: ['RIVER', 'OCEAN', 'LAKE'] },
            ];
            const set = pick(CATEGORY_SETS);
            const useOdd = Math.random() > 0.5;
            const targetWord = useOdd ? pick(set.in) : pick(set.odd);
            const distractors = shuffle(useOdd ? set.odd : set.in).slice(0, 3);
            prompt = '';
            answer = targetWord;
            options = shuffle([targetWord, ...distractors]);
            instruction = `Find the odd word out:`;
            break;
        }
        case 'affix': {
            const affixes = [
                { w: 'HYPER', p: 'HYP', s: 'ER' }, { w: 'SUPER', p: 'SUP', s: 'ER' },
                { w: 'REACT', p: 'RE', s: 'ACT' }, { w: 'BRAIN', p: 'BR', s: 'AIN' },
                { w: 'UNLOCK', p: 'UN', s: 'LOCK' }, { w: 'REPLAY', p: 'RE', s: 'PLAY' },
                { w: 'DISARM', p: 'DIS', s: 'ARM' }, { w: 'PRETEND', p: 'PRE', s: 'TEND' },
            ];
            const a = pick(affixes);
            prompt = `${a.p}__`;
            answer = a.s;
            instruction = `Complete the word:`;
            const distractors = ['OR', 'IS', 'ED', 'LY', 'IN', 'ON', 'EN'];
            options = shuffle([a.s, ...distractors.filter(d => d !== a.s).slice(0, 3)]);
            break;
        }
        case 'consonants': {
            prompt = word.toUpperCase();
            const cons = word.replace(/[aeiou]/gi, '').length;
            answer = cons.toString();
            instruction = `How many consonants?`;
            const consNum = cons;
            options = ensureUniqueOptions(
                [consNum + 1, consNum - 1, consNum + 2, consNum + 3].filter(n => n >= 0).map(String),
                answer,
                4,
                () => String(Math.max(0, consNum + rand(-2, 5)))
            );
            break;
        }
        case 'length': {
            prompt = word.toUpperCase();
            answer = word.length.toString();
            instruction = `How many letters?`;
            const len = word.length;
            options = ensureUniqueOptions(
                [len + 1, len - 1, len + 2, len + 3].filter(n => n > 0).map(String),
                answer,
                4,
                () => String(Math.max(1, len + rand(-1, 4)))
            );
            break;
        }
        case 'palindrome': {
            const palindromes = ['RADAR', 'CIVIC', 'LEVEL', 'ROTOR', 'KAYAK', 'REFER', 'MADAM', 'TENET'];
            const notPals = ['BRAIN', 'STORM', 'PULSE', 'SPARK', 'PIANO', 'TIGER', 'OCEAN', 'MAGIC'];
            const isPal = Math.random() > 0.5;
            const w = isPal ? pick(palindromes) : pick(notPals);
            prompt = `Is "${w}" a palindrome?`;
            answer = isPal ? 'Yes' : 'No';
            instruction = 'Pick Yes or No';
            options = shuffle(['Yes', 'No']);
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
    const variants: ('count' | 'odd' | 'color' | 'size' | 'rotation' | 'match' | 'pair')[] = ['count', 'odd', 'color', 'size', 'rotation', 'match', 'pair'];
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
    } else if (variant === 'pair') {
        // Two shapes match; click either of the pair. Others are unique.
        const pairShape = pick(SHAPE_TYPES);
        const pairColor = pick(SHAPE_COLORS);
        const pairInfo: ShapeInfo = { shape: pairShape, color: pairColor, size: 30 };
        const shapes: ShapeInfo[] = [];
        const pairIndices: number[] = [];
        const slotCount = rand(6, 8);
        const pairSlot1 = rand(0, slotCount - 1);
        let pairSlot2 = rand(0, slotCount - 1);
        while (pairSlot2 === pairSlot1) pairSlot2 = rand(0, slotCount - 1);
        for (let i = 0; i < slotCount; i++) {
            if (i === pairSlot1 || i === pairSlot2) {
                shapes.push({ ...pairInfo });
                pairIndices.push(i);
            } else {
                let s = pick(SHAPE_TYPES);
                let c = pick(SHAPE_COLORS);
                while (s === pairShape && c === pairColor) {
                    s = pick(SHAPE_TYPES);
                    c = pick(SHAPE_COLORS);
                }
                shapes.push({ shape: s, color: c, size: 30 });
            }
        }
        const data: SpatialPuzzleData = {
            type: 'spatial',
            variant: 'pair',
            shapes,
            answer: pairIndices[0],
            answerIndices: pairIndices,
        };
        return {
            id: uid(),
            category: 'spatial',
            instruction: `Click one of the matching pair`,
            difficulty,
            timeLimit: Math.max(4, 10 - difficulty * 0.4),
            basePoints: 120 + difficulty * 20,
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
const SHAPE_NAMES: ShapeInfo['shape'][] = ['circle', 'square', 'triangle', 'diamond', 'hexagon'];

function generateMemoryPuzzle(difficulty: number): PuzzleDefinition {
    const variant = pick(['numbers', 'colors', 'shapes'] as const);
    // Start at 1, scale up slowly. Shapes use fewer items (harder to recall)
    const len = variant === 'shapes'
        ? Math.min(1 + Math.floor(difficulty / 2), 5)
        : Math.min(1 + Math.floor(difficulty / 2.5), 7);

    let sequence: (number | string)[];
    if (variant === 'colors') {
        sequence = Array.from({ length: len }, () => pick(SHAPE_COLORS));
    } else if (variant === 'shapes') {
        sequence = Array.from({ length: len }, () => pick(SHAPE_NAMES));
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
    const variants: ('click' | 'moving' | 'sequence' | 'decoy' | 'double' | 'jitter' | 'burst')[] =
        ['click', 'moving', 'sequence', 'decoy', 'double', 'jitter', 'burst'];
    const variant = pick(variants);
    const count = Math.min(1 + Math.floor(difficulty / 3), 5);
    const targetCount = variant === 'sequence' ? Math.max(3, count + 1)
        : (variant === 'double' ? 2
            : (variant === 'burst' ? Math.min(5, count + 2) : count));

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
    if (variant === 'burst') instruction = `Clear all ${targetCount} targets fast!`;

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

// ---- FLING PUZZLES (first-class category, difficulty-scaled) ----
function generateFlingPuzzle(difficulty: number): PuzzleDefinition {
    const cardinalDirs: FlingDirection[] = ['left', 'right', 'top', 'bottom'];
    const diagonalDirs: FlingDirection[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    const dirs: FlingDirection[] = difficulty < 4
        ? cardinalDirs
        : difficulty < 7
            ? [...cardinalDirs, ...diagonalDirs]
            : [...cardinalDirs, ...diagonalDirs];
    const dir = pick(dirs);
    const instructions: Record<FlingDirection, string> = {
        left: 'Fling this card LEFT! ←',
        right: 'Fling this card RIGHT! →',
        top: 'Swipe UP! ↑',
        bottom: 'Yeet it DOWN! ↓',
        'top-left': 'Toss to the top-left! ↖',
        'top-right': 'Launch top-right! ↗',
        'bottom-left': 'Sling bottom-left! ↙',
        'bottom-right': 'Fling to the corner! ↘',
    };
    const timeLimit = Math.max(3, 5 - difficulty * 0.2);
    return {
        id: uid(),
        category: 'fling',
        instruction: instructions[dir],
        difficulty,
        timeLimit,
        basePoints: 90 + difficulty * 12,
        data: { type: 'minigame', variant: 'fling_direction', targetDirection: dir },
    };
}

// ---- MINIGAME PUZZLES (WarioWare-style microgames) ----
function generateMinigamePuzzle(difficulty: number): PuzzleDefinition {
    const variants: MinigamePuzzleData['variant'][] =
        ['click_when_go', 'whack', 'pick_biggest', 'pick_odd', 'double_tap', 'dont_click', 'countdown', 'tap_fast'];
    const variant = pick(variants);

    let instruction = '';
    let data: MinigamePuzzleData = { type: 'minigame', variant };

    switch (variant) {
        case 'click_when_go':
            instruction = 'Wait... then tap GO!';
            break;
        case 'whack':
            instruction = 'Whack it!';
            break;
        case 'pick_biggest':
            instruction = 'Tap the biggest!';
            {
                const count = 4;
                const answerIndex = rand(0, count - 1);
                const shapes: ShapeInfo[] = [];
                for (let i = 0; i < count; i++) {
                    shapes.push({
                        shape: pick(SHAPE_TYPES),
                        color: pick(SHAPE_COLORS),
                        size: i === answerIndex ? 44 : 24 + rand(-2, 2),
                    });
                }
                data = { ...data, shapes, answerIndex };
            }
            break;
        case 'pick_odd':
            instruction = 'Tap the odd one!';
            {
                const mainShape = pick(SHAPE_TYPES);
                const oddShape = pick(SHAPE_TYPES.filter((s) => s !== mainShape));
                const count = 4;
                const answerIndex = rand(0, count - 1);
                const shapes: ShapeInfo[] = Array.from({ length: count }, (_, i) => ({
                    shape: i === answerIndex ? oddShape : mainShape,
                    color: pick(SHAPE_COLORS),
                    size: 28,
                }));
                data = { ...data, shapes, answerIndex };
            }
            break;
        case 'double_tap':
            instruction = 'Double-tap!';
            break;
        case 'dont_click':
            instruction = 'Don\'t tap until it says CLICK!';
            break;
        case 'countdown':
            instruction = 'Tap on zero!';
            break;
        case 'tap_fast':
            instruction = 'Tap 5 times fast!';
            break;
    }

    return {
        id: uid(),
        category: 'minigame',
        instruction,
        difficulty,
        timeLimit: Math.max(2.5, 4 - difficulty * 0.15),
        basePoints: 90 + difficulty * 12,
        data,
    };
}

// ---- META PUZZLES (game-state awareness, singleplayer only) ----
function generateMetaPuzzle(difficulty: number, state: GameState): PuzzleDefinition {
    const variants: MetaPuzzleData['variant'][] = ['gameTime', 'lives', 'intensity', 'combo', 'maxCombo', 'activeCount', 'realTimeHour', 'score'];
    const variant = pick(variants);

    const now = Date.now();
    let answer: number;
    let instruction: string;
    let options: number[];

    switch (variant) {
        case 'gameTime':
            answer = Math.floor((now - state.startTime) / 1000);
            instruction = 'How many seconds have you been playing?';
            options = ensureUniqueOptions(
                [answer + rand(5, 15), Math.max(0, answer - rand(5, 15)), answer + rand(20, 40)],
                answer,
                4,
                () => Math.max(0, answer + rand(-20, 60))
            );
            break;
        case 'lives':
            answer = Math.max(0, state.missThreshold - state.puzzlesMissed);
            instruction = 'How many lives do you have left?';
            options = ensureUniqueOptions(
                [answer + 1, Math.max(0, answer - 1), answer + 2, answer + 3],
                answer,
                4,
                () => Math.max(0, answer + rand(1, 5))
            );
            break;
        case 'intensity':
            answer = Math.round(state.difficulty);
            instruction = "What's your intensity level? (1-10)";
            options = ensureUniqueOptions(
                [Math.min(10, answer + 1), Math.max(1, answer - 1), Math.min(10, answer + 2), Math.max(1, answer - 2)],
                answer,
                4,
                () => Math.min(10, Math.max(1, answer + rand(-3, 3)))
            );
            break;
        case 'combo':
            answer = state.combo;
            instruction = "What's your current combo?";
            options = ensureUniqueOptions(
                [answer + 1, Math.max(0, answer - 1), answer + rand(2, 5), answer + rand(6, 10)],
                answer,
                4,
                () => Math.max(0, answer + rand(2, 12))
            );
            break;
        case 'maxCombo':
            answer = state.maxCombo;
            instruction = "What's your best combo this run?";
            options = ensureUniqueOptions(
                [answer + 1, Math.max(0, answer - 1), answer + rand(2, 5), answer + rand(6, 10)],
                answer,
                4,
                () => Math.max(0, answer + rand(2, 12))
            );
            break;
        case 'score':
            answer = state.score;
            instruction = "What number is closest to your current score?";
            const delta = Math.max(100, Math.floor(state.score * 0.1));
            options = ensureUniqueOptions(
                [answer + delta, Math.max(0, answer - delta), answer + delta * 2, answer + delta * 3],
                answer,
                4,
                () => Math.max(0, answer + rand(-2, 4) * delta)
            );
            break;
        case 'activeCount':
            answer = state.activePuzzles.filter((p) => !p.solved && !p.expired).length;
            instruction = 'How many puzzles are on screen right now? (including this card)';
            options = ensureUniqueOptions(
                [answer + 1, Math.max(0, answer - 1), answer + 2, answer + 3],
                answer,
                4,
                () => Math.max(0, answer + rand(1, 5))
            );
            break;
        case 'realTimeHour': {
            const hour12 = (new Date().getHours() % 12) || 12;
            answer = hour12;
            instruction = "What hour is it? (12-hour, 1-12)";
            const candidates = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((h) => h !== hour12);
            options = ensureUniqueOptions(
                [candidates[rand(0, Math.min(2, candidates.length - 1))] ?? 1, candidates[rand(3, Math.min(5, candidates.length - 1))] ?? 2, candidates[rand(6, Math.min(8, candidates.length - 1))] ?? 3],
                hour12,
                4,
                () => candidates[rand(0, candidates.length - 1)] ?? 1
            );
            break;
        }
    }

    const data: MetaPuzzleData = { type: 'meta', variant, answer, options };
    return {
        id: uid(),
        category: 'meta',
        instruction: instruction!,
        difficulty,
        timeLimit: Math.max(5, 10 - difficulty * 0.3),
        basePoints: 130 + difficulty * 25,
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
    minigame: generateMinigamePuzzle,
    fling: generateFlingPuzzle,
    powerup: generatePowerUpPuzzle,
    meta: generateMetaPuzzle as (d: number) => PuzzleDefinition,
};

const CATEGORY_UNLOCK_ORDER: PuzzleCategory[] = [
    'math',
    'pattern',
    'language',
    'spatial',
    'reaction',
    'memory',
    'minigame',
    'fling',
    'meta',
    'powerup',
];

export function getAvailableCategories(_difficulty: number): PuzzleCategory[] {
    return [...CATEGORY_UNLOCK_ORDER];
}

export function generatePuzzle(
    difficulty: number,
    activeCategories: PuzzleCategory[] = [],
    forceCategory?: PuzzleCategory,
    gameState?: GameState
): PuzzleDefinition {
    if (forceCategory) {
        if (forceCategory === 'meta' && gameState) {
            return generateMetaPuzzle(Math.min(10, Math.max(1, Math.round(difficulty))), gameState);
        }
        return generators[forceCategory](Math.min(10, Math.max(1, Math.round(difficulty))));
    }

    const availableCategories = getAvailableCategories(difficulty);
    let categories = availableCategories;

    // Meta requires game state (singleplayer only); exclude if no state
    if (!gameState) {
        categories = categories.filter(c => c !== 'meta');
    }
    // Prevent duplicates of intense categories if they are already active
    if (activeCategories.includes('memory')) {
        categories = categories.filter(c => c !== 'memory');
    }
    if (activeCategories.includes('powerup')) {
        categories = categories.filter(c => c !== 'powerup');
    }

    // Fallback if we accidentally filtered everything
    if (categories.length === 0) categories = availableCategories.filter(c => c !== 'meta' || gameState);

    const category = pick(categories);
    const clampedDifficulty = Math.min(10, Math.max(1, Math.round(difficulty)));
    if (category === 'meta' && gameState) {
        return generateMetaPuzzle(clampedDifficulty, gameState);
    }
    return generators[category](clampedDifficulty);
}

export function resetPuzzleCounter(): void {
    puzzleIdCounter = 0;
}
