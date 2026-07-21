/**
 * Pure (no DB, no network) core for Daily Puzzle generation:
 * per-mode DeepSeek prompts, strict validators that turn a raw model response
 * into the exact client puzzle shape, and the deterministic fallback puzzles.
 *
 * This module is intentionally free of Prisma / the OpenAI SDK so it can be unit
 * tested directly. `generate.server.ts` wires it up to DeepSeek and the cache.
 */

import { z } from 'zod';
import { createSeededRng, getDateSeed, seededShuffle } from './seed';
import { generateSpectrumPuzzle, type SpectrumPuzzle, type SpectrumItem } from './spectrum';
import { generateAlibiPuzzle, type AlibiPuzzle } from './alibi';
import { generateOutcastPuzzle, type OutcastPuzzle } from './outcast';
import {
    generateChainlinkPuzzle,
    isValidAssociation,
    isAssociationKey,
    associationVocabulary,
    type ChainlinkPuzzle,
} from './chainlink';
import { generateImpostorPuzzle, type ImpostorPuzzle, type ImpostorStatement } from './impostor';

export type DailyPuzzleMode = 'alibi' | 'spectrum' | 'outcast' | 'chainlink' | 'impostor';

export const AI_PUZZLE_MODES: DailyPuzzleMode[] = [
    'alibi',
    'spectrum',
    'outcast',
    'chainlink',
    'impostor',
];

export function isAIPuzzleMode(mode: string): mode is DailyPuzzleMode {
    return (AI_PUZZLE_MODES as string[]).includes(mode);
}

export type AnyPuzzle =
    | SpectrumPuzzle
    | AlibiPuzzle
    | OutcastPuzzle
    | ChainlinkPuzzle
    | ImpostorPuzzle;

/** Tokens to allow per mode (Outcast is the largest — 5 rounds). */
export const MAX_TOKENS: Record<DailyPuzzleMode, number> = {
    spectrum: 900,
    alibi: 1100,
    outcast: 1400,
    impostor: 1000,
    chainlink: 700,
};

// ─────────────────────────────────────────────────────────────────────────────
//  Small helpers
// ─────────────────────────────────────────────────────────────────────────────

export function parseDateKey(dateKey: string): Date {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y, m - 1, d);
}

export function parseJson(raw: string): unknown {
    if (!raw) return null;
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
        return JSON.parse(cleaned);
    } catch {
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start !== -1 && end > start) {
            try {
                return JSON.parse(cleaned.slice(start, end + 1));
            } catch {
                /* ignore */
            }
        }
        return null;
    }
}

