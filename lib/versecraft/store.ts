'use client';

import { create } from 'zustand';
import type {
  GameState, GameScreen, PlayerSettings, CharacterAffinity,
  PoemRecord, PoemScore, WordSelectPuzzleData, LineArrangePuzzleData,
  GenderPresentation, DialogueChoice,
} from './types';
import { CHARACTERS, getAffinityLevel } from './characters';
import { autoSave, loadGame, saveGame as persistSave, dbSave, dbLoad } from './persistence';
import { getChapterEntry, getNextChapterId } from './chapters/registry';
import { fallbackWorld, fallbackChapter } from './gen/fallback';
import { fetchOrCreateWorld, fetchChapter } from './gen/client';
import { makeSeedCode, normalizeSeed } from './gen/rng';
import { getWordPool } from './words';
import type { GeneratedWorld, GenChapter, GenChoice } from './gen/world-types';
import type { Word } from './types';

export interface GenPoemState {
  prompt: string;
  characterId: string;
  characterName: string;
  words: Word[];
}

/** Map a world's tone/motifs onto word-pool categories for poem moments. */
function poemCategoriesFor(world: GeneratedWorld): string[] {
  const text = (world.toneTags.join(' ') + ' ' + world.motifs.join(' ')).toLowerCase();
  const cats = new Set<string>();
  const add = (...c: string[]) => c.forEach(x => cats.add(x));
  if (/dark|grief|sorrow|loss|night|tense|ache/.test(text)) add('night', 'sorrow', 'solitude');
  if (/hope|warm|bright|joy|tender/.test(text)) add('light', 'warmth', 'flowers');
  if (/restless|electric|city|loud/.test(text)) add('urban', 'fire', 'rhythm');
  if (/dream|surreal|fleet|wistful/.test(text)) add('dreams', 'moonlight', 'ocean');
  if (cats.size === 0) add('night', 'light', 'solitude', 'warmth');
  return [...cats];
}

function createInitialAffinity(): Record<string, CharacterAffinity> {
  const affinity: Record<string, CharacterAffinity> = {};
  for (const id of Object.keys(CHARACTERS)) {
    affinity[id] = {
      affinity: 0,
      romance: 0,
      level: 0,
      romanceLevel: 0,
      poemsShared: 0,
      poemsLoved: 0,
      poemsHated: 0,
      routeStarted: false,
      routeCompleted: false,
    };
  }
  return affinity;
}

function createDefaultSettings(): PlayerSettings {
  const presentations: Record<string, GenderPresentation> = {};
  for (const [id, char] of Object.entries(CHARACTERS)) {
    presentations[id] = char.defaultPresentation;
  }
  return {
    playerName: 'Ash',
    playerPronouns: 'they/them',
    characterPresentations: presentations,
    spritePack: 'default' as const,
    textSpeed: 'normal' as const,
    musicVolume: 0.7,
    sfxVolume: 0.8,
  };
}

export function createInitialState(): GameState {
  return {
    screen: 'menu',
    previousScreen: null,
    currentChapter: 'ch01',
    currentSceneIndex: 0,
    currentDialogueIndex: 0,
    completedChapters: [],
    storyFlags: {},
    affinity: createInitialAffinity(),
    settings: createDefaultSettings(),
    poemHistory: [],
    currentPuzzle: null,
    currentPoemScore: null,
    selectedWords: [],
    arrangedLineIds: [],
    playtime: 0,
    gameStarted: false,
    totalPoemsWritten: 0,
    mode: 'generated',
    seed: '',
    mcPrompt: '',
    world: null,
    generatedChapters: {},
    currentChapterIndex: 0,
    genChoiceLog: [],
  };
}

// Dedupe in-flight chapter generations (prefetch + on-demand) by seed:index so
// we never fire two DeepSeek calls for the same chapter.
const chapterInFlight = new Set<string>();

/** Build a compact "story so far" summary fed to the chapter generator so the
 *  AI keeps continuity: premise, beats played, the player's choice pattern, and
 *  who they've grown closest to. */
