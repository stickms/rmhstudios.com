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
    EmojiPuzzleData,
    TriviaPuzzleData,
    RomanPuzzleData,
    MathPuzzleData,
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

function ensureUniqueOptions<T>(raw: T[], answer: T, minCount: number, genExtra: () => T): T[] {
    const seen = new Set<T>([answer]);
    const result: T[] = [answer];
    for (const o of raw) {
        if (!seen.has(o)) { seen.add(o); result.push(o); }
    }
    for (let attempts = 0; result.length < minCount && attempts < 20; attempts++) {
        const extra = genExtra();
        if (!seen.has(extra)) { seen.add(extra); result.push(extra); }
    }
    return shuffle(result);
}

const SHAPE_TYPES: ShapeInfo['shape'][] = ['circle', 'square', 'triangle', 'diamond', 'hexagon'];
const SHAPE_COLORS = ['#ff5252', '#00e5ff', '#76ff03', '#ffab00', '#b388ff', '#ff6ec7'];

// ---- MATH PUZZLES ----
function generateMathPuzzle(difficulty: number): PuzzleDefinition {
    const types: MathPuzzleData['variant'][] = ['arithmetic', 'compare', 'nearest', 'operator', 'percent', 'sequence', 'digit_sum'];
    if (difficulty > 2) types.push('algebra');
    if (difficulty > 3) types.push('geometry');
    if (difficulty > 2) types.push('modulo');
    if (difficulty > 3) types.push('power');
    if (difficulty > 1) types.push('prime_check');
    const ptype = pick(types);

    let answer: number | string = 0, expression = '', instruction = '';
    let options: (number | string)[] | undefined;

    if (ptype === 'modulo') {
        const b = pick([2, 3, 4, 5, 6, 7, 8]);
        const a = rand(b + 1, b * 9);
        answer = a % b;
        expression = `${a} mod ${b}`;
        instruction = `Remainder?`;
        options = ensureUniqueOptions(
            [((answer as number) + 1) % b, ((answer as number) + 2) % b, b - 1 === answer ? 0 : b - 1],
            answer, 4, () => rand(0, b - 1)
        );
    } else if (ptype === 'power') {
        const base = pick([2, 3, 4]);
        const exp = difficulty < 5 ? rand(1, 3) : rand(2, 4);
        answer = Math.pow(base, exp);
        expression = `${base}^${exp}`;
        instruction = `Calculate:`;
        options = ensureUniqueOptions(
            [(answer as number) + rand(2, 8), Math.max(1, (answer as number) - rand(2, 5)), (answer as number) + rand(10, 20)],
            answer, 4, () => (answer as number) + (rand(0, 1) ? rand(2, 20) : -rand(1, 8))
        );
    } else if (ptype === 'prime_check') {
        const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43];
        const nonPrimes = [4, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21, 22, 24, 25, 27];
        const isPrime = Math.random() > 0.45;
        const num = isPrime ? pick(primes) : pick(nonPrimes);
        expression = `${num}`;
        instruction = `Is ${num} prime?`;
        answer = isPrime ? 'Yes' : 'No';
        options = shuffle(['Yes', 'No']);
    } else if (ptype === 'algebra') {
        const x = rand(1, 12);
        const a = rand(2, 5);
        const b = rand(1, 10);
        const isAdd = Math.random() > 0.5;
        const c = isAdd ? a * x + b : a * x - b;
        answer = x;
        expression = isAdd ? `${a}x + ${b} = ${c}` : `${a}x − ${b} = ${c}`;
        instruction = `Solve for x:`;
        options = ensureUniqueOptions(
            [answer + rand(1, 4), (answer - rand(1, 4)) || answer + 5, answer + rand(5, 8)],
            answer, 4, () => (answer as number) + (rand(0, 1) ? rand(2, 15) : -rand(2, 10))
        );
    } else if (ptype === 'geometry') {
        const gv = pick(['area_rect', 'perimeter_rect', 'area_tri'] as const);
        if (gv === 'area_rect') {
            const w = rand(3, 12), h = rand(3, 12);
            answer = w * h; expression = `${w} × ${h} rect`; instruction = `Area = ?`;
        } else if (gv === 'perimeter_rect') {
            const w = rand(3, 12), h = rand(3, 12);
            answer = 2 * (w + h); expression = `${w} × ${h} rect`; instruction = `Perimeter = ?`;
        } else {
            const b2 = rand(4, 12), h = rand(4, 12);
            answer = (b2 * h) / 2; expression = `base=${b2}, h=${h} triangle`; instruction = `Area = ?`;
        }
        options = ensureUniqueOptions(
            [(answer as number) + rand(2, 5), Math.max(1, (answer as number) - rand(2, 5)), (answer as number) + rand(6, 12)],
            answer, 4, () => (answer as number) + (rand(0, 1) ? rand(2, 15) : -rand(2, 10))
        );
    } else if (ptype === 'compare') {
        const a1 = rand(10, 50), b1 = rand(1, 20);
        const a2 = rand(10, 50), b2 = rand(1, 20);
        const expr1 = `${a1}+${b1}`, expr2 = `${a2}+${b2}`;
        const val1 = a1 + b1, val2 = a2 + b2;
        expression = val1 !== val2 ? `${expr1} vs ${expr2}` : `${expr1} vs ${a2 + 1}+${b2}`;
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
        options = shuffle(diffs.map((d, i) => target + d * signs[i]));
        answer = target + diffs[0] * signs[0];
    } else if (ptype === 'operator') {
        const a = rand(2, 12), b = rand(2, 12);
        const ops = ['+', '−', '×'];
        const chosen = pick(ops);
        let val = 0;
        if (chosen === '+') val = a + b;
        if (chosen === '−') val = a - b;
        if (chosen === '×') val = a * b;
        expression = `${a} ? ${b} = ${val}`;
        instruction = `Missing operator?`;
        answer = chosen;
        options = shuffle(['+', '−', '×', '÷']);
    } else if (ptype === 'percent') {
        const pct = pick([10, 20, 25, 50, 75]);
        const num = pick([20, 40, 60, 80, 100, 120, 200]);
        answer = Math.round((pct / 100) * num);
        expression = `${pct}% of ${num}`;
        instruction = `Calculate:`;
        options = ensureUniqueOptions(
            [(answer as number) + 5, Math.max(0, (answer as number) - 5), (answer as number) + 10],
            answer as number, 4, () => (answer as number) + rand(2, 15)
        );
    } else if (ptype === 'sequence') {
        const st = pick(['linear', 'geometric', 'fib'] as const);
        let seq: number[] = [];
        if (st === 'linear') {
            const start = rand(1, 8), step = pick([2, 3, 4, 5, 7]);
            seq = Array.from({ length: 4 }, (_, i) => start + i * step);
            answer = seq[3] + step;
        } else if (st === 'geometric') {
            const start = pick([1, 2, 3]), ratio = pick([2, 3]);
            seq = Array.from({ length: 4 }, (_, i) => start * Math.pow(ratio, i));
            answer = seq[3] * ratio;
        } else {
            const a2 = rand(1, 4), b2 = rand(1, 4);
            const full = [a2, b2, a2 + b2, a2 + 2 * b2, 2 * a2 + 3 * b2];
            answer = full[4]; seq = full.slice(0, 4);
        }
        expression = seq.join(', ') + ', ?';
        instruction = `Next in sequence?`;
        options = ensureUniqueOptions(
            [(answer as number) + rand(2, 6), Math.max(0, (answer as number) - rand(2, 6)), (answer as number) + rand(7, 15)],
            answer as number, 4, () => (answer as number) + (rand(0, 1) ? rand(2, 12) : -rand(2, 10))
        );
    } else if (ptype === 'digit_sum') {
        const num = rand(100, 999);
        const digits = String(num).split('').map(Number);
        answer = digits.reduce((a, b) => a + b, 0);
        expression = `Digit sum of ${num}`;
        instruction = `Calculate:`;
        options = ensureUniqueOptions(
            [(answer as number) + 1, (answer as number) - 1 || (answer as number) + 3, (answer as number) + 2],
            answer as number, 4, () => (answer as number) + rand(3, 10)
        );
    } else {
        // arithmetic
        const ops = ['+', '−', '×'];
        if (difficulty > 4) ops.push('÷');
        const op = pick(ops);
        const maxNum = Math.min(5 + difficulty * 3, 50);
        let a: number, b: number;
        switch (op) {
            case '+': a = rand(1, maxNum); b = rand(1, maxNum); answer = a + b; expression = `${a} + ${b}`; break;
            case '−': a = rand(1, maxNum); b = rand(1, a); answer = a - b; expression = `${a} − ${b}`; break;
            case '×': a = rand(2, Math.min(12, maxNum)); b = rand(2, Math.min(12, maxNum)); answer = a * b; expression = `${a} × ${b}`; break;
            case '÷': b = rand(2, 12); answer = rand(1, 12); a = b * (answer as number); expression = `${a} ÷ ${b}`; break;
            default: a = rand(1, maxNum); b = rand(1, maxNum); answer = a + b; expression = `${a} + ${b}`;
        }
        instruction = `What is ${expression}?`;
        options = ensureUniqueOptions(
            [(answer as number) + rand(1, 5), (answer as number) - rand(1, 5) || (answer as number) + 6, (answer as number) + rand(6, 12)],
            answer as number, 4, () => (answer as number) + (rand(0, 1) ? rand(2, 15) : -rand(2, 10))
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
    const variants: PatternPuzzleData['variant'][] = ['alternating', 'growing', 'rotating', 'color_cycle'];
    const ptype = pick(variants);

    const baseShape = pick(SHAPE_TYPES);
    const baseColor = pick(SHAPE_COLORS);
    const seqLen = 5;
    const missingIndex = rand(0, seqLen - 1);
    let sequence: ShapeInfo[] = [];

    switch (ptype) {
        case 'alternating': {
            const s1: ShapeInfo = { shape: baseShape, color: baseColor, size: 30 };
            const s2: ShapeInfo = { shape: pick(SHAPE_TYPES.filter(s => s !== baseShape)), color: pick(SHAPE_COLORS.filter(c => c !== baseColor)), size: 30 };
            sequence = Array.from({ length: seqLen }, (_, i) => (i % 2 === 0 ? s1 : s2));
            break;
        }
        case 'growing': {
            sequence = Array.from({ length: seqLen }, (_, i) => ({ shape: baseShape, color: baseColor, size: 14 + i * 13 }));
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
            sequence = Array.from({ length: seqLen }, (_, i) => ({ shape: cycleShape, color: cycleColors[i % cycleColors.length], size: 30 }));
            break;
        }
        default: {
            sequence = Array.from({ length: seqLen }, (_, i) => ({ shape: baseShape, color: baseColor, size: 14 + i * 13 }));
        }
    }

    const answer = { ...sequence[missingIndex] };
    const options: ShapeInfo[] = [answer];
    let safety = 0;
    // Generate clearly distinct wrong options — always vary shape OR color
    while (options.length < 4 && safety++ < 40) {
        let opt: ShapeInfo;
        const strategy = Math.random();
        if (strategy < 0.4) {
            // Different shape, same color
            opt = { shape: pick(SHAPE_TYPES.filter(s => s !== answer.shape)), color: answer.color, size: answer.size, rotation: answer.rotation };
        } else if (strategy < 0.8) {
            // Same shape, different color
            opt = { shape: answer.shape, color: pick(SHAPE_COLORS.filter(c => c !== answer.color)), size: answer.size, rotation: answer.rotation };
        } else {
            // Different shape AND color
            opt = { shape: pick(SHAPE_TYPES.filter(s => s !== answer.shape)), color: pick(SHAPE_COLORS.filter(c => c !== answer.color)), size: answer.size, rotation: answer.rotation };
        }
        const dup = options.some(o => o.shape === opt.shape && o.color === opt.color);
        if (!dup) options.push(opt);
    }

    return {
        id: uid(),
        category: 'pattern',
        instruction: `What fills the gap?`,
        difficulty,
        timeLimit: Math.max(5, 12 - difficulty * 0.5),
        basePoints: 120 + difficulty * 25,
        data: { type: 'pattern', variant: ptype, sequence, answer, options: shuffle(options), missingIndex },
    };
}

type PatternPuzzleData = import('./types').PatternPuzzleData;

// ---- LANGUAGE PUZZLES ----
const WORDS_BY_LENGTH: Record<number, string[]> = {
    3: ['axe', 'ion', 'arc', 'zen', 'hex', 'cat', 'cup', 'pie', 'gem', 'key', 'log', 'map', 'ray', 'run', 'web'],
    4: ['flow', 'code', 'wave', 'glow', 'mint', 'bolt', 'core', 'edge', 'fuel', 'jolt', 'link', 'meld', 'node', 'path', 'rift', 'scan', 'void', 'pear', 'dusk', 'gust'],
    5: ['brain', 'storm', 'pulse', 'nerve', 'focus', 'react', 'spark', 'flash', 'swift', 'blaze', 'sharp', 'logic', 'think', 'solve', 'power', 'speed', 'chess', 'pixel', 'glyph', 'nexus', 'prime', 'crypt', 'omega', 'delta', 'sigma', 'alpha', 'laser', 'sonic', 'turbo', 'hyper', 'ultra', 'cyber', 'boost', 'flame', 'frost', 'lunar', 'solar', 'astro', 'quark', 'prism', 'surge', 'drift', 'pitch', 'sword', 'coral', 'vault'],
    6: ['signal', 'matrix', 'vertex', 'puzzle', 'thrive', 'syntax', 'buffer', 'cipher', 'portal', 'fusion', 'zenith', 'pulsar', 'echoes', 'tundra', 'cobalt', 'velvet', 'mosaic', 'static', 'legacy', 'anchor', 'helix', 'mantra', 'oxygen', 'quartz'],
    7: ['circuit', 'quantum', 'cascade', 'pyramid', 'triumph', 'vortex', 'marquee', 'citadel', 'phantom', 'emerald', 'crystal', 'horizon'],
    8: ['algorithm', 'velocity', 'momentum', 'asteroid', 'fracture', 'levitate', 'pavilion', 'resonance', 'terminal'],
};
const WORDS_POOL = Object.values(WORDS_BY_LENGTH).flat();
const TYPING_WORDS_POOL = [...WORDS_BY_LENGTH[4]!, ...WORDS_BY_LENGTH[5]!, ...WORDS_BY_LENGTH[6]!];

const RHYME_PAIRS: [string, string[]][] = [
    ['BRAIN', ['RAIN', 'CHAIN', 'TRAIN', 'DRAIN']],
    ['FLOW', ['GLOW', 'SHOW', 'GROW', 'KNOW']],
    ['SPARK', ['DARK', 'MARK', 'BARK', 'PARK']],
    ['FROST', ['COST', 'LOST', 'MOST', 'TOAST']],
    ['PRIME', ['TIME', 'LIME', 'DIME', 'CRIME']],
    ['FLASH', ['CASH', 'DASH', 'CRASH', 'HASH']],
    ['SURGE', ['PURGE', 'MERGE', 'URGE', 'VERGE']],
    ['BOOST', ['ROOST', 'COAST', 'TOAST', 'GHOST']],
];

function scrambleWord(word: string): string {
    if (word.length <= 3) return word;
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
    const variants: LanguagePuzzleData['variant'][] =
        ['typing', 'anagram', 'spelling', 'vowels', 'reverse', 'category', 'affix', 'consonants', 'length', 'palindrome', 'first_letter', 'rhyme'];
    const variant = pick(variants);
    const word = ['length', 'consonants', 'vowels', 'first_letter'].includes(variant)
        ? pick(WORDS_POOL)
        : pick(TYPING_WORDS_POOL);

    let prompt = '', answer = '', instruction = '';
    let options: string[] | undefined;

    switch (variant) {
        case 'typing': prompt = word.toUpperCase(); answer = word; instruction = `Type this:`; break;
        case 'anagram': prompt = scrambleWord(word).toUpperCase(); answer = word; instruction = `Unscramble:`; break;
        case 'spelling': {
            const idx = rand(1, word.length - 2);
            prompt = word.substring(0, idx) + '_' + word.substring(idx + 1);
            answer = word[idx].toUpperCase();
            instruction = `Missing letter?`;
            const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(c => c !== answer);
            options = shuffle([answer, ...shuffle(abc).slice(0, 3)]);
            break;
        }
        case 'vowels': {
            prompt = word.toUpperCase();
            const vCount = (word.match(/[aeiou]/gi) || []).length;
            answer = vCount.toString();
            instruction = `How many vowels?`;
            options = ensureUniqueOptions(
                [vCount + 1, Math.max(0, vCount - 1), vCount + 2].map(String),
                answer, 4, () => rand(0, word.length).toString()
            );
            break;
        }
        case 'reverse': prompt = word.toUpperCase(); answer = word.split('').reverse().join(''); instruction = `Type backwards:`; break;
        case 'category': {
            const SETS = [
                { odd: ['DOG', 'CAT', 'BIRD'], in: ['APPLE', 'PEAR', 'PLUM'] },
                { odd: ['APPLE', 'PEAR', 'GRAPE'], in: ['LION', 'TIGER', 'BEAR'] },
                { odd: ['RED', 'BLUE', 'GREEN'], in: ['FROST', 'FLAME', 'STORM'] },
                { odd: ['RUN', 'JUMP', 'SWIM'], in: ['PIANO', 'GUITAR', 'DRUMS'] },
                { odd: ['SUN', 'MOON', 'STAR'], in: ['RIVER', 'OCEAN', 'LAKE'] },
                { odd: ['MATH', 'SCIENCE', 'ART'], in: ['HAMMER', 'DRILL', 'SAW'] },
                { odd: ['IRON', 'COPPER', 'GOLD'], in: ['ROSE', 'TULIP', 'DAISY'] },
            ];
            const set = pick(SETS);
            const useOdd = Math.random() > 0.5;
            const target = useOdd ? pick(set.in) : pick(set.odd);
            const distractors = shuffle(useOdd ? set.odd : set.in).slice(0, 3);
            prompt = ''; answer = target; instruction = `Odd one out:`;
            options = shuffle([target, ...distractors]);
            break;
        }
        case 'affix': {
            const affixes = [
                { p: 'PIX', s: 'EL', d: ['OR', 'UM', 'AT'] },
                { p: 'FUN', s: 'GI', d: ['EL', 'OR', 'UM'] },
                { p: 'CUB', s: 'IC', d: ['EL', 'OR', 'UM'] },
                { p: 'HAV', s: 'OC', d: ['EL', 'UM', 'AT'] },
                { p: 'COM', s: 'IC', d: ['EL', 'UM', 'OT'] },
                { p: 'TUL', s: 'IP', d: ['OR', 'UM', 'AT'] },
                { p: 'VOC', s: 'AL', d: ['OR', 'UM', 'IC'] },
                { p: 'VIV', s: 'ID', d: ['OR', 'EL', 'UM'] },
                { p: 'MIM', s: 'IC', d: ['OR', 'EL', 'UM'] },
                { p: 'VIG', s: 'OR', d: ['EL', 'UM', 'AT'] },
                { p: 'DEC', s: 'OY', d: ['EL', 'UM', 'AT'] },
                { p: 'BAN', s: 'JO', d: ['EL', 'UM', 'IT'] },
                { p: 'TOP', s: 'AZ', d: ['EL', 'UM', 'OR'] },
                { p: 'RAD', s: 'AR', d: ['EL', 'UM', 'OT'] },
            ];
            const a = pick(affixes);
            prompt = `${a.p}${'_'.repeat(a.s.length)}`; answer = a.s; instruction = `Complete the word:`;
            options = shuffle([a.s, ...a.d]);
            break;
        }
        case 'consonants': {
            prompt = word.toUpperCase();
            const cons = word.replace(/[aeiou]/gi, '').length;
            answer = cons.toString();
            instruction = `How many consonants?`;
            options = ensureUniqueOptions(
                [cons + 1, cons - 1, cons + 2].filter(n => n >= 0).map(String),
                answer, 4, () => String(Math.max(0, cons + rand(-2, 5)))
            );
            break;
        }
        case 'length': {
            prompt = word.toUpperCase();
            answer = word.length.toString();
            instruction = `How many letters?`;
            const len = word.length;
            options = ensureUniqueOptions(
                [len + 1, len - 1, len + 2].filter(n => n > 0).map(String),
                answer, 4, () => String(Math.max(1, len + rand(-1, 4)))
            );
            break;
        }
        case 'palindrome': {
            const pals = ['RADAR', 'CIVIC', 'LEVEL', 'ROTOR', 'KAYAK', 'REFER', 'MADAM', 'TENET', 'NOON', 'DEED'];
            const notPals = ['BRAIN', 'STORM', 'PULSE', 'SPARK', 'PIANO', 'TIGER', 'OCEAN', 'MAGIC', 'SIGNAL'];
            const isPal = Math.random() > 0.5;
            const w = isPal ? pick(pals) : pick(notPals);
            prompt = w; answer = isPal ? 'Yes' : 'No'; instruction = `Palindrome?`;
            options = shuffle(['Yes', 'No']);
            break;
        }
        case 'first_letter': {
            const w = pick(WORDS_POOL);
            prompt = w.toUpperCase();
            answer = w[0].toUpperCase();
            instruction = `First letter?`;
            const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(c => c !== answer);
            options = shuffle([answer, ...shuffle(abc).slice(0, 3)]);
            break;
        }
        case 'rhyme': {
            const pair = pick(RHYME_PAIRS);
            const base = pair[0];
            const rhymes = pair[1];
            const correct = pick(rhymes);
            const nonRhymes = ['BRAIN', 'CODE', 'WAVE', 'BOLT', 'VOID', 'PIXEL', 'NEXUS', 'FOCAL'].filter(w => !rhymes.includes(w));
            prompt = `"${base}"`; answer = correct; instruction = `Which word rhymes?`;
            options = shuffle([correct, ...shuffle(nonRhymes).slice(0, 3)]);
            break;
        }
        default:
            prompt = word.toUpperCase(); answer = word; instruction = `Type this:`;
    }

    return {
        id: uid(),
        category: 'language',
        instruction,
        difficulty,
        timeLimit: Math.max(4, 10 - difficulty * 0.4),
        basePoints: 110 + difficulty * 15,
        data: { type: 'language', variant, prompt, answer, options } as LanguagePuzzleData,
    };
}

// ---- SPATIAL PUZZLES ----
function generateSpatialPuzzle(difficulty: number): PuzzleDefinition {
    const variants: ('count' | 'odd' | 'color' | 'size' | 'rotation' | 'match' | 'pair')[] = ['count', 'odd', 'color', 'size', 'rotation', 'match', 'pair'];
    const variant = pick(variants);

    if (variant === 'count') {
        const targetShape = pick(SHAPE_TYPES);
        const count = rand(3, 6 + Math.floor(difficulty / 2));
        const shapes: ShapeInfo[] = Array.from({ length: count }, () => ({ shape: targetShape, color: pick(SHAPE_COLORS), size: rand(20, 40) }));
        const dc = rand(2, 4 + Math.floor(difficulty / 2));
        for (let i = 0; i < dc; i++) shapes.push({ shape: pick(SHAPE_TYPES.filter(s => s !== targetShape)), color: pick(SHAPE_COLORS), size: rand(20, 40) });
        return {
            id: uid(), category: 'spatial', instruction: `Count the ${targetShape}s`,
            difficulty, timeLimit: Math.max(5, 12 - difficulty * 0.5), basePoints: 130 + difficulty * 20,
            data: { type: 'spatial', variant: 'count', shapes: shuffle(shapes), answer: count, options: shuffle([count, count + 1, count - 1, count + 2]) } as SpatialPuzzleData,
        };
    } else if (variant === 'pair') {
        const ps = pick(SHAPE_TYPES), pc = pick(SHAPE_COLORS);
        const pi: ShapeInfo = { shape: ps, color: pc, size: 30 };
        const slotCount = rand(6, 8);
        const pSlot1 = rand(0, slotCount - 1);
        let pSlot2 = rand(0, slotCount - 1);
        while (pSlot2 === pSlot1) pSlot2 = rand(0, slotCount - 1);
        const pairIndices = [pSlot1, pSlot2];
        const shapes: ShapeInfo[] = Array.from({ length: slotCount }, (_, i) => {
            if (pairIndices.includes(i)) return { ...pi };
            let s = pick(SHAPE_TYPES), c = pick(SHAPE_COLORS);
            while (s === ps && c === pc) { s = pick(SHAPE_TYPES); c = pick(SHAPE_COLORS); }
            return { shape: s, color: c, size: 30 };
        });
        return {
            id: uid(), category: 'spatial', instruction: `Click either matching pair`,
            difficulty, timeLimit: Math.max(4, 10 - difficulty * 0.4), basePoints: 120 + difficulty * 20,
            data: { type: 'spatial', variant: 'pair', shapes, answer: pairIndices[0], answerIndices: pairIndices } as SpatialPuzzleData,
        };
    } else if (variant === 'rotation' || variant === 'match') {
        const count = rand(5, 8), answerIndex = rand(0, count - 1);
        let shapes: ShapeInfo[] = [], instruction = '';
        if (variant === 'rotation') {
            const shape = pick(['square', 'triangle', 'hexagon'] as ShapeInfo['shape'][]), color = pick(SHAPE_COLORS);
            shapes = Array.from({ length: count }, (_, i) => ({ shape, color, size: 30, rotation: i === answerIndex ? 45 : 0 }));
            instruction = `Click the rotated shape`;
        } else {
            const ts = pick(SHAPE_TYPES), tc = pick(SHAPE_COLORS);
            shapes = Array.from({ length: count }, (_, i) => {
                if (i === answerIndex) return { shape: ts, color: tc, size: 30 };
                let s = pick(SHAPE_TYPES), c = pick(SHAPE_COLORS);
                while (s === ts && c === tc) { s = pick(SHAPE_TYPES); c = pick(SHAPE_COLORS); }
                return { shape: s, color: c, size: 30 };
            });
            instruction = `Find the ${SHAPE_COLOR_NAMES[tc] || tc} ${ts}`;
        }
        return {
            id: uid(), category: 'spatial', instruction, difficulty,
            timeLimit: Math.max(4, 10 - difficulty * 0.4), basePoints: 120 + difficulty * 20,
            data: { type: 'spatial', variant, shapes, answer: answerIndex } as SpatialPuzzleData,
        };
    } else if (variant === 'color' || variant === 'size') {
        const count = rand(4, 7), answerIndex = rand(0, count - 1);
        let shapes: ShapeInfo[] = [], instruction = '';
        if (variant === 'color') {
            const tc = pick(SHAPE_COLORS), ts = pick(SHAPE_TYPES);
            const dc = SHAPE_COLORS.filter(c => c !== tc);
            shapes = Array.from({ length: count }, (_, i) => i === answerIndex ? { shape: ts, color: tc, size: 30 } : { shape: pick(SHAPE_TYPES), color: pick(dc), size: 30 });
            instruction = `Find the ${SHAPE_COLOR_NAMES[tc] || tc} ${ts}`;
        } else {
            const findLargest = Math.random() > 0.5;
            instruction = findLargest ? `Largest shape?` : `Smallest shape?`;
            const diffSize = findLargest ? 52 : 14;
            shapes = Array.from({ length: count }, (_, i) => ({ shape: pick(SHAPE_TYPES), color: pick(SHAPE_COLORS), size: i === answerIndex ? diffSize : 30 + rand(-5, 5) }));
        }
        return {
            id: uid(), category: 'spatial', instruction, difficulty,
            timeLimit: Math.max(4, 10 - difficulty * 0.4), basePoints: 120 + difficulty * 20,
            data: { type: 'spatial', variant, shapes, answer: answerIndex } as SpatialPuzzleData,
        };
    } else {
        const ms = pick(SHAPE_TYPES), mc = pick(SHAPE_COLORS), os = pick(SHAPE_TYPES.filter(s => s !== ms));
        const count = rand(4, 7), oddIndex = rand(0, count - 1);
        const shapes: ShapeInfo[] = Array.from({ length: count }, (_, i) => ({ shape: i === oddIndex ? os : ms, color: mc, size: 30 }));
        return {
            id: uid(), category: 'spatial', instruction: `Click the odd one out`, difficulty,
            timeLimit: Math.max(4, 10 - difficulty * 0.4), basePoints: 120 + difficulty * 20,
            data: { type: 'spatial', variant: 'odd', shapes, answer: oddIndex } as SpatialPuzzleData,
        };
    }
}

// ---- MEMORY PUZZLES ----
const SHAPE_NAMES: ShapeInfo['shape'][] = ['circle', 'square', 'triangle', 'diamond', 'hexagon'];

function generateMemoryPuzzle(difficulty: number): PuzzleDefinition {
    const variant = pick(['numbers', 'colors', 'shapes'] as const);
    const len = variant === 'shapes'
        ? Math.min(1 + Math.floor(difficulty / 2), 5)
        : Math.min(1 + Math.floor(difficulty / 2.5), 7);

    let sequence: (number | string)[];
    if (variant === 'colors') sequence = Array.from({ length: len }, () => pick(SHAPE_COLORS));
    else if (variant === 'shapes') sequence = Array.from({ length: len }, () => pick(SHAPE_NAMES));
    else sequence = Array.from({ length: len }, () => rand(1, 9));

    const showDuration = Math.max(2.5, 8 - difficulty * 0.5);
    const inputDuration = Math.max(5, 12 - difficulty * 0.5);

    return {
        id: uid(), category: 'memory', instruction: `Memorize the sequence!`, difficulty,
        timeLimit: showDuration, basePoints: 150 + difficulty * 30,
        data: { type: 'memory', variant, sequence, showDuration: showDuration * 1000, inputDuration: inputDuration * 1000 } as MemoryPuzzleData,
    };
}

// ---- REACTION PUZZLES ----
function generateReactionPuzzle(difficulty: number): PuzzleDefinition {
    const variants: ReactionPuzzleData['variant'][] = ['click', 'moving', 'sequence', 'decoy', 'double', 'jitter', 'burst'];
    const variant = pick(variants);
    const count = Math.min(1 + Math.floor(difficulty / 3), 5);
    const targetCount = variant === 'sequence' ? Math.max(3, count + 1) : variant === 'double' ? 2 : variant === 'burst' ? Math.min(5, count + 2) : count;
    let instruction = `Click the targets!`;
    if (variant === 'sequence') instruction = `Click in order: 1→${targetCount}`;
    if (variant === 'decoy') instruction = `Click green — avoid RED!`;
    if (variant === 'double') instruction = `Double-click!`;
    if (variant === 'jitter') instruction = `Catch the jittery ones!`;
    if (variant === 'burst') instruction = `Clear all ${targetCount} fast!`;
    return {
        id: uid(), category: 'reaction', instruction, difficulty,
        timeLimit: Math.max(3, 8 - difficulty * 0.4), basePoints: 80 + difficulty * 15,
        data: { type: 'reaction', variant, targetCount, decoys: variant === 'decoy' ? rand(2, 4) : undefined } as ReactionPuzzleData,
    };
}

// ---- FLING PUZZLES ----
function generateFlingPuzzle(difficulty: number): PuzzleDefinition {
    const cardinalDirs: FlingDirection[] = ['left', 'right', 'top', 'bottom'];
    const diagonalDirs: FlingDirection[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    const dirs = difficulty < 4 ? cardinalDirs : [...cardinalDirs, ...diagonalDirs];
    const dir = pick(dirs);
    const instructions: Record<FlingDirection, string> = {
        left: 'Fling LEFT ←', right: 'Fling RIGHT →', top: 'Swipe UP ↑', bottom: 'Swipe DOWN ↓',
        'top-left': 'Fling ↖', 'top-right': 'Fling ↗', 'bottom-left': 'Fling ↙', 'bottom-right': 'Fling ↘',
    };
    return {
        id: uid(), category: 'fling', instruction: instructions[dir], difficulty,
        timeLimit: Math.max(3, 5 - difficulty * 0.2), basePoints: 90 + difficulty * 12,
        data: { type: 'minigame', variant: 'fling_direction', targetDirection: dir } as MinigamePuzzleData,
    };
}

// ---- MINIGAME PUZZLES ----
function generateMinigamePuzzle(difficulty: number): PuzzleDefinition {
    const variants: MinigamePuzzleData['variant'][] = ['click_when_go', 'whack', 'pick_biggest', 'pick_odd', 'double_tap', 'dont_click', 'countdown', 'tap_fast'];
    const variant = pick(variants);
    let instruction = '';
    let data: MinigamePuzzleData = { type: 'minigame', variant };
    switch (variant) {
        case 'click_when_go': instruction = 'Wait for GO — then tap!'; break;
        case 'whack': instruction = 'Whack the mole 3×!'; break;
        case 'pick_biggest': {
            instruction = 'Tap the biggest!';
            const count = 4, answerIndex = rand(0, count - 1);
            const shapes: ShapeInfo[] = Array.from({ length: count }, (_, i) => ({
                shape: pick(SHAPE_TYPES), color: pick(SHAPE_COLORS), size: i === answerIndex ? 46 : 22 + rand(-2, 2),
            }));
            data = { ...data, shapes, answerIndex };
            break;
        }
        case 'pick_odd': {
            instruction = 'Tap the different one!';
            const ms = pick(SHAPE_TYPES), os = pick(SHAPE_TYPES.filter(s => s !== ms));
            const count = 4, answerIndex = rand(0, count - 1);
            const shapes: ShapeInfo[] = Array.from({ length: count }, (_, i) => ({
                shape: i === answerIndex ? os : ms, color: pick(SHAPE_COLORS), size: 28,
            }));
            data = { ...data, shapes, answerIndex };
            break;
        }
        case 'double_tap': instruction = 'Double-tap the target!'; break;
        case 'dont_click': instruction = "Hold off... wait for CLICK!"; break;
        case 'countdown': instruction = 'Tap on ZERO!'; break;
        case 'tap_fast': instruction = 'Tap 5× fast!'; break;
    }
    return {
        id: uid(), category: 'minigame', instruction, difficulty,
        timeLimit: Math.max(2.5, 4 - difficulty * 0.15), basePoints: 90 + difficulty * 12, data,
    };
}

// ---- META PUZZLES ----
function generateMetaPuzzle(difficulty: number, state: GameState): PuzzleDefinition {
    const variants: MetaPuzzleData['variant'][] = ['gameTime', 'lives', 'intensity', 'combo', 'maxCombo', 'activeCount', 'realTimeHour', 'score'];
    const variant = pick(variants);
    const now = Date.now();
    let answer = 0, instruction = '';
    let options: number[] = [];

    switch (variant) {
        case 'gameTime':
            answer = Math.floor((now - state.startTime) / 1000); instruction = 'Seconds played?';
            options = ensureUniqueOptions([answer + rand(5, 15), Math.max(0, answer - rand(5, 15)), answer + rand(20, 40)], answer, 4, () => Math.max(0, answer + rand(-20, 60)));
            break;
        case 'lives':
            answer = Math.max(0, state.missThreshold - state.puzzlesMissed); instruction = 'Lives remaining?';
            options = ensureUniqueOptions([answer + 1, Math.max(0, answer - 1), answer + 2], answer, 4, () => Math.max(0, answer + rand(1, 5)));
            break;
        case 'intensity':
            answer = Math.round(state.difficulty); instruction = 'Current intensity level?';
            options = ensureUniqueOptions([Math.min(10, answer + 1), Math.max(1, answer - 1), Math.min(10, answer + 2)], answer, 4, () => Math.min(10, Math.max(1, answer + rand(-3, 3))));
            break;
        case 'combo':
            answer = state.combo; instruction = 'Current combo?';
            options = ensureUniqueOptions([answer + 1, Math.max(0, answer - 1), answer + rand(2, 5)], answer, 4, () => Math.max(0, answer + rand(2, 12)));
            break;
        case 'maxCombo':
            answer = state.maxCombo; instruction = 'Best combo this run?';
            options = ensureUniqueOptions([answer + 1, Math.max(0, answer - 1), answer + rand(2, 5)], answer, 4, () => Math.max(0, answer + rand(2, 12)));
            break;
        case 'score': {
            answer = state.score; instruction = 'Closest to your score?';
            const delta = Math.max(100, Math.floor(state.score * 0.1));
            options = ensureUniqueOptions([answer + delta, Math.max(0, answer - delta), answer + delta * 2], answer, 4, () => Math.max(0, answer + rand(-2, 4) * delta));
            break;
        }
        case 'activeCount':
            answer = state.activePuzzles.filter(p => !p.solved && !p.expired).length; instruction = 'Puzzles on screen?';
            options = ensureUniqueOptions([answer + 1, Math.max(0, answer - 1), answer + 2], answer, 4, () => Math.max(0, answer + rand(1, 5)));
            break;
        case 'realTimeHour': {
            const h12 = (new Date().getHours() % 12) || 12;
            answer = h12; instruction = 'Current hour (1-12)?';
            const cands = [1,2,3,4,5,6,7,8,9,10,11,12].filter(h => h !== h12);
            options = ensureUniqueOptions(cands.slice(0, 3), h12, 4, () => cands[rand(0, cands.length - 1)] ?? 1);
            break;
        }
    }

    return {
        id: uid(), category: 'meta', instruction, difficulty,
        timeLimit: Math.max(5, 10 - difficulty * 0.3), basePoints: 130 + difficulty * 25,
        data: { type: 'meta', variant, answer, options } as MetaPuzzleData,
    };
}

// ---- POWER-UP PUZZLES ----
function generatePowerUpPuzzle(difficulty: number): PuzzleDefinition {
    const variant = pick(['timeDilation', 'purge', 'secondChance'] as const);
    const actionType = pick(['slider', 'spam', 'hold'] as const);
    let instruction = '', effectDesc = '';
    if (variant === 'timeDilation') effectDesc = 'Timers slow 50% for 6s!';
    if (variant === 'purge') effectDesc = 'Clears oldest puzzles!';
    if (variant === 'secondChance') effectDesc = 'Restores 2 lives!';
    if (actionType === 'slider') instruction = 'Drag to 100%!';
    if (actionType === 'spam') instruction = 'Spam click 10×!';
    if (actionType === 'hold') instruction = 'Hold for 1.5s!';
    return {
        id: uid(), category: 'powerup', instruction, difficulty,
        timeLimit: Math.max(5, 10 - difficulty * 0.3), basePoints: 50, isPriority: true,
        data: { type: 'powerup', variant, actionType, targetValue: actionType === 'spam' ? 10 : 100, effectDescription: effectDesc } as PowerUpPuzzleData,
    };
}

// ---- LOGIC PUZZLES (NEW) ----
// ---- EMOJI PUZZLES ----
const EMOJI_GROUPS: { category: string; emojis: string[] }[] = [
    { category: 'Fruit', emojis: ['🍎', '🍊', '🍋', '🍇', '🍓', '🍌', '🍑', '🍒', '🥝', '🍍'] },
    { category: 'Animal', emojis: ['🐶', '🐱', '🐻', '🐼', '🐸', '🐵', '🐰', '🦊', '🐷', '🐮'] },
    { category: 'Weather', emojis: ['☀️', '🌧️', '⛈️', '🌈', '❄️', '🌪️', '⭐', '🌙'] },
    { category: 'Sport', emojis: ['⚽', '🏀', '🎾', '🏈', '⚾', '🎱', '🏐', '🏓'] },
    { category: 'Food', emojis: ['🍕', '🍔', '🌮', '🍣', '🍩', '🎂', '🍦', '🧁'] },
    { category: 'Vehicle', emojis: ['🚗', '🚌', '🚀', '✈️', '🚁', '🛸', '🚂', '⛵'] },
    { category: 'Face', emojis: ['😀', '😂', '😍', '😎', '🤔', '😱', '🥳', '😴'] },
];

function generateEmojiPuzzle(difficulty: number): PuzzleDefinition {
    const variants: EmojiPuzzleData['variant'][] = ['odd_one_out', 'count', 'match'];
    if (difficulty >= 3) variants.push('sequence');
    const variant = pick(variants);

    let prompt = '', answer = '', instruction = '';
    let options: string[] = [];

    if (variant === 'odd_one_out') {
        const group = pick(EMOJI_GROUPS);
        const mainEmoji = pick(group.emojis);
        const otherGroup = pick(EMOJI_GROUPS.filter(g => g.category !== group.category));
        const oddEmoji = pick(otherGroup.emojis);
        const count = rand(3, 5);
        const arr = Array(count).fill(mainEmoji);
        const oddPos = rand(0, count);
        arr.splice(oddPos, 0, oddEmoji);
        prompt = arr.join(' ');
        instruction = 'Which doesn\'t belong?';
        answer = oddEmoji;
        options = ensureUniqueOptions(
            [mainEmoji, pick(otherGroup.emojis.filter(e => e !== oddEmoji)), pick(EMOJI_GROUPS[rand(0, EMOJI_GROUPS.length - 1)].emojis)],
            answer, 4, () => pick(EMOJI_GROUPS[rand(0, EMOJI_GROUPS.length - 1)].emojis)
        );
    } else if (variant === 'count') {
        const group = pick(EMOJI_GROUPS);
        const targetEmoji = pick(group.emojis);
        const otherEmoji = pick(group.emojis.filter(e => e !== targetEmoji));
        const targetCount = rand(2, 5 + Math.floor(difficulty / 2));
        const otherCount = rand(1, 4);
        const arr = [...Array(targetCount).fill(targetEmoji), ...Array(otherCount).fill(otherEmoji)];
        prompt = shuffle(arr).join(' ');
        instruction = `How many ${targetEmoji}?`;
        answer = String(targetCount);
        options = ensureUniqueOptions(
            [String(targetCount - 1), String(targetCount + 1), String(otherCount)].filter(o => o !== answer),
            answer, 4, () => String(rand(1, 8))
        );
    } else if (variant === 'match') {
        const group = pick(EMOJI_GROUPS);
        const emoji = pick(group.emojis);
        prompt = emoji;
        instruction = 'What category?';
        answer = group.category;
        options = ensureUniqueOptions(
            shuffle(EMOJI_GROUPS.filter(g => g.category !== group.category).map(g => g.category)).slice(0, 3),
            answer, 4, () => pick(EMOJI_GROUPS.filter(g => g.category !== group.category)).category
        );
    } else {
        // sequence — what comes next in the repeating pattern
        const group = pick(EMOJI_GROUPS);
        const e1 = pick(group.emojis);
        const e2 = pick(group.emojis.filter(e => e !== e1));
        const pattern = [e1, e2, e1, e2, e1];
        prompt = pattern.join(' ') + ' ❓';
        instruction = 'What comes next?';
        answer = e2;
        options = ensureUniqueOptions(
            [e1, pick(group.emojis.filter(e => e !== e1 && e !== e2))],
            answer, 4, () => pick(EMOJI_GROUPS[rand(0, EMOJI_GROUPS.length - 1)].emojis)
        );
    }

    return {
        id: uid(), category: 'emoji', instruction, difficulty,
        timeLimit: Math.max(4, 10 - difficulty * 0.4), basePoints: 100 + difficulty * 16,
        data: { type: 'emoji', variant, prompt, answer, options } as EmojiPuzzleData,
    };
}

// ---- TRIVIA PUZZLES ----
const TRIVIA_POOL: { q: string; a: string; wrong: string[] }[] = [
    { q: 'How many legs does a spider have?', a: '8', wrong: ['6', '10', '4'] },
    { q: 'What planet is closest to the Sun?', a: 'Mercury', wrong: ['Venus', 'Mars', 'Earth'] },
    { q: 'How many continents are there?', a: '7', wrong: ['5', '6', '8'] },
    { q: 'What is the largest ocean?', a: 'Pacific', wrong: ['Atlantic', 'Indian', 'Arctic'] },
    { q: 'Which animal is the tallest?', a: 'Giraffe', wrong: ['Elephant', 'Horse', 'Ostrich'] },
    { q: 'How many days in a leap year?', a: '366', wrong: ['365', '364', '367'] },
    { q: 'What gas do plants breathe in?', a: 'CO2', wrong: ['Oxygen', 'Nitrogen', 'Helium'] },
    { q: 'Which fruit is yellow and curved?', a: 'Banana', wrong: ['Lemon', 'Mango', 'Pear'] },
    { q: 'How many sides does a hexagon have?', a: '6', wrong: ['5', '7', '8'] },
    { q: 'What is frozen water called?', a: 'Ice', wrong: ['Snow', 'Frost', 'Sleet'] },
    { q: 'Which planet has rings?', a: 'Saturn', wrong: ['Jupiter', 'Mars', 'Neptune'] },
    { q: 'How many letters in the English alphabet?', a: '26', wrong: ['24', '28', '25'] },
    { q: 'What is the fastest land animal?', a: 'Cheetah', wrong: ['Lion', 'Horse', 'Gazelle'] },
    { q: 'How many colors in a rainbow?', a: '7', wrong: ['5', '6', '8'] },
    { q: 'What is the biggest animal ever?', a: 'Blue whale', wrong: ['Elephant', 'Giraffe', 'T-Rex'] },
    { q: 'Which metal is attracted to magnets?', a: 'Iron', wrong: ['Gold', 'Silver', 'Copper'] },
    { q: 'How many hours in a day?', a: '24', wrong: ['12', '36', '48'] },
    { q: 'Where is the Eiffel Tower?', a: 'Paris', wrong: ['London', 'Rome', 'Berlin'] },
    { q: 'What do bees make?', a: 'Honey', wrong: ['Wax', 'Silk', 'Milk'] },
    { q: 'Which season comes after winter?', a: 'Spring', wrong: ['Summer', 'Fall', 'Winter'] },
    { q: 'How many wings does a butterfly have?', a: '4', wrong: ['2', '6', '8'] },
    { q: 'What is the hardest natural substance?', a: 'Diamond', wrong: ['Steel', 'Granite', 'Quartz'] },
    { q: 'Which organ pumps blood?', a: 'Heart', wrong: ['Lungs', 'Brain', 'Liver'] },
    { q: 'How many bones in the human body?', a: '206', wrong: ['186', '226', '306'] },
    { q: 'What is baby cat called?', a: 'Kitten', wrong: ['Puppy', 'Cub', 'Foal'] },
    { q: 'Which country has the most people?', a: 'India', wrong: ['China', 'USA', 'Brazil'] },
    { q: 'How many teeth does an adult have?', a: '32', wrong: ['28', '30', '36'] },
    { q: 'What is the speed of light?', a: '300,000 km/s', wrong: ['150,000 km/s', '1M km/s', '30,000 km/s'] },
    { q: 'Which bird can not fly?', a: 'Penguin', wrong: ['Eagle', 'Parrot', 'Crow'] },
    { q: 'What is the chemical symbol for water?', a: 'H2O', wrong: ['CO2', 'NaCl', 'O2'] },
    { q: 'Which planet is the Red Planet?', a: 'Mars', wrong: ['Venus', 'Jupiter', 'Mercury'] },
    { q: 'How many minutes in an hour?', a: '60', wrong: ['30', '100', '90'] },
    { q: 'What is the capital of Japan?', a: 'Tokyo', wrong: ['Kyoto', 'Osaka', 'Seoul'] },
    { q: 'How many players on a soccer team?', a: '11', wrong: ['9', '10', '12'] },
    { q: 'Which fruit has its seeds on the outside?', a: 'Strawberry', wrong: ['Raspberry', 'Kiwi', 'Cherry'] },
    { q: 'What is the largest desert on Earth?', a: 'Antarctica', wrong: ['Sahara', 'Arabian', 'Gobi'] },
    { q: 'How many strings on a standard guitar?', a: '6', wrong: ['4', '5', '8'] },
    { q: 'What gas do we breathe?', a: 'Oxygen', wrong: ['Nitrogen', 'Hydrogen', 'CO2'] },
    { q: 'Which animal has the longest neck?', a: 'Giraffe', wrong: ['Swan', 'Flamingo', 'Camel'] },
    { q: 'What year did the Titanic sink?', a: '1912', wrong: ['1905', '1920', '1898'] },
    { q: 'How many chambers in a human heart?', a: '4', wrong: ['2', '3', '6'] },
    { q: 'Which is the smallest continent?', a: 'Australia', wrong: ['Europe', 'Antarctica', 'S. America'] },
    { q: 'What is the largest country by area?', a: 'Russia', wrong: ['Canada', 'China', 'USA'] },
    { q: 'How many zeros in one million?', a: '6', wrong: ['5', '7', '9'] },
    { q: 'What color is an emerald?', a: 'Green', wrong: ['Blue', 'Red', 'Yellow'] },
    { q: 'Which animal is known as King of the Jungle?', a: 'Lion', wrong: ['Tiger', 'Gorilla', 'Elephant'] },
    { q: 'How many weeks in a year?', a: '52', wrong: ['48', '50', '54'] },
    { q: 'What is the boiling point of water (C)?', a: '100', wrong: ['90', '110', '212'] },
    { q: 'Which planet is known for the Great Red Spot?', a: 'Jupiter', wrong: ['Mars', 'Saturn', 'Neptune'] },
    { q: 'How many dots on a pair of dice?', a: '42', wrong: ['36', '21', '48'] },
];

function generateTriviaPuzzle(difficulty: number): PuzzleDefinition {
    const item = pick(TRIVIA_POOL);
    const options = shuffle([item.a, ...item.wrong]);
    return {
        id: uid(), category: 'trivia', instruction: item.q, difficulty,
        timeLimit: Math.max(5, 12 - difficulty * 0.5), basePoints: 100 + difficulty * 15,
        data: { type: 'trivia', question: item.q, answer: item.a, options } as TriviaPuzzleData,
    };
}

// ---- ROMAN NUMERAL PUZZLES (NEW) ----
const ROMAN_VALS: [number, string][] = [
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

function toRoman(n: number): string {
    let result = '';
    for (const [value, numeral] of ROMAN_VALS) {
        while (n >= value) { result += numeral; n -= value; }
    }
    return result;
}

function generateRomanPuzzle(difficulty: number): PuzzleDefinition {
    const maxVal = difficulty < 3 ? 15 : difficulty < 5 ? 30 : difficulty < 7 ? 50 : 100;
    const decimal = rand(1, maxVal);
    const roman = toRoman(decimal);
    const toDecimalV = Math.random() > 0.45;
    let answer = '', instruction = '';
    let options: string[] = [];

    if (toDecimalV) {
        answer = decimal.toString(); instruction = `Roman → Arabic:`;
        options = ensureUniqueOptions([rand(1, maxVal).toString(), rand(1, maxVal).toString(), rand(1, maxVal).toString()], answer, 4, () => rand(1, maxVal).toString());
    } else {
        answer = roman; instruction = `Arabic → Roman:`;
        const gw = () => toRoman(rand(1, maxVal));
        options = ensureUniqueOptions([gw(), gw(), gw()], answer, 4, gw);
    }

    return {
        id: uid(), category: 'roman', instruction, difficulty,
        timeLimit: Math.max(4, 11 - difficulty * 0.5), basePoints: 115 + difficulty * 18,
        data: { type: 'roman', variant: toDecimalV ? 'to_decimal' : 'to_roman', roman, decimal, answer, options } as RomanPuzzleData,
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
    emoji: generateEmojiPuzzle,
    trivia: generateTriviaPuzzle,
    roman: generateRomanPuzzle,
};

const CATEGORY_UNLOCK_ORDER: PuzzleCategory[] = [
    'math', 'pattern', 'language', 'roman', 'spatial', 'reaction',
    'trivia', 'memory', 'emoji', 'minigame', 'fling', 'meta', 'powerup',
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

    let categories = getAvailableCategories(difficulty);
    if (!gameState) categories = categories.filter(c => c !== 'meta');
    if (activeCategories.includes('memory')) categories = categories.filter(c => c !== 'memory');
    if (activeCategories.includes('powerup')) categories = categories.filter(c => c !== 'powerup');
    if (categories.length === 0) categories = getAvailableCategories(difficulty).filter(c => c !== 'meta' || gameState);

    const category = pick(categories);
    const d = Math.min(10, Math.max(1, Math.round(difficulty)));
    if (category === 'meta' && gameState) return generateMetaPuzzle(d, gameState);
    return generators[category](d);
}

export function resetPuzzleCounter(): void {
    puzzleIdCounter = 0;
}
