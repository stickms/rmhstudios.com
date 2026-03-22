/**
 * Doctrine Engine — Puzzle Engine
 *
 * Deterministic puzzle generation using seeded PRNG.
 * Each puzzle mode generates different content from the same seed.
 */

import type { PuzzleMode, PuzzleData } from './types';

// ─── Seeded PRNG (Mulberry32) ───────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create a seeded random number generator with utility methods.
 */
function createRng(seed: number) {
  const next = mulberry32(seed);
  return {
    /** Random float [0, 1) */
    random: next,
    /** Random integer [min, max] inclusive */
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    /** Pick a random element from an array */
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    /** Shuffle an array (Fisher-Yates) */
    shuffle: <T>(arr: T[]): T[] => {
      const result = [...arr];
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    },
  };
}

// ─── Seed Generation ────────────────────────────────────────────────────────

/**
 * Generate a deterministic seed from a date string and mode.
 * Same date + mode always produces the same seed.
 */
export function getSeedForDate(date: string, mode: PuzzleMode): number {
  let hash = 0;
  const input = `${date}:${mode}:doctrine`;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}

/**
 * Calculate difficulty based on the day of week.
 * Monday=1 (easiest) → Friday=3 (medium) → Sunday=5 (hardest)
 */
function getDifficulty(date: string): 1 | 2 | 3 | 4 | 5 {
  const day = new Date(date + 'T12:00:00Z').getUTCDay(); // 0=Sun, 6=Sat
  const map: Record<number, 1 | 2 | 3 | 4 | 5> = {
    1: 1, 2: 2, 3: 3, 4: 3, 5: 4, 6: 4, 0: 5,
  };
  return map[day] ?? 3;
}

// ─── Mode-Specific Generators ───────────────────────────────────────────────

// Word banks for puzzle generation
const SUSPECTS = [
  'Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Hank',
  'Iris', 'Jack', 'Kate', 'Leo', 'Maya', 'Nick', 'Olivia', 'Pete',
];

const LOCATIONS = [
  'Library', 'Kitchen', 'Garden', 'Office', 'Garage', 'Attic', 'Basement',
  'Balcony', 'Pool', 'Theater', 'Workshop', 'Rooftop', 'Cellar', 'Study',
];

const ACTIVITIES = [
  'reading', 'cooking', 'painting', 'sleeping', 'exercising', 'calling someone',
  'watching TV', 'writing', 'cleaning', 'playing music', 'meditating', 'working',
];

const WORDS = [
  'shadow', 'light', 'storm', 'flame', 'frost', 'dream', 'steel', 'cloud',
  'stone', 'river', 'blade', 'crown', 'ghost', 'pulse', 'forge', 'drift',
  'ember', 'bloom', 'void', 'surge', 'nexus', 'prism', 'omega', 'alpha',
  'raven', 'crypt', 'tower', 'field', 'ocean', 'chaos', 'order', 'night',
];

/**
 * Alibi puzzle — each suspect claims a UNIQUE location. One "witness" statement
 * says they saw a specific person somewhere DIFFERENT from that person's claim.
 * The player must find whose alibi is contradicted by the witness.
 *
 * Structure:
 *   evidence: a fact the player uses to spot the lie
 *   suspects: each has a name + claim (unique locations, no overlap)
 *   solution: the suspect whose claim contradicts the evidence
 */
function generateAlibi(rng: ReturnType<typeof createRng>, difficulty: number) {
  const suspectCount = Math.min(3 + difficulty, SUSPECTS.length, LOCATIONS.length);
  const names = rng.shuffle([...SUSPECTS]).slice(0, suspectCount);
  const locations = rng.shuffle([...LOCATIONS]).slice(0, suspectCount);
  const activities = names.map(() => rng.pick(ACTIVITIES));

  // Pick the liar and a witness (a different suspect)
  const liarIndex = rng.int(0, names.length - 1);
  let witnessIndex: number;
  do { witnessIndex = rng.int(0, names.length - 1); } while (witnessIndex === liarIndex);

  // The witness saw the liar in the WITNESS'S location, but the liar claims
  // to have been in their own (different) location.
  const liarClaimedLocation = locations[liarIndex];
  const witnessLocation = locations[witnessIndex];

  // Build statements
  const suspects = names.map((name, i) => {
    const loc = locations[i];
    const act = activities[i];
    if (i === witnessIndex) {
      // Witness adds that they saw the liar there
      return {
        name,
        claim: `I was in the ${loc}, ${act}. I saw ${names[liarIndex]} there too.`,
      };
    }
    return {
      name,
      claim: `I was in the ${loc}, ${act}.`,
    };
  });

  // Build the evidence line shown above the suspect list
  const evidence = `${names[witnessIndex]} claims they saw ${names[liarIndex]} in the ${witnessLocation} — but ${names[liarIndex]} says otherwise.`;

  return {
    evidence,
    suspects: rng.shuffle(suspects),
    solution: names[liarIndex],
  };
}