/** A stable per-mode rng for cosmetic shuffling of a generated puzzle. */
function shuffleRng(dateKey: string, salt: number): () => number {
    return createSeededRng(getDateSeed(parseDateKey(dateKey)) * 100 + salt);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Shared field schemas
// ─────────────────────────────────────────────────────────────────────────────

const emoji = z.string().trim().min(1).max(16);
const shortText = z.string().trim().min(1).max(200);
const longText = z.string().trim().min(1).max(1200);

// ─────────────────────────────────────────────────────────────────────────────
//  SPECTRUM
// ─────────────────────────────────────────────────────────────────────────────

const spectrumRaw = z.object({
    label: shortText,
    category: shortText,
    funFact: longText,
    items: z
        .array(
            z.object({
                name: shortText,
                emoji,
                value: z.number(),
                displayValue: shortText,
            }),
        )
        .length(5),
});

function normalizeSpectrum(raw: unknown, dateKey: string): SpectrumPuzzle | null {
    const parsed = spectrumRaw.safeParse(raw);
    if (!parsed.success) return null;
    const { label, category, funFact, items } = parsed.data;

    if (new Set(items.map((i) => i.name.toLowerCase())).size !== 5) return null;

    // The ordering must be unambiguous: values strictly monotonic (either
    // direction). The provided order IS the rank order (1 = first item).
    const values = items.map((i) => i.value);
    const strictlyUp = values.every((v, i) => i === 0 || values[i - 1] < v);
    const strictlyDown = values.every((v, i) => i === 0 || values[i - 1] > v);
    if (!strictlyUp && !strictlyDown) return null;

    const solution: SpectrumItem[] = items.map((it, i) => ({
        name: it.name,
        emoji: it.emoji,
        trueRank: i + 1,
        value: it.value,
        displayValue: it.displayValue,
    }));

    const shuffled = seededShuffle(solution, shuffleRng(dateKey, 1));
    return {
        label,
        items: shuffled.map(({ name, emoji: e }) => ({ name, emoji: e })),
        category,
        _solution: solution,
        _funFact: funFact,
    };
}

function spectrumPrompt(dateKey: string, puzzleNumber: number): { system: string; user: string } {
    const categories = [
        'food & drink',
        'geography',
        'science',
        'history',
        'pop culture',
        'sports',
        'technology',
        'economics',
        'nature & animals',
    ];
    const hint = categories[puzzleNumber % categories.length];
    return {
        system:
            'You create one "Spectrum" ranking puzzle. The player is shown 5 items in scrambled order and must rank them along a clearly named numeric scale. ' +
            'Return ONLY a JSON object with this exact shape: ' +
            '{"label": string, "category": string, "funFact": string, "items": [{"name": string, "emoji": string, "value": number, "displayValue": string}]}. ' +
            'Rules: exactly 5 items; provide them already ordered from rank 1 to rank 5 following the label (e.g. "lowest → highest"); ' +
            '"value" is the real numeric quantity used for ordering and MUST be strictly increasing or strictly decreasing across the 5 items (no ties); ' +
            '"displayValue" is a short human-readable version of the value with units (e.g. "550 cal", "$2.33", "828 m"); ' +
            'the label must state the scale and direction; every fact must be real and accurate; "emoji" is a single relevant emoji; ' +
            'the funFact is one surprising true sentence about the ranking. Use approachable, well-known items so the puzzle is intuitive, not obscure.',
        user:
            `Create Spectrum daily puzzle #${puzzleNumber} (date ${dateKey}). ` +
            `Suggested topic area: ${hint} (only a suggestion). Make it clear and satisfying to reason about. Output JSON only.`,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
//  ALIBI
// ─────────────────────────────────────────────────────────────────────────────

const alibiRaw = z.object({
    scenario: longText,
    difficulty: z.enum(['simple', 'tricky', 'devious']),
    suspects: z.array(z.object({ name: shortText, emoji, alibi: longText })).length(4),
    guiltyName: shortText,
    contradiction: z.object({
        explanation: longText,
        highlights: z
            .array(
                z.object({
                    text: shortText,
                    source: z.enum(['scenario', 'suspect']),
                    suspectName: shortText.optional(),
                }),
            )
            .min(2)
            .max(5),
    }),
});

function normalizeAlibi(raw: unknown, dateKey: string): AlibiPuzzle | null {
    const parsed = alibiRaw.safeParse(raw);
    if (!parsed.success) return null;
    const { scenario, difficulty, suspects, guiltyName, contradiction } = parsed.data;

    const names = suspects.map((s) => s.name);
    if (new Set(names.map((n) => n.toLowerCase())).size !== 4) return null;
    if (!names.includes(guiltyName)) return null;

    for (const h of contradiction.highlights) {
        if (h.source === 'suspect') {
            if (!h.suspectName || !names.includes(h.suspectName)) return null;
        }
    }
    // The contradiction must implicate the guilty suspect's own testimony.
    const hasGuiltyHighlight = contradiction.highlights.some(
        (h) => h.source === 'suspect' && h.suspectName === guiltyName,
    );
    if (!hasGuiltyHighlight) return null;

    const shuffled = seededShuffle(
        suspects.map((s) => ({ name: s.name, emoji: s.emoji, alibi: s.alibi })),
        shuffleRng(dateKey, 2),
    );

    return {
        scenario,
        suspects: shuffled,
        difficulty,
        _solution: {
            guiltyName,
            contradiction: {
                explanation: contradiction.explanation,
                highlights: contradiction.highlights.map((h) => ({
                    text: h.text,
                    source: h.source,
                    ...(h.suspectName ? { suspectName: h.suspectName } : {}),
                })),
            },
        },
    };
}

function alibiPrompt(dateKey: string, puzzleNumber: number): { system: string; user: string } {
    const settings = [
        'an art gallery',
        'a tech company office',
        'a restaurant',
        'a museum',
        'a hotel',
        'a university lab',
        'a jewelry store',
        'a concert hall',
        'a private estate',
        'a casino',
    ];
    const hint = settings[puzzleNumber % settings.length];
    return {
        system:
            'You create one "Alibi" logic puzzle. A crime is described, four suspects each give an alibi, and exactly ONE alibi contains a clear factual contradiction with the scenario. ' +
            'Return ONLY a JSON object with this exact shape: ' +
            '{"scenario": string, "difficulty": "simple"|"tricky"|"devious", "suspects": [{"name": string, "emoji": string, "alibi": string}], "guiltyName": string, ' +
            '"contradiction": {"explanation": string, "highlights": [{"text": string, "source": "scenario"|"suspect", "suspectName": string}]}}. ' +
            'Rules: exactly 4 suspects with distinct human names and a person emoji each; the scenario states concrete verifiable facts (times, locks, weather, sensors, access); ' +
            'exactly one suspect (guiltyName, which must match one of the four names) has an alibi that directly contradicts a stated fact; the other three alibis are fully consistent; ' +
            'the explanation names the contradiction in plain language; highlights quote the exact conflicting phrases — "scenario" highlights are verbatim substrings of the scenario, ' +
            'and at least one "suspect" highlight is a verbatim substring of the guilty suspect\'s alibi (set its suspectName to guiltyName). Keep the contradiction fair and unambiguous, not a trick of wording.',
        user:
            `Create Alibi daily puzzle #${puzzleNumber} (date ${dateKey}). ` +
            `Suggested setting: ${hint} (only a suggestion). Make the single contradiction clean and solvable by careful reading. Output JSON only.`,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
//  OUTCAST
// ─────────────────────────────────────────────────────────────────────────────

const OUTCAST_DIFFICULTIES = ['easy', 'medium', 'hard', 'expert', 'nightmare'] as const;

const outcastRaw = z.object({
    rounds: z
        .array(
            z.object({
                items: z.array(z.object({ name: shortText, emoji })).length(5),
                outcastName: shortText,
                trait: shortText,
                redHerring: shortText,
            }),
        )
        .length(5),
});

function normalizeOutcast(raw: unknown, dateKey: string): OutcastPuzzle | null {
    const parsed = outcastRaw.safeParse(raw);
    if (!parsed.success) return null;

    const rounds = parsed.data.rounds.map((r, i) => {
        const names = r.items.map((it) => it.name);
        if (new Set(names.map((n) => n.toLowerCase())).size !== 5) return null;
        if (!names.includes(r.outcastName)) return null;
        return {
            roundNumber: i + 1,
            items: seededShuffle(
                r.items.map((it) => ({ name: it.name, emoji: it.emoji })),
                shuffleRng(dateKey, 3 + i),
            ),
            difficulty: OUTCAST_DIFFICULTIES[i],
            _solution: {
                outcastName: r.outcastName,
                trait: r.trait,
                redHerring: r.redHerring,
            },
        };
    });

    if (rounds.some((r) => r === null)) return null;
    return { rounds: rounds as OutcastPuzzle['rounds'] };
}

function outcastPrompt(dateKey: string, puzzleNumber: number): { system: string; user: string } {
    return {
        system:
            'You create one "Outcast" puzzle: five rounds of increasing difficulty. In each round, five items are shown; four share a specific trait and exactly one does not. ' +
            'Return ONLY a JSON object with this exact shape: ' +
            '{"rounds": [{"items": [{"name": string, "emoji": string}], "outcastName": string, "trait": string, "redHerring": string}]}. ' +
            'Rules: exactly 5 rounds ordered from easiest to hardest; each round has exactly 5 items with distinct names and a relevant emoji each; ' +
            '"outcastName" must match one of that round\'s item names — it is the one item that LACKS the shared trait; ' +
            '"trait" is the real property the other four share (must be factually true for all four and false for the outcast); ' +
            '"redHerring" is a plausible but wrong reason someone might pick a different item (a surface similarity all five share). ' +
            'Round 1 should be common-knowledge; round 5 should require specialist knowledge but still be verifiable and fair. Facts must be accurate.',
        user:
            `Create Outcast daily puzzle #${puzzleNumber} (date ${dateKey}). ` +
            `Vary the topics across rounds (nature, science, geography, culture, language, etc.). Every trait must be true and checkable. Output JSON only.`,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
//  IMPOSTOR
// ─────────────────────────────────────────────────────────────────────────────

const impostorRaw = z.object({
    topic: shortText,
    topicEmoji: emoji,
    category: shortText,
    statements: z
        .array(z.object({ text: longText, isFake: z.boolean(), explanation: longText }))
        .length(5),
});

function normalizeImpostor(raw: unknown, dateKey: string): ImpostorPuzzle | null {
    const parsed = impostorRaw.safeParse(raw);
    if (!parsed.success) return null;
    const { topic, topicEmoji, category, statements } = parsed.data;

    if (statements.filter((s) => s.isFake).length !== 2) return null; // exactly 2 lies, 3 truths
    if (new Set(statements.map((s) => s.text.toLowerCase())).size !== 5) return null;

    const solution: ImpostorStatement[] = seededShuffle(
        statements.map((s) => ({ text: s.text, isFake: s.isFake, explanation: s.explanation })),
        shuffleRng(dateKey, 8),
    );

    return {
        topic,
        topicEmoji,
        category,
        statements: solution.map(({ text }) => ({ text })),
        _solution: solution,
    };
}

function impostorPrompt(dateKey: string, puzzleNumber: number): { system: string; user: string } {
    const categories = [
        'science',
        'history',
        'geography',
        'food',
        'animals',
        'sports',
        'technology',
        'pop culture',
        'language',
        'math',
    ];
    const hint = categories[puzzleNumber % categories.length];
    return {
        system:
            'You create one "Impostor" puzzle: five factual-sounding statements about a single topic, of which exactly THREE are true and TWO are false. ' +
            'Return ONLY a JSON object with this exact shape: ' +
            '{"topic": string, "topicEmoji": string, "category": string, "statements": [{"text": string, "isFake": boolean, "explanation": string}]}. ' +
            'Rules: exactly 5 statements; exactly 3 with isFake=false (genuinely true) and exactly 2 with isFake=true (genuinely false but believable); ' +
            'each explanation states plainly why the statement is true or false with a correcting fact for the fakes; ' +
            'the two fakes must be common misconceptions or plausible-sounding errors, not absurd; all true statements must be verifiably accurate. Keep statements concise.',
        user:
            `Create Impostor daily puzzle #${puzzleNumber} (date ${dateKey}). ` +
            `Suggested topic area: ${hint} (only a suggestion). Pick one specific engaging topic. Output JSON only.`,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
//  CHAINLINK — constrained to the fixed client-side association vocabulary so a
//  generated puzzle is actually solvable; strictly re-validated, else fallback.
// ─────────────────────────────────────────────────────────────────────────────

const chainlinkRaw = z.object({
    startWord: shortText,
    endWord: shortText,
    exampleChain: z.array(shortText).min(5).max(7),
    connectionExplanations: z.array(shortText).min(4).max(6),
});

const PAR_TO_DIFFICULTY: Record<number, ChainlinkPuzzle['difficulty']> = {
    4: 'short',
    5: 'medium',
    6: 'long',
};

function normalizeChainlink(raw: unknown): ChainlinkPuzzle | null {
    const parsed = chainlinkRaw.safeParse(raw);
    if (!parsed.success) return null;
    const startWord = parsed.data.startWord.trim().toUpperCase();
    const endWord = parsed.data.endWord.trim().toUpperCase();
    const chain = parsed.data.exampleChain.map((w) => w.trim());
    const explanations = parsed.data.connectionExplanations.map((w) => w.trim());

    if (chain.length < 5 || chain.length > 7) return null;
    if (explanations.length !== chain.length - 1) return null;
    if (chain[0].toUpperCase() !== startWord) return null;
    if (chain[chain.length - 1].toUpperCase() !== endWord) return null;

    // Anchors must be real association keys, and every hop must be a valid
    // association — otherwise the client could never accept a correct chain.
    if (!isAssociationKey(startWord) || !isAssociationKey(endWord)) return null;
    for (let i = 0; i < chain.length - 1; i++) {
        if (!isValidAssociation(chain[i], chain[i + 1])) return null;
    }

    const parLinks = chain.length - 1;
    const difficulty = PAR_TO_DIFFICULTY[parLinks];
    if (!difficulty) return null;

    return {
        startWord,
        endWord,
        parLinks,
        difficulty,
        _exampleChain: [startWord, ...chain.slice(1, -1).map((w) => w.toLowerCase()), endWord],
        _connectionExplanations: explanations,
    };
}

function chainlinkPrompt(dateKey: string, puzzleNumber: number): { system: string; user: string } {
    const vocab = associationVocabulary();
    const parLinks = [4, 5, 6][puzzleNumber % 3];
    return {
        system:
            'You create one "Chainlink" word puzzle. The player connects a START word to an END word through a chain of intermediate words where every ADJACENT pair forms a common compound word or a very tight, well-known association (e.g. SUN→light→house→work: "sunlight", "lighthouse", "housework"). ' +
            'Return ONLY a JSON object with this exact shape: ' +
            '{"startWord": string, "endWord": string, "exampleChain": [string], "connectionExplanations": [string]}. ' +
            'Hard rules: EVERY word in exampleChain (including start and end) MUST be chosen from the allowed vocabulary list provided by the user; ' +
            'exampleChain[0] must equal startWord and the last element must equal endWord; ' +
            'each adjacent pair must form a real compound word or an extremely common two-word phrase; ' +
            'connectionExplanations has exactly one fewer entry than exampleChain, each explaining the link between consecutive words (e.g. "sunlight", "lighthouse"). ' +
            'Do not use any word outside the provided list. Prefer natural, recognizable compounds so the puzzle is intuitive.',
        user:
            `Create Chainlink daily puzzle #${puzzleNumber} (date ${dateKey}) with an example chain of exactly ${parLinks + 1} words (${parLinks} links). ` +
            `Allowed vocabulary (use ONLY these words): ${vocab.join(', ')}. ` +
            `Output JSON only.`,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Dispatch
// ─────────────────────────────────────────────────────────────────────────────

export function buildPrompt(
    mode: DailyPuzzleMode,
    dateKey: string,
    puzzleNumber: number,
): { system: string; user: string } {
    switch (mode) {
        case 'spectrum':
            return spectrumPrompt(dateKey, puzzleNumber);
        case 'alibi':
            return alibiPrompt(dateKey, puzzleNumber);
        case 'outcast':
            return outcastPrompt(dateKey, puzzleNumber);
        case 'impostor':
            return impostorPrompt(dateKey, puzzleNumber);
        case 'chainlink':
            return chainlinkPrompt(dateKey, puzzleNumber);
    }
}

/**
 * Validate + normalize a raw model response into the exact client puzzle shape.
 * Returns null when the response is unusable (caller then falls back).
 */
export function validateAndNormalize(
    mode: DailyPuzzleMode,
    raw: unknown,
    dateKey: string,
): AnyPuzzle | null {
    switch (mode) {
        case 'spectrum':
            return normalizeSpectrum(raw, dateKey);
        case 'alibi':
            return normalizeAlibi(raw, dateKey);
        case 'outcast':
            return normalizeOutcast(raw, dateKey);
        case 'impostor':
            return normalizeImpostor(raw, dateKey);
        case 'chainlink':
            return normalizeChainlink(raw);
    }
}

/** The built-in deterministic pool puzzle for a mode + day (the fallback). */
export function fallbackPuzzle(mode: DailyPuzzleMode, date: Date): AnyPuzzle {
    switch (mode) {
        case 'spectrum':
            return generateSpectrumPuzzle(date);
        case 'alibi':
            return generateAlibiPuzzle(date);
        case 'outcast':
            return generateOutcastPuzzle(date);
        case 'impostor':
            return generateImpostorPuzzle(date);
        case 'chainlink':
            return generateChainlinkPuzzle(date);
    }
}