function buildContextSummary(state: GameState & GameActions): string {
  const world = state.world;
  if (!world) return '';
  const past = Object.values(state.generatedChapters)
    .filter(c => c.index < state.currentChapterIndex)
    .sort((a, b) => a.index - b.index)
    .map(c => `Ch${c.index + 1} "${c.title}" (${c.emotionalGoal})`)
    .slice(-6)
    .join('; ');
  const choices = state.genChoiceLog.slice(-6).map(c => c.tone).join(', ');
  const leaders = Object.entries(state.affinity)
    .sort((a, b) => b[1].affinity - a[1].affinity)
    .slice(0, 2)
    .map(([id]) => world.characters.find(c => c.id === id)?.name)
    .filter(Boolean)
    .join(' & ');
  return [
    past && `Chapters played: ${past}.`,
    choices && `Player has been answering: ${choices}.`,
    leaders && `Player is closest to: ${leaders}.`,
  ].filter(Boolean).join(' ');
}

/** Build a fresh affinity map for a generated cast. */
function affinityForWorld(world: GeneratedWorld): Record<string, CharacterAffinity> {
  const affinity: Record<string, CharacterAffinity> = {};
  for (const c of world.characters) {
    affinity[c.id] = {
      affinity: 0, romance: 0, level: 0, romanceLevel: 0,
      poemsShared: 0, poemsLoved: 0, poemsHated: 0,
      routeStarted: true, routeCompleted: false,
    };
  }
  return affinity;
}

// Debounce helper for DB saves
let dbSaveTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedDbSave(getState: () => GameState & GameActions, delayMs = 2000) {
  if (dbSaveTimer) clearTimeout(dbSaveTimer);
  dbSaveTimer = setTimeout(() => {
    const state = getState();
    if (state.isLoggedIn && state.gameStarted) {
      dbSave(state);
    }
  }, delayMs);
}

interface GameActions {
  // Navigation
  setScreen: (screen: GameScreen) => void;
  goBack: () => void;

  // Game flow
  startNewGame: () => void;
  continueGame: () => void;
  updateSettings: (settings: Partial<PlayerSettings>) => void;

  // Generated (seed-driven) flow
  genLoading: boolean;
  currentGenPoem: GenPoemState | null;
  startGeneratedGame: (opts: { seed?: string; prompt?: string; playerName?: string }) => Promise<void>;
  ensureGeneratedChapter: (index: number) => Promise<GenChapter>;
  /** Generate + cache a chapter in the background (no UI block) so it's ready
   *  by the time the player reaches it. */
  prefetchChapter: (index: number) => void;
  genApplyChoice: (choice: GenChoice) => void;
  advanceGeneratedChapter: () => Promise<boolean>;
  /** True if this chapter should pause for a poem moment (and it hasn't run). */
  shouldRunPoem: () => boolean;
  openGenPoem: () => void;
  finishGenPoem: (selectedWordIds: string[]) => { score: number; reaction: string };

  // Dialogue
  advanceDialogue: () => void;
  setDialogueIndex: (index: number) => void;
  setSceneIndex: (index: number) => void;
  applyChoiceEffects: (choice: DialogueChoice) => void;
  setStoryFlag: (key: string, value: string | number | boolean) => void;

  // Puzzle
  startPuzzle: (puzzle: WordSelectPuzzleData | LineArrangePuzzleData) => void;
  toggleWord: (wordId: string) => void;
  clearSelectedWords: () => void;
  setArrangedLineIds: (ids: string[]) => void;
  submitPoem: (score: PoemScore, words: string[], text: string, puzzleType: 'word_select' | 'line_arrange') => void;
  closePoemPresentation: () => void;

  // Chapter progression
  completeChapter: () => void;
  advanceToNextChapter: () => boolean;

  // Affinity
  updateAffinity: (characterId: string, change: number) => void;

  // Save/Load
  saveToSlot: (slotId: number) => boolean;
  loadFromSlot: (slotId: number) => boolean;

  // DB persistence
  isLoggedIn: boolean;
  isSyncing: boolean;
  setLoggedIn: (loggedIn: boolean) => void;
  initFromServer: () => Promise<void>;
  triggerAutoSave: () => void;

  // Playtime
  incrementPlaytime: () => void;
}