function generateSpectrum(rng: ReturnType<typeof createRng>, difficulty: number) {
  // Players arrange items on a spectrum between two extremes
  const spectrums = [
    ['Cold', 'Hot'],
    ['Slow', 'Fast'],
    ['Soft', 'Hard'],
    ['Old', 'New'],
    ['Small', 'Large'],
    ['Simple', 'Complex'],
    ['Quiet', 'Loud'],
  ];
  const [low, high] = rng.pick(spectrums);
  const itemCount = 3 + difficulty;
  const items = rng.shuffle([...WORDS]).slice(0, itemCount);

  // Assign target positions (0-100) deterministically
  const positions = items.map((word, i) => ({
    word,
    target: Math.round((i / (itemCount - 1)) * 100),
  }));

  return {
    low,
    high,
    items: rng.shuffle(positions.map(p => p.word)),
    solution: positions.sort((a, b) => a.target - b.target).map(p => p.word),
  };
}

function generateOutcast(rng: ReturnType<typeof createRng>, difficulty: number) {
  // Find the word that doesn't belong in the group
  const categories: Record<string, string[]> = {
    elements: ['fire', 'water', 'earth', 'wind', 'lightning'],
    colors: ['crimson', 'azure', 'emerald', 'golden', 'violet'],
    weather: ['storm', 'thunder', 'rain', 'snow', 'fog'],
    metals: ['steel', 'iron', 'copper', 'silver', 'gold'],
    nature: ['river', 'ocean', 'forest', 'mountain', 'desert'],
  };

  const categoryNames = Object.keys(categories);
  const mainCategory = rng.pick(categoryNames);
  const mainWords = rng.shuffle([...categories[mainCategory]]).slice(0, 3 + difficulty);

  // Pick outcast from a different category
  let outcastCategory: string;
  do {
    outcastCategory = rng.pick(categoryNames);
  } while (outcastCategory === mainCategory);

  const outcast = rng.pick(categories[outcastCategory]);
  const allWords = rng.shuffle([...mainWords, outcast]);

  return {
    words: allWords,
    outcast,
    category: mainCategory,
    hint: `Think about ${mainCategory}.`,
  };
}

function generateChainlink(rng: ReturnType<typeof createRng>, difficulty: number) {
  // Connect words in a chain where each pair shares a common link
  const chainLength = 3 + difficulty;
  const words = rng.shuffle([...WORDS]).slice(0, chainLength);

  // Each consecutive pair has a bridge word
  const bridges = [];
  for (let i = 0; i < words.length - 1; i++) {
    bridges.push(rng.pick(WORDS.filter(w => w !== words[i] && w !== words[i + 1])));
  }

  return {
    start: words[0],
    end: words[words.length - 1],
    chain: words,
    bridges,
    scrambled: rng.shuffle([...words.slice(1, -1)]),
  };
}

