import { describe, it, expect } from 'vitest';
import {
    validateAndNormalize,
    fallbackPuzzle,
    parseJson,
    buildPrompt,
    isAIPuzzleMode,
    AI_PUZZLE_MODES,
    type DailyPuzzleMode,
} from '../generate-core';
import type { SpectrumPuzzle } from '../spectrum';
import type { AlibiPuzzle } from '../alibi';
import type { OutcastPuzzle } from '../outcast';
import type { ImpostorPuzzle } from '../impostor';
import type { ChainlinkPuzzle } from '../chainlink';

const DATE_KEY = '2026-07-21';

describe('mode guard', () => {
    it('accepts the five AI puzzle modes and rejects others', () => {
        expect(AI_PUZZLE_MODES).toEqual(['alibi', 'spectrum', 'outcast', 'chainlink', 'impostor']);
        for (const m of AI_PUZZLE_MODES) expect(isAIPuzzleMode(m)).toBe(true);
        expect(isAIPuzzleMode('lights-out')).toBe(false);
        expect(isAIPuzzleMode('nope')).toBe(false);
    });

    it('builds a prompt for every mode', () => {
        for (const mode of AI_PUZZLE_MODES) {
            const { system, user } = buildPrompt(mode, DATE_KEY, 42);
            expect(system.length).toBeGreaterThan(20);
            expect(user).toContain(DATE_KEY);
        }
    });
});

describe('parseJson', () => {
    it('parses plain JSON', () => {
        expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    });
    it('strips a ```json fence', () => {
        expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    });
    it('recovers the outermost object from surrounding prose', () => {
        expect(parseJson('Sure! {"a":1} hope that helps')).toEqual({ a: 1 });
    });
    it('returns null for garbage', () => {
        expect(parseJson('not json at all')).toBeNull();
        expect(parseJson('')).toBeNull();
    });
});

describe('spectrum validation', () => {
    const valid = {
        label: 'Calories per serving: lowest → highest',
        category: 'food',
        funFact: 'A slice of cheesecake has more calories than a Big Mac.',
        items: [
            { name: 'Cucumber', emoji: '🥒', value: 16, displayValue: '16 cal' },
            { name: 'Banana', emoji: '🍌', value: 105, displayValue: '105 cal' },
            { name: 'Bagel', emoji: '🥯', value: 245, displayValue: '245 cal' },
            { name: 'Big Mac', emoji: '🍔', value: 550, displayValue: '550 cal' },
            { name: 'Cheesecake', emoji: '🍰', value: 710, displayValue: '710 cal' },
        ],
    };

    it('normalizes a valid puzzle into the client shape', () => {
        const p = validateAndNormalize('spectrum', valid, DATE_KEY) as SpectrumPuzzle | null;
        expect(p).not.toBeNull();
        expect(p!.items).toHaveLength(5);
        expect(p!._solution).toHaveLength(5);
        expect(p!._solution.map((s) => s.trueRank)).toEqual([1, 2, 3, 4, 5]);
        expect(p!._funFact).toBe(valid.funFact);
        // Public items never leak the rank/value.
        expect(Object.keys(p!.items[0]).sort()).toEqual(['emoji', 'name']);
    });

    it('rejects non-monotonic values (ambiguous ordering)', () => {
        const bad = { ...valid, items: valid.items.map((it, i) => ({ ...it, value: i === 2 ? 5 : it.value })) };
        expect(validateAndNormalize('spectrum', bad, DATE_KEY)).toBeNull();
    });

    it('rejects the wrong number of items', () => {
        expect(validateAndNormalize('spectrum', { ...valid, items: valid.items.slice(0, 4) }, DATE_KEY)).toBeNull();
    });
});

