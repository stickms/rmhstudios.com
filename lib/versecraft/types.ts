import type { GeneratedWorld as GenWorld, GenChapter as GenChapterData } from './gen/world-types';

// ─── Word System ────────────────────────────────────────────────────────────

export type PartOfSpeech = 'noun' | 'verb' | 'adjective' | 'adverb' | 'preposition' | 'conjunction' | 'pronoun' | 'interjection';

export interface WordTags {
  darkness: number;
  brightness: number;
  complexity: number;
  nature: number;
  urban: number;
  abstract: number;
  concrete: number;
  emotionIntensity: number;
  humor: number;
  sincerity: number;
}

export interface Word {
  id: string;
  text: string;
  syllables: number;
  partOfSpeech: PartOfSpeech;
  tags: WordTags;
  categories: string[];
  rhymeGroup: string;
  stressPattern: string;
  isRare?: boolean;
  isProfound?: boolean;
  isSensory?: boolean;
  isMusical?: boolean;
  isWeird?: boolean;
}

// ─── Character System ───────────────────────────────────────────────────────

export type GenderPresentation = 'feminine' | 'masculine' | 'nonbinary';

export interface CharacterPreferences {
  darkness: number;
  brightness: number;
  complexity: number;
  simplicity: number;
  nature: number;
  urban: number;
  abstract: number;
  concrete: number;
  rhyme: number;
  freeVerse: number;
  emotionIntensity: number;
  restraint: number;
  humor: number;
  sincerity: number;
  brevity: number;
  length: number;
}

export interface CharacterNames {
  feminine: { first: string; nickname: string; pronouns: 'she/her' };
  masculine: { first: string; nickname: string; pronouns: 'he/him' };
  nonbinary: { first: string; nickname: string; pronouns: 'they/them' };
}

export interface Character {
  id: string;
  names: CharacterNames;
  surname: string;
  defaultPresentation: GenderPresentation;
  age: number;
  role: string;
  poeticSchool: string;
  archetype: string;
  color: string;
  accentColor: string;
  preferences: CharacterPreferences;
  lovedWordCategories: string[];
  hatedWordCategories: string[];
  background: string;
  secret: string;
  fear: string;
  dream: string;
  unlockCondition: string;
  signaturePoem: string;
  expressions: string[];
}

// ─── Dialogue System ────────────────────────────────────────────────────────

export interface DialogueChoice {
  text: string;
  type: 'normal' | 'flirt' | 'friend' | 'tease' | 'deep';
  effects: {
    affinity?: Record<string, number>;
    romance?: Record<string, number>;
    flags?: Record<string, string | number | boolean>;
  };
}

export interface DialogueNode {
  id: string;
  speaker: string | null; // null = narration
  text: string;
  expression?: string;
  animation?: string;
  choices?: DialogueChoice[];
  nextId?: string;
  background?: string;
  bgm?: string;
  sfx?: string;
  charactersPresent?: string[];
}

export interface Scene {
  id: string;
  background: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  bgm?: string;
  charactersPresent: string[];
  dialogueNodes: DialogueNode[];
}

export interface PuzzleConfig {
  type: 'word_select' | 'line_arrange';
  puzzleId: string;
}

export interface ChapterData {
  id: string;
  actNumber: number;
  chapterNumber: number;
  title: string;
  subtitle: string;
  scenes: Scene[];
  puzzles: PuzzleConfig[];
  estimatedPlaytime: number;
  charactersPresent: string[];
}

// ─── Puzzle System ──────────────────────────────────────────────────────────

export interface WordSelectPuzzleData {
  id: string;
  chapter: string;
  theme: string;
  promptText: string;
  requiredWordCount: number;
  wordPool: Word[];
  bonuses: {
    alliteration: boolean;
    rhymingPair: boolean;
    oxymoron: boolean;
    syllableTarget?: number;
  };
}

export interface PoemLine {
  id: string;
  text: string;
  flowsWellAfter: string[];
  flowsWellBefore: string[];
  clashesWith: string[];
  strongOpener: boolean;
  strongCloser: boolean;
  emotionalIntensity: number;
  toneShift: number;
}

export interface LineArrangePuzzleData {
  id: string;
  theme: string;
  promptText: string;
  lines: PoemLine[];
  optimalOrders: string[][];
  scoringMode: 'flow' | 'narrative' | 'emotional_arc' | 'surprise';
}