function generateImpostor(rng: ReturnType<typeof createRng>, difficulty: number) {
  // One definition doesn't match its word
  const wordDefs: Array<[string, string]> = [
    ['nebula', 'A cloud of gas and dust in space'],
    ['cascade', 'A series of events each caused by the previous'],
    ['paradox', 'A statement that contradicts itself'],
    ['entropy', 'A measure of disorder in a system'],
    ['zenith', 'The highest point reached'],
    ['epoch', 'A period of time in history'],
    ['axiom', 'A statement accepted as true without proof'],
    ['cipher', 'A method of transforming text to conceal meaning'],
    ['dogma', 'A principle laid down as true by an authority'],
    ['gambit', 'An opening move that involves sacrifice'],
    ['helix', 'A spiral shape like a corkscrew'],
    ['nexus', 'A connection or link between things'],
  ];

  const count = 3 + difficulty;
  const selected = rng.shuffle([...wordDefs]).slice(0, count);
  const impostorIndex = rng.int(0, selected.length - 1);

  // Swap the impostor's definition with a different word's definition
  const otherDefs = wordDefs.filter(d => !selected.includes(d));
  const fakeDef = rng.pick(otherDefs);
  const realDef = selected[impostorIndex][1];
  selected[impostorIndex] = [selected[impostorIndex][0], fakeDef[1]];

  return {
    pairs: selected.map(([word, def]) => ({ word, definition: def })),
    impostor: selected[impostorIndex][0],
    realDefinition: realDef,
  };
}

// ─── Main Generator ─────────────────────────────────────────────────────────

const GENERATORS: Record<PuzzleMode, (rng: ReturnType<typeof createRng>, diff: number) => unknown> = {
  alibi: generateAlibi,
  spectrum: generateSpectrum,
  outcast: generateOutcast,
  chainlink: generateChainlink,
  impostor: generateImpostor,
};

/**
 * Generate a deterministic puzzle for a given mode and seed.
 */
export function generatePuzzle(mode: PuzzleMode, seed: number, date?: string): PuzzleData {
  const rng = createRng(seed);
  const difficulty = date ? getDifficulty(date) : 3;
  const content = GENERATORS[mode](rng, difficulty);

  return { mode, seed, difficulty, content };
}

/**
 * Validate a puzzle answer. Mode-specific logic.
 */
export function validateAnswer(mode: PuzzleMode, puzzleData: PuzzleData, answer: unknown): boolean {
  const content = puzzleData.content as Record<string, unknown>;

  switch (mode) {
    case 'alibi': {
      return typeof answer === 'string' && answer === (content as { solution: string }).solution;
    }
    case 'spectrum': {
      const solution = (content as { solution: string[] }).solution;
      if (!Array.isArray(answer) || answer.length !== solution.length) return false;
      return answer.every((item, i) => item === solution[i]);
    }
    case 'outcast': {
      return typeof answer === 'string' && answer === (content as { outcast: string }).outcast;
    }
    case 'chainlink': {
      const chain = (content as { chain: string[] }).chain;
      if (!Array.isArray(answer) || answer.length !== chain.length) return false;
      return answer[0] === chain[0] &&
        answer[answer.length - 1] === chain[chain.length - 1] &&
        answer.every((item, i) => chain.includes(item as string));
    }
    case 'impostor': {
      return typeof answer === 'string' && answer === (content as { impostor: string }).impostor;
    }
    default:
      return false;
  }
}

/**
 * Calculate a composite score from solve metrics.
 */
export function calculateScore(
  timeMs: number,
  attempts: number,
  difficulty: number,
  correct: boolean,
): number {
  if (!correct) return 0;

  // Base score from difficulty (100-500)
  const baseScore = difficulty * 100;

  // Time bonus: faster = more points (max 500 for < 10 seconds)
  const timeSeconds = timeMs / 1000;
  const timeBonus = Math.max(0, Math.floor(500 - (timeSeconds * 5)));

  // Attempt penalty: -50 per extra attempt
  const attemptPenalty = Math.max(0, (attempts - 1) * 50);

  return Math.max(0, baseScore + timeBonus - attemptPenalty);
}

/**
 * Strip solution fields from puzzle data before sending to the client.
 */
export function stripSolution(mode: PuzzleMode, data: Record<string, unknown>): Record<string, unknown> {
  const safe = { ...data };
  switch (mode) {
    case 'alibi':
      delete safe.solution;
      delete safe.hint;
      break;
    case 'spectrum':
      delete safe.solution;
      break;
    case 'outcast':
      delete safe.outcast;
      delete safe.category;
      delete safe.hint;
      break;
    case 'chainlink':
      delete safe.chain;
      delete safe.bridges;
      break;
    case 'impostor':
      delete safe.impostor;
      delete safe.realDefinition;
      break;
  }
  return safe;
}