describe('alibi validation', () => {
    const valid = {
        scenario: 'A painting was stolen at 9 PM during a storm that had raged since noon.',
        difficulty: 'simple',
        suspects: [
            { name: 'Marcus Cole', emoji: '👨‍💼', alibi: 'I was at a dinner party.' },
            { name: 'Elena Voss', emoji: '👩‍🎨', alibi: 'I was painting at home all evening.' },
            { name: 'Derek Huang', emoji: '🧑‍🔧', alibi: 'I was outside; the stars were beautiful on that clear night.' },
            { name: 'Sofia Reyes', emoji: '👩‍⚕️', alibi: 'I was on a hospital night shift.' },
        ],
        guiltyName: 'Derek Huang',
        contradiction: {
            explanation: 'Derek claims a clear night, but a storm had raged since noon.',
            highlights: [
                { text: 'storm that had raged since noon', source: 'scenario' },
                { text: 'stars were beautiful on that clear night', source: 'suspect', suspectName: 'Derek Huang' },
            ],
        },
    };

    it('normalizes a valid puzzle', () => {
        const p = validateAndNormalize('alibi', valid, DATE_KEY) as AlibiPuzzle | null;
        expect(p).not.toBeNull();
        expect(p!.suspects).toHaveLength(4);
        expect(p!._solution!.guiltyName).toBe('Derek Huang');
        // Suspects never carry a guilt flag.
        expect(p!.suspects.every((s) => !('isGuilty' in s))).toBe(true);
    });

    it('rejects a guiltyName that is not a suspect', () => {
        expect(validateAndNormalize('alibi', { ...valid, guiltyName: 'Nobody' }, DATE_KEY)).toBeNull();
    });

    it('rejects when no highlight implicates the guilty suspect', () => {
        const bad = {
            ...valid,
            contradiction: {
                ...valid.contradiction,
                highlights: [{ text: 'storm that had raged since noon', source: 'scenario' }],
            },
        };
        expect(validateAndNormalize('alibi', bad, DATE_KEY)).toBeNull();
    });
});

describe('outcast validation', () => {
    const round = (n: number, outcast = `A${n}`) => ({
        items: [
            { name: `A${n}`, emoji: '🅰️' },
            { name: `B${n}`, emoji: '🅱️' },
            { name: `C${n}`, emoji: '©️' },
            { name: `D${n}`, emoji: '🇩' },
            { name: `E${n}`, emoji: '🇪' },
        ],
        outcastName: outcast,
        trait: 'They share a real trait',
        redHerring: 'A surface similarity all five share',
    });
    const valid = { rounds: [round(1), round(2), round(3), round(4), round(5)] };

    it('normalizes into five ordered rounds', () => {
        const p = validateAndNormalize('outcast', valid, DATE_KEY) as OutcastPuzzle | null;
        expect(p).not.toBeNull();
        expect(p!.rounds).toHaveLength(5);
        expect(p!.rounds.map((r) => r.difficulty)).toEqual(['easy', 'medium', 'hard', 'expert', 'nightmare']);
        for (const r of p!.rounds) {
            expect(r.items).toHaveLength(5);
            expect(r.items.map((i) => i.name)).toContain(r._solution.outcastName);
        }
    });

    it('rejects when a round outcast is not among its items', () => {
        const bad = { rounds: [round(1, 'ghost'), round(2), round(3), round(4), round(5)] };
        expect(validateAndNormalize('outcast', bad, DATE_KEY)).toBeNull();
    });

    it('rejects the wrong number of rounds', () => {
        expect(validateAndNormalize('outcast', { rounds: [round(1), round(2)] }, DATE_KEY)).toBeNull();
    });
});

