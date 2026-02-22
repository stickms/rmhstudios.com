/**
 * generate-rhyme-data.ts
 *
 * Rhyme data generation pipeline for RMHBox Rhyme Time.
 *
 * Parses the CMU Pronouncing Dictionary (~134K entries), extracts rhyme end
 * sounds (last stressed vowel + trailing phonemes), groups words by rhyme,
 * computes syllable counts and frequency heuristics, selects balanced root
 * words, and writes root-words.json and rhyme-dictionary.json to
 * public/data/rmhbox/rhyme-time/.
 *
 * Usage: npx tsx scripts/rmhbox/generate-rhyme-data.ts
 */

import fs from "fs";
import path from "path";
import { dictionary as cmuDict } from "cmu-pronouncing-dictionary";
import { syllable } from "syllable";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RhymeEntry {
  word: string;
  syllableCount: number;
  frequencyRank: number;
  isMultiSyllableRhyme: boolean;
}

interface RootWord {
  word: string;
  phonetic: string;
  syllableCount: number;
  rhymeEndSound: string;
  knownRhymeCount: number;
  difficulty: "easy" | "medium" | "hard";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OUT_DIR = path.resolve(
  __dirname,
  "../../public/data/rmhbox/rhyme-time"
);

// Minimum number of rhymes a root word candidate must have
const MIN_RHYME_COUNT = 15;

// ARPAbet vowel phonemes (without stress digits)
const VOWELS = new Set([
  "AA", "AE", "AH", "AO", "AW", "AX", "AXR", "AY",
  "EH", "ER", "EY", "IH", "IX", "IY", "OW", "OY", "UH", "UW", "UX",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return true if the phoneme token is a vowel (has a stress digit 0/1/2). */
function isVowel(phoneme: string): boolean {
  const base = phoneme.replace(/[012]$/, "");
  return VOWELS.has(base);
}

/** Return true if the phoneme has primary (1) or secondary (2) stress. */
function isStressed(phoneme: string): boolean {
  return /[12]$/.test(phoneme);
}

/**
 * Extract rhyme end sound: from the last stressed vowel to the end of the
 * phoneme string.  Falls back to the last vowel if no stressed vowel exists.
 */
function getRhymeEndSound(phonemes: string[]): string | null {
  let lastStressedIdx = -1;
  let lastVowelIdx = -1;

  for (let i = phonemes.length - 1; i >= 0; i--) {
    if (isVowel(phonemes[i])) {
      if (lastVowelIdx === -1) lastVowelIdx = i;
      if (isStressed(phonemes[i])) {
        lastStressedIdx = i;
        break;
      }
    }
  }

  const idx = lastStressedIdx !== -1 ? lastStressedIdx : lastVowelIdx;
  if (idx === -1) return null;

  return phonemes.slice(idx).join(" ");
}

/** Count vowel phonemes in a phoneme slice to determine rhyme syllable count. */
function countRhymeSyllables(rhymeEndSound: string): number {
  return rhymeEndSound.split(" ").filter((p) => isVowel(p)).length;
}

/**
 * Deterministic frequency rank heuristic: shorter words → lower rank (more
 * common). Uses a simple hash of the word to spread values within each
 * length bucket so the output is stable across runs.
 */
function computeFrequencyRank(word: string): number {
  // Simple deterministic hash from the word characters
  let hash = 0;
  for (let i = 0; i < word.length; i++) {
    hash = (hash * 31 + word.charCodeAt(i)) | 0;
  }
  const spread = Math.abs(hash);

  const len = word.length;
  if (len <= 3) return (spread % 1000) + 1;
  if (len <= 5) return (spread % 3000) + 1000;
  if (len <= 7) return (spread % 3000) + 4000;
  return (spread % 3000) + 7000;
}

/** Filter: only pure alpha words, no hyphens/apostrophes/digits. */
function isPureAlpha(word: string): boolean {
  return /^[a-z]+$/.test(word);
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

function main() {
  console.log("🔤 Parsing CMU Pronouncing Dictionary...");

  // 1. Parse entries, filter to pure-alpha words
  const entries: { word: string; phonemes: string[]; phonetic: string }[] = [];

  for (const [word, phonetic] of Object.entries(cmuDict)) {
    if (!isPureAlpha(word)) continue;
    const phonemes = (phonetic as string).split(" ");
    entries.push({ word, phonemes, phonetic: phonetic as string });
  }

  console.log(`  ✅ ${entries.length} pure-alpha entries`);

  // 2. Build rhyme groups
  console.log("🎵 Computing rhyme end sounds and grouping...");

  const rhymeGroups = new Map<string, RhymeEntry[]>();
  const wordPhonetics = new Map<
    string,
    { phonetic: string; rhymeEndSound: string }
  >();

  for (const { word, phonemes, phonetic } of entries) {
    const rhymeEndSound = getRhymeEndSound(phonemes);
    if (!rhymeEndSound) continue;

    const sc = syllable(word);
    const isMulti = countRhymeSyllables(rhymeEndSound) >= 2;
    const freq = computeFrequencyRank(word);

    const entry: RhymeEntry = {
      word,
      syllableCount: sc,
      frequencyRank: freq,
      isMultiSyllableRhyme: isMulti,
    };

    if (!rhymeGroups.has(rhymeEndSound)) {
      rhymeGroups.set(rhymeEndSound, []);
    }
    rhymeGroups.get(rhymeEndSound)!.push(entry);

    wordPhonetics.set(word, { phonetic, rhymeEndSound });
  }

  console.log(`  ✅ ${rhymeGroups.size} unique rhyme end sounds`);

  // 3. Build rhyme dictionary (all groups with >= 2 words)
  const rhymeDictionary: Record<string, RhymeEntry[]> = {};
  for (const [sound, group] of rhymeGroups) {
    if (group.length >= 2) {
      // Sort by frequency rank so more common words appear first
      group.sort((a, b) => a.frequencyRank - b.frequencyRank);
      rhymeDictionary[sound] = group;
    }
  }

  console.log(
    `  ✅ ${Object.keys(rhymeDictionary).length} rhyme groups (≥2 words)`
  );

  // 4. Select root words
  console.log("🌱 Selecting root words...");

  // Common short English words likely in the dictionary
  const commonWords = new Set([
    "cat", "bat", "hat", "mat", "rat", "sat", "flat", "fat",
    "dog", "log", "fog", "bog", "hog", "jog",
    "sun", "fun", "run", "gun", "bun", "nun",
    "day", "say", "way", "pay", "may", "play", "stay", "ray",
    "light", "night", "right", "fight", "sight", "might", "bright",
    "rain", "train", "brain", "pain", "main", "gain", "chain",
    "tree", "free", "three", "see", "be", "key", "me",
    "ring", "sing", "king", "thing", "bring", "spring", "wing",
    "love", "dove", "above", "glove",
    "time", "rhyme", "dime", "climb", "lime",
    "star", "car", "far", "bar", "jar",
    "blue", "true", "new", "few", "crew", "flew",
    "make", "take", "cake", "lake", "shake", "break",
    "cold", "old", "gold", "bold", "told", "hold",
    "name", "game", "fame", "flame", "came", "same",
    "land", "hand", "band", "sand", "stand", "grand",
    "best", "rest", "test", "west", "nest", "chest",
    "dream", "team", "stream", "cream", "beam",
    "rock", "clock", "block", "knock", "stock", "lock",
    "face", "place", "space", "race", "grace", "trace",
    "town", "down", "brown", "crown", "frown", "gown",
    "fire", "wire", "hire", "tire",
    "ball", "call", "fall", "tall", "wall", "small",
    "book", "look", "cook", "hook", "took",
    "black", "back", "track", "pack", "stack", "crack",
    "red", "bed", "head", "dead", "said", "fed", "led",
    "moon", "soon", "tune", "june", "spoon",
    "deep", "sleep", "keep", "sheep", "sweep", "steep",
    "boat", "coat", "goat", "note", "vote", "wrote",
    "dance", "chance", "france", "lance",
    "round", "sound", "ground", "found", "bound", "pound",
    "think", "drink", "link", "pink", "sink",
    "world", "girl", "curl", "pearl",
    "heart", "start", "part", "art", "smart", "chart",
    "wind", "kind", "mind", "find", "blind",
    "house", "mouse",
    "beach", "teach", "reach", "each", "peach",
    "grow", "show", "know", "flow", "snow", "blow",
    "mine", "fine", "line", "wine", "nine", "shine",
    "still", "hill", "fill", "will", "skill", "drill",
    // Additional words for more coverage (especially medium/hard)
    "fish", "dish", "wish", "swish",
    "life", "wife", "knife", "strife",
    "week", "cheek", "peak", "seek", "creek",
    "dark", "park", "mark", "spark", "shark",
    "bone", "stone", "phone", "tone", "zone", "clone",
    "joy", "boy", "toy", "ploy",
    "map", "cap", "tap", "snap", "clap", "trap",
    "step", "pep", "rep",
    "safe", "wave", "cave", "brave", "save", "gave",
    "dirt", "shirt", "hurt", "skirt",
    "math", "bath", "path",
    "warm", "storm", "form", "norm",
    "hope", "rope", "scope", "slope",
    "luck", "duck", "truck", "stuck", "buck",
    "shop", "drop", "stop", "crop", "top", "pop",
    "deal", "feel", "heal", "meal", "real", "steel",
    "air", "fair", "hair", "pair", "chair", "stair",
    "age", "page", "stage", "cage", "wage",
    "half", "laugh", "staff",
    "late", "gate", "fate", "great", "state", "wait",
    "score", "door", "floor", "more", "store", "pour",
    "green", "clean", "mean", "lean", "scene", "teen",
    "bit", "fit", "hit", "sit", "split", "quit", "kit",
    "cool", "pool", "school", "tool", "fool", "rule",
    "birth", "earth", "worth",
    "field", "shield", "build", "guild",
    "fast", "last", "past", "blast", "cast", "vast",
    "seed", "need", "speed", "feed", "read", "lead",
    "spring", "string", "swing", "fling", "cling",
    "dust", "trust", "must", "just", "gust", "rust",
    "jump", "bump", "pump", "dump", "lump",
    "bite", "kite", "quite", "white", "write", "site",
    "itch", "switch", "witch", "rich", "pitch", "ditch",
    "match", "catch", "patch", "watch", "batch",
    "mile", "smile", "style", "while", "file", "pile",
    "cup", "up", "pup",
    "ship", "trip", "chip", "flip", "grip", "skip", "tip",
    "bell", "fell", "hell", "sell", "tell", "well", "spell",
    "claw", "draw", "jaw", "law", "raw", "saw",
    "south", "mouth",
    "street", "sweet", "heat", "beat", "eat", "seat", "meat",
  ]);

  // Candidate root words: must be common, in dict, and have enough rhymes
  const candidates: RootWord[] = [];

  for (const word of commonWords) {
    const info = wordPhonetics.get(word);
    if (!info) continue;

    const group = rhymeDictionary[info.rhymeEndSound];
    if (!group) continue;

    const rhymeCount = group.length - 1; // exclude the word itself
    if (rhymeCount < MIN_RHYME_COUNT) continue;

    let difficulty: "easy" | "medium" | "hard";
    if (rhymeCount >= 40) difficulty = "easy";
    else if (rhymeCount >= 25) difficulty = "medium";
    else difficulty = "hard";

    candidates.push({
      word,
      phonetic: info.phonetic,
      syllableCount: syllable(word),
      rhymeEndSound: info.rhymeEndSound,
      knownRhymeCount: rhymeCount,
      difficulty,
    });
  }

  // Balance selection: ~12-15 per difficulty, targeting 30-40 total
  const easy = candidates.filter((c) => c.difficulty === "easy");
  const medium = candidates.filter((c) => c.difficulty === "medium");
  const hard = candidates.filter((c) => c.difficulty === "hard");

  // Deduplicate by rhymeEndSound to get variety
  function dedupeBySound(arr: RootWord[], max: number): RootWord[] {
    const seen = new Set<string>();
    const result: RootWord[] = [];
    // Sort by rhymeCount descending to prefer richer groups
    arr.sort((a, b) => b.knownRhymeCount - a.knownRhymeCount);
    for (const item of arr) {
      if (seen.has(item.rhymeEndSound)) continue;
      seen.add(item.rhymeEndSound);
      result.push(item);
      if (result.length >= max) break;
    }
    return result;
  }

  const selectedEasy = dedupeBySound(easy, 15);
  const selectedMedium = dedupeBySound(medium, 13);
  const selectedHard = dedupeBySound(hard, 12);

  const rootWords = [...selectedEasy, ...selectedMedium, ...selectedHard];
  rootWords.sort((a, b) => a.word.localeCompare(b.word));

  console.log(
    `  ✅ ${rootWords.length} root words selected ` +
      `(${selectedEasy.length} easy, ${selectedMedium.length} medium, ${selectedHard.length} hard)`
  );

  // 5. Write output files
  console.log("💾 Writing output files...");

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const rootWordsPath = path.join(OUT_DIR, "root-words.json");
  fs.writeFileSync(rootWordsPath, JSON.stringify(rootWords, null, 2));
  console.log(`  ✅ ${rootWordsPath}`);

  const rhymeDictPath = path.join(OUT_DIR, "rhyme-dictionary.json");
  fs.writeFileSync(rhymeDictPath, JSON.stringify(rhymeDictionary, null, 2));
  console.log(`  ✅ ${rhymeDictPath}`);

  // Summary stats
  const totalRhymeEntries = Object.values(rhymeDictionary).reduce(
    (sum, g) => sum + g.length,
    0
  );
  console.log("\n📊 Summary:");
  console.log(`  Root words: ${rootWords.length}`);
  console.log(`  Rhyme groups: ${Object.keys(rhymeDictionary).length}`);
  console.log(`  Total rhyme entries: ${totalRhymeEntries}`);
  console.log("✅ Done!");
}

main();