export const useGameStore = create<GameState & GameActions>()((set, get) => ({
  ...createInitialState(),
  isLoggedIn: false,
  isSyncing: false,

  // Navigation
  setScreen: (screen) => set(s => ({ screen, previousScreen: s.screen })),
  goBack: () => set(s => ({ screen: s.previousScreen || 'menu', previousScreen: null })),

  // Game flow
  startNewGame: () => set({
    ...createInitialState(),
    screen: 'settings',
    gameStarted: true,
    isLoggedIn: get().isLoggedIn,
  }),

  continueGame: async () => {
    const state = get();
    // Try DB first if logged in
    if (state.isLoggedIn) {
      set({ isSyncing: true });
      const data = await dbLoad();
      set({ isSyncing: false });
      if (data?.saveData) {
        const savedState = data.saveData as GameState;
        set({
          ...savedState,
          screen: 'dialogue',
          previousScreen: null,
          currentPoemScore: null,
          isLoggedIn: true,
        });
        return;
      }
    }
    // Fall back to localStorage
    const save = loadGame(0);
    if (save) {
      set({
        ...save.state,
        screen: 'dialogue',
        previousScreen: null,
        currentPoemScore: null,
      });
    }
  },

  updateSettings: (newSettings) => set(s => ({
    settings: { ...s.settings, ...newSettings },
  })),

  // ─── Generated (seed-driven) flow ──────────────────────────────────────────
  genLoading: false,
  currentGenPoem: null,

  startGeneratedGame: async ({ seed, prompt, playerName }) => {
    const cleanSeed = seed && seed.trim()
      ? normalizeSeed(seed)
      : makeSeedCode(`${Date.now()}-${Math.random()}`);
    const name = playerName || get().settings.playerName || 'You';
    const pronouns = get().settings.playerPronouns;
    set({ genLoading: true });

    // Server-first (DeepSeek + persisted, shareable); deterministic local fallback.
    // Anything that goes wrong degrades to the pure local generator — never a crash.
    let base: GeneratedWorld;
    try {
      base = (await fetchOrCreateWorld(cleanSeed, prompt ?? '', pronouns))
        ?? fallbackWorld(cleanSeed, prompt ?? '', name, pronouns);
    } catch {
      base = fallbackWorld(cleanSeed, prompt ?? '', name, pronouns);
    }
    // Show the player's own name regardless of how the canonical world was made.
    const world: GeneratedWorld = { ...base, seed: cleanSeed, mc: { ...base.mc, name } };

    let ch0: GenChapter;
    try {
      ch0 = (await fetchChapter(cleanSeed, 0)) ?? fallbackChapter(world, 0);
    } catch {
      ch0 = fallbackChapter(world, 0);
    }
    if (!ch0.scenes?.length) ch0 = fallbackChapter(world, 0);

    set({
      ...createInitialState(),
      mode: 'generated',
      seed: cleanSeed,
      mcPrompt: prompt ?? '',
      world,
      generatedChapters: { 0: ch0 },
      currentChapterIndex: 0,
      currentSceneIndex: 0,
      currentDialogueIndex: 0,
      affinity: affinityForWorld(world),
      gameStarted: true,
      genLoading: false,
      screen: 'dialogue',
      isLoggedIn: get().isLoggedIn,
    });
    const s = get();
    autoSave(s);
    debouncedDbSave(get);
    // Warm the next chapter in the background so advancing feels instant.
    get().prefetchChapter(1);
  },

  ensureGeneratedChapter: async (index) => {
    const state = get();
    const cached = state.generatedChapters[index];
    if (cached) return cached;
    const world = state.world;
    if (!world) throw new Error('ensureGeneratedChapter: no world');
    let ch: GenChapter;
    try {
      ch = (await fetchChapter(state.seed, index, buildContextSummary(state))) ?? fallbackChapter(world, index);
    } catch {
      ch = fallbackChapter(world, index);
    }
    if (!ch.scenes?.length) ch = fallbackChapter(world, index);
    set({ generatedChapters: { ...get().generatedChapters, [index]: ch } });
    return ch;
  },

  prefetchChapter: (index) => {
    const s = get();
    const world = s.world;
    if (!world || index < 0 || index >= world.routePlan.totalChapters) return;
    if (s.generatedChapters[index]) return;        // already have it
    const key = `${s.seed}:${index}`;
    if (chapterInFlight.has(key)) return;          // already generating
    chapterInFlight.add(key);
    // Fire and forget — no genLoading, never blocks the UI.
    (async () => {
      try {
        const remote = await fetchChapter(s.seed, index, buildContextSummary(get()));
        const ch = (remote && remote.scenes?.length) ? remote : fallbackChapter(world, index);
        // Only store if the player hasn't already raced ahead and cached it.
        if (!get().generatedChapters[index]) {
          set({ generatedChapters: { ...get().generatedChapters, [index]: ch } });
        }
      } catch {
        /* leave it; it'll generate on demand when reached */
      } finally {
        chapterInFlight.delete(key);
      }
    })();
  },

  genApplyChoice: (choice) => {
    set(s => {
      const newAffinity = { ...s.affinity };
      if (choice.affinity) {
        for (const [charId, change] of Object.entries(choice.affinity)) {
          const curr = newAffinity[charId] ?? {
            affinity: 0, romance: 0, level: 0, romanceLevel: 0,
            poemsShared: 0, poemsLoved: 0, poemsHated: 0,
            routeStarted: true, routeCompleted: false,
          };
          const newPoints = Math.max(0, curr.affinity + change);
          newAffinity[charId] = { ...curr, affinity: newPoints, level: getAffinityLevel(newPoints) };
        }
      }
      const newFlags = { ...s.storyFlags };
      if (choice.flags) for (const [k, v] of Object.entries(choice.flags)) newFlags[k] = v;
      return {
        affinity: newAffinity,
        storyFlags: newFlags,
        genChoiceLog: [...s.genChoiceLog, { chapter: s.currentChapterIndex, tone: choice.tone, text: choice.text }],
        currentDialogueIndex: s.currentDialogueIndex + 1,
      };
    });
    debouncedDbSave(get);
  },

  advanceGeneratedChapter: async () => {
    const state = get();
    const world = state.world;
    if (!world) return false;
    const nextIndex = state.currentChapterIndex + 1;
    if (nextIndex >= world.routePlan.totalChapters) {
      // Route complete — mark the cast's routes done and return to menu.
      const completed = { ...state.affinity };
      for (const id of Object.keys(completed)) completed[id] = { ...completed[id], routeCompleted: true };
      set({ affinity: completed, screen: 'complete', storyFlags: { ...state.storyFlags, route_complete: true } });
      const s = get();
      autoSave(s);
      if (s.isLoggedIn) dbSave(s);
      return false;
    }
    set({ genLoading: true });
    const cached = state.generatedChapters[nextIndex];
    let ch: GenChapter;
    try {
      ch = cached ?? (await fetchChapter(state.seed, nextIndex, buildContextSummary(state))) ?? fallbackChapter(world, nextIndex);
    } catch {
      ch = fallbackChapter(world, nextIndex);
    }
    if (!ch.scenes?.length) ch = fallbackChapter(world, nextIndex);
    set({
      generatedChapters: { ...get().generatedChapters, [nextIndex]: ch },
      currentChapterIndex: nextIndex,
      currentSceneIndex: 0,
      currentDialogueIndex: 0,
      genLoading: false,
      currentGenPoem: null,
      screen: 'dialogue',
    });
    const s = get();
    autoSave(s);
    debouncedDbSave(get);
    // Warm the chapter after this one while the player reads.
    get().prefetchChapter(nextIndex + 1);
    return true;
  },

  // ─── Poem moments ──────────────────────────────────────────────────────────
  shouldRunPoem: () => {
    const s = get();
    if (!s.world || s.mode !== 'generated') return false;
    // A poem moment caps every odd chapter, once.
    return s.currentChapterIndex % 2 === 1 && !s.storyFlags[`poem_${s.currentChapterIndex}`];
  },

  openGenPoem: () => {
    const s = get();
    const world = s.world;
    if (!world) return;
    const chapter = s.generatedChapters[s.currentChapterIndex];
    // The character the poem is for: closest one present this chapter, else lead.
    const present = chapter?.scenes.flatMap(sc => sc.charactersPresent) ?? [];
    const ranked = [...new Set(present)].sort((a, b) => (s.affinity[b]?.affinity ?? 0) - (s.affinity[a]?.affinity ?? 0));
    const charId = ranked[0] ?? world.characters[0]?.id;
    const char = world.characters.find(c => c.id === charId) ?? world.characters[0];
    if (!char) return;
    const motif = world.motifs[s.currentChapterIndex % world.motifs.length] ?? 'what remains';
    set({
      currentGenPoem: {
        prompt: `Compose a few lines for ${char.name} — about ${motif}.`,
        characterId: char.id,
        characterName: char.name,
        words: getWordPool(24, poemCategoriesFor(world)),
      },
      screen: 'gen_poem',
    });
  },

  finishGenPoem: (selectedWordIds) => {
    const s = get();
    const poem = s.currentGenPoem;
    if (!poem) return { score: 0, reaction: '' };
    const chosen = poem.words.filter(w => selectedWordIds.includes(w.id));
    const count = chosen.length;
    let score = 50;
    score += Math.max(0, 18 - Math.abs(count - 5) * 6);
    score += new Set(chosen.map(w => w.syllables)).size * 4;
    score += Math.min(16, new Set(chosen.flatMap(w => w.categories)).size * 3);
    score = Math.max(45, Math.min(100, Math.round(score)));
    const gain = Math.round(score / 12);

    const reaction = score >= 85
      ? `${poem.characterName} goes still, then reads it again. "You… how did you know to say it like that?"`
      : score >= 68
        ? `${poem.characterName} smiles, something loosening in them. "That's good. That's really good."`
        : `${poem.characterName} reads it twice. "It's honest. That counts for more than you think."`;

    set(st => {
      const curr = st.affinity[poem.characterId];
      const newAffinity = curr ? {
        ...st.affinity,
        [poem.characterId]: { ...curr, affinity: Math.max(0, curr.affinity + gain), level: getAffinityLevel(curr.affinity + gain), poemsShared: curr.poemsShared + 1, poemsLoved: score >= 80 ? curr.poemsLoved + 1 : curr.poemsLoved },
      } : st.affinity;
      return {
        affinity: newAffinity,
        totalPoemsWritten: st.totalPoemsWritten + 1,
        storyFlags: { ...st.storyFlags, [`poem_${st.currentChapterIndex}`]: true },
      };
    });
    debouncedDbSave(get);
    return { score, reaction };
  },

  // Dialogue
  advanceDialogue: () => set(s => ({
    currentDialogueIndex: s.currentDialogueIndex + 1,
  })),

  setDialogueIndex: (index) => set({ currentDialogueIndex: index }),
  setSceneIndex: (index) => {
    set({ currentSceneIndex: index, currentDialogueIndex: 0 });
    // Auto-save on scene transition
    const state = get();
    if (state.gameStarted) {
      autoSave(state);
      debouncedDbSave(get);
    }
  },

  applyChoiceEffects: (choice) => {
    set(s => {
      const newAffinity = { ...s.affinity };
      if (choice.effects.affinity) {
        for (const [charId, change] of Object.entries(choice.effects.affinity)) {
          if (newAffinity[charId]) {
            const curr = newAffinity[charId];
            const newPoints = Math.max(0, curr.affinity + change);
            newAffinity[charId] = {
              ...curr,
              affinity: newPoints,
              level: getAffinityLevel(newPoints),
            };
          }
        }
      }
      const newFlags = { ...s.storyFlags };
      if (choice.effects.flags) {
        for (const [key, val] of Object.entries(choice.effects.flags)) {
          newFlags[key] = val;
        }
      }
      return {
        affinity: newAffinity,
        storyFlags: newFlags,
        currentDialogueIndex: s.currentDialogueIndex + 1,
      };
    });
    // Auto-save on choices (debounced)
    debouncedDbSave(get);
  },

  setStoryFlag: (key, value) => set(s => ({
    storyFlags: { ...s.storyFlags, [key]: value },
  })),

  // Puzzle
  startPuzzle: (puzzle) => set({
    currentPuzzle: puzzle,
    selectedWords: [],
    arrangedLineIds: 'lines' in puzzle ? puzzle.lines.map(l => l.id) : [],
    currentPoemScore: null,
    screen: 'type' in puzzle && puzzle.type === 'line_arrange'
      ? 'puzzle_line_arrange'
      : 'puzzle_word_select',
  }),

  toggleWord: (wordId) => set(s => {
    const puzzle = s.currentPuzzle as WordSelectPuzzleData | null;
    if (!puzzle) return s;
    const isSelected = s.selectedWords.includes(wordId);
    if (isSelected) {
      return { selectedWords: s.selectedWords.filter(id => id !== wordId) };
    }
    if (s.selectedWords.length >= puzzle.requiredWordCount) return s;
    return { selectedWords: [...s.selectedWords, wordId] };
  }),

  clearSelectedWords: () => set({ selectedWords: [] }),

  setArrangedLineIds: (ids) => set({ arrangedLineIds: ids }),

  submitPoem: (score, words, text, puzzleType) => {
    const state = get();
    const poem: PoemRecord = {
      id: `poem-${Date.now()}`,
      words,
      text,
      timestamp: Date.now(),
      chapter: state.currentChapter,
      puzzleType,
      scores: Object.fromEntries(
        Object.entries(score.characterScores).map(([k, v]) => [k, v.score])
      ),
      grade: score.grade,
    };

    // Apply affinity changes
    const newAffinity = { ...state.affinity };
    for (const [charId, charScore] of Object.entries(score.characterScores)) {
      if (newAffinity[charId]) {
        const curr = newAffinity[charId];
        const newPoints = Math.max(0, curr.affinity + charScore.affinityChange);
        newAffinity[charId] = {
          ...curr,
          affinity: newPoints,
          level: getAffinityLevel(newPoints),
          poemsShared: curr.poemsShared + 1,
          poemsLoved: charScore.score >= 80 ? curr.poemsLoved + 1 : curr.poemsLoved,
          poemsHated: charScore.score <= 30 ? curr.poemsHated + 1 : curr.poemsHated,
        };
      }
    }

    set({
      currentPoemScore: score,
      poemHistory: [...state.poemHistory, poem],
      affinity: newAffinity,
      totalPoemsWritten: state.totalPoemsWritten + 1,
      screen: 'presentation',
    });

    // Auto-save after poem (both localStorage and DB)
    setTimeout(() => {
      const s = get();
      autoSave(s);
      if (s.isLoggedIn) dbSave(s);
    }, 100);
  },

  closePoemPresentation: () => set(s => ({
    currentPoemScore: null,
    currentPuzzle: null,
    screen: 'dialogue',
    currentSceneIndex: s.currentSceneIndex + 1,
    currentDialogueIndex: 0,
  })),

  // Chapter progression
  completeChapter: () => {
    set(s => {
      const completed = s.completedChapters.includes(s.currentChapter)
        ? s.completedChapters
        : [...s.completedChapters, s.currentChapter];
      return { completedChapters: completed };
    });
    // Persist completion
    const state = get();
    autoSave(state);
    if (state.isLoggedIn) dbSave(state);
  },

  advanceToNextChapter: () => {
    const state = get();
    const nextId = getNextChapterId(state.currentChapter);
    if (!nextId || !getChapterEntry(nextId)) return false;
    set({
      currentChapter: nextId,
      currentSceneIndex: 0,
      currentDialogueIndex: 0,
      currentPuzzle: null,
      currentPoemScore: null,
      screen: 'dialogue',
    });
    // Auto-save the new chapter start
    const newState = get();
    autoSave(newState);
    debouncedDbSave(get);
    return true;
  },

  // Affinity
  updateAffinity: (characterId, change) => set(s => {
    const curr = s.affinity[characterId];
    if (!curr) return s;
    const newPoints = Math.max(0, curr.affinity + change);
    return {
      affinity: {
        ...s.affinity,
        [characterId]: {
          ...curr,
          affinity: newPoints,
          level: getAffinityLevel(newPoints),
        },
      },
    };
  }),

  // Save/Load
  saveToSlot: (slotId) => persistSave(get(), slotId),
  loadFromSlot: (slotId) => {
    const save = loadGame(slotId);
    if (!save) return false;
    set({
      ...save.state,
      screen: 'dialogue',
      previousScreen: null,
      currentPoemScore: null,
    });
    return true;
  },

  // DB persistence
  setLoggedIn: (loggedIn) => set({ isLoggedIn: loggedIn }),

  initFromServer: async () => {
    const state = get();
    if (!state.isLoggedIn) return;

    set({ isSyncing: true });
    const data = await dbLoad();
    set({ isSyncing: false });

    if (data?.saveData) {
      // Don't overwrite if user already started playing this session
      if (!state.gameStarted) {
        // Just store the fact that a save exists — don't auto-load
        // The main menu will show "Continue" based on this
      }
    }
  },

  triggerAutoSave: () => {
    const state = get();
    if (!state.gameStarted) return;
    autoSave(state);
    debouncedDbSave(get);
  },

  // Playtime
  incrementPlaytime: () => set(s => ({ playtime: s.playtime + 1 })),
}));