describe('impostor validation', () => {
    const valid = {
        topic: 'Octopuses',
        topicEmoji: '🐙',
        category: 'science',
        statements: [
            { text: 'Octopuses have three hearts.', isFake: false, explanation: 'True.' },
            { text: 'Their blood is blue.', isFake: false, explanation: 'True.' },
            { text: 'Each arm has its own neurons.', isFake: false, explanation: 'True.' },
            { text: 'They live in cooperative family groups.', isFake: true, explanation: 'False — mostly solitary.' },
            { text: 'Every species is deadly to humans.', isFake: true, explanation: 'False — only the blue-ringed.' },
        ],
    };

    it('normalizes a valid puzzle and hides the answers from the public statements', () => {
        const p = validateAndNormalize('impostor', valid, DATE_KEY) as ImpostorPuzzle | null;
        expect(p).not.toBeNull();
        expect(p!.statements).toHaveLength(5);
        expect(p!._solution.filter((s) => s.isFake)).toHaveLength(2);
        expect(p!.statements.every((s) => !('isFake' in s))).toBe(true);
    });

    it('rejects when there are not exactly two fakes', () => {
        const threeFakes = {
            ...valid,
            statements: valid.statements.map((s, i) => ({ ...s, isFake: i >= 2 })),
        };
        expect(validateAndNormalize('impostor', threeFakes, DATE_KEY)).toBeNull();
    });
});

describe('chainlink validation', () => {
    // SUN→light→house→work→room: sunlight, lighthouse, housework, workroom.
    const valid = {
        startWord: 'SUN',
        endWord: 'ROOM',
        exampleChain: ['SUN', 'light', 'house', 'work', 'room'],
        connectionExplanations: ['sunlight', 'lighthouse', 'housework', 'workroom'],
    };

    it('accepts a chain made entirely of valid associations', () => {
        const p = validateAndNormalize('chainlink', valid, DATE_KEY) as ChainlinkPuzzle | null;
        expect(p).not.toBeNull();
        expect(p!.startWord).toBe('SUN');
        expect(p!.endWord).toBe('ROOM');
        expect(p!.parLinks).toBe(4);
        expect(p!.difficulty).toBe('short');
        expect(p!._exampleChain[0]).toBe('SUN');
        expect(p!._exampleChain[p!._exampleChain.length - 1]).toBe('ROOM');
    });

    it('rejects an anchor that is not in the association vocabulary', () => {
        const bad = { ...valid, startWord: 'ZZZQQ', exampleChain: ['ZZZQQ', 'light', 'house', 'work', 'room'] };
        expect(validateAndNormalize('chainlink', bad, DATE_KEY)).toBeNull();
    });

    it('rejects a chain with a broken link', () => {
        const bad = {
            ...valid,
            exampleChain: ['SUN', 'zzz', 'house', 'work', 'room'],
        };
        expect(validateAndNormalize('chainlink', bad, DATE_KEY)).toBeNull();
    });
});

describe('deterministic fallback', () => {
    const date = new Date(2026, 6, 21);

    it('produces a valid, well-shaped puzzle for every mode', () => {
        for (const mode of AI_PUZZLE_MODES as DailyPuzzleMode[]) {
            const p = fallbackPuzzle(mode, date) as unknown as Record<string, unknown>;
            expect(p).toBeTruthy();
            switch (mode) {
                case 'spectrum':
                    expect((p as unknown as SpectrumPuzzle).items).toHaveLength(5);
                    expect((p as unknown as SpectrumPuzzle)._solution).toHaveLength(5);
                    break;
                case 'alibi':
                    expect((p as unknown as AlibiPuzzle).suspects).toHaveLength(4);
                    expect((p as unknown as AlibiPuzzle)._solution!.guiltyName).toBeTruthy();
                    break;
                case 'outcast':
                    expect((p as unknown as OutcastPuzzle).rounds).toHaveLength(5);
                    break;
                case 'impostor':
                    expect((p as unknown as ImpostorPuzzle).statements).toHaveLength(5);
                    expect((p as unknown as ImpostorPuzzle)._solution.filter((s) => s.isFake)).toHaveLength(2);
                    break;
                case 'chainlink':
                    expect((p as unknown as ChainlinkPuzzle)._exampleChain.length).toBeGreaterThanOrEqual(5);
                    break;
            }
        }
    });

    it('is deterministic for a given date', () => {
        const a = JSON.stringify(fallbackPuzzle('impostor', date));
        const b = JSON.stringify(fallbackPuzzle('impostor', date));
        expect(a).toBe(b);
    });
});