// ─── Scoring ────────────────────────────────────────────────────────────────

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface PoemScore {
  score: number; // 0-100
  grade: Grade;
  characterScores: Record<string, {
    score: number;
    grade: Grade;
    affinityChange: number;
    reaction: string;
  }>;
  bonuses: string[];
}

// ─── Poem History ───────────────────────────────────────────────────────────

export interface PoemRecord {
  id: string;
  words: string[];
  text: string;
  timestamp: number;
  chapter: string;
  puzzleType: 'word_select' | 'line_arrange' | 'freeform';
  scores: Record<string, number>;
  grade: Grade;
}

// ─── Affinity State ─────────────────────────────────────────────────────────

export interface CharacterAffinity {
  affinity: number;   // 0-1800
  romance: number;    // 0-1000
  level: number;      // 0-10
  romanceLevel: number; // 0-5
  poemsShared: number;
  poemsLoved: number;
  poemsHated: number;
  routeStarted: boolean;
  routeCompleted: boolean;
}

// ─── Game State ─────────────────────────────────────────────────────────────

export type GameScreen =
  | 'menu'
  | 'settings'
  | 'world_setup'
  | 'dialogue'
  | 'gen_poem'
  | 'cast'
  | 'complete'
  | 'puzzle_word_select'
  | 'puzzle_line_arrange'
  | 'presentation'
  | 'summary'
  | 'journal'
  | 'save'
  | 'load'
  | 'progress';

export type SpritePack = 'default' | 'hoshiko';

/** Who the player can be romanced by — shapes flirt options and romance focus. */
export type Attraction = 'men' | 'women' | 'everyone' | 'none';

export interface PlayerSettings {
  playerName: string;
  playerPronouns: 'he/him' | 'she/her' | 'they/them';
  /** Optional neopronoun override, e.g. "ze/zir/zirs". Wins over playerPronouns. */
  customPronouns?: string;
  /** Who the player is drawn to; gates romance/flirt framing. Default everyone. */
  attraction: Attraction;
  characterPresentations: Record<string, GenderPresentation>;
  spritePack: SpritePack;
  textSpeed: 'slow' | 'normal' | 'fast' | 'instant';
  musicVolume: number;
  sfxVolume: number;
  /** Allow mature/dark themes by default in new stories. */
  matureDefault: boolean;
  /** Reduce/disable non-essential motion (accessibility + low-power devices). */
  reducedMotion: boolean;
}

export interface GameState {
  // Screen
  screen: GameScreen;
  previousScreen: GameScreen | null;

  // Story progress
  currentChapter: string;
  currentSceneIndex: number;
  currentDialogueIndex: number;
  completedChapters: string[];
  storyFlags: Record<string, string | number | boolean>;

  // Characters
  affinity: Record<string, CharacterAffinity>;

  // Player
  settings: PlayerSettings;

  // Poems
  poemHistory: PoemRecord[];
  currentPuzzle: WordSelectPuzzleData | LineArrangePuzzleData | null;
  currentPoemScore: PoemScore | null;
  selectedWords: string[]; // word IDs for active WordSelect

  // Line arrange state
  arrangedLineIds: string[];

  // Meta
  playtime: number;
  gameStarted: boolean;
  totalPoemsWritten: number;

  // ─── Generated (seed-driven personalized) mode ─────────────────────────────
  /** 'generated' = procedural seed-driven story; 'legacy' = the authored VN. */
  mode: 'legacy' | 'generated';
  /** Shareable seed code for the current generated world. */
  seed: string;
  /** The player's setup prompt (or '' for random). */
  mcPrompt: string;
  /** The generated world (cast, setting, route plan). Null in legacy mode. */
  world: GenWorld | null;
  /** Cache of generated chapters by index for the current world. */
  generatedChapters: Record<number, GenChapterData>;
  /** Current chapter index within the generated route. */
  currentChapterIndex: number;
  /** Log of player choices for story continuity (fed back into generation). */
  genChoiceLog: { chapter: number; tone: string; text: string; direction?: string }[];
}

// ─── Save File ──────────────────────────────────────────────────────────────

export interface SaveFile {
  version: string;
  slotId: number;
  timestamp: number;
  playtime: number;
  state: Omit<GameState, 'currentPoemScore' | 'previousScreen'>;
  chapterTitle: string;
  playerName: string;
}
