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
import type { GeneratedWorld, GenChapter, GenChoice } from './gen/world-types';

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
  };
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
  startGeneratedGame: (opts: { seed?: string; prompt?: string; playerName?: string }) => Promise<void>;
  ensureGeneratedChapter: (index: number) => Promise<GenChapter>;
  genApplyChoice: (choice: GenChoice) => void;
  advanceGeneratedChapter: () => Promise<boolean>;

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

  startGeneratedGame: async ({ seed, prompt, playerName }) => {
    const cleanSeed = seed && seed.trim()
      ? normalizeSeed(seed)
      : makeSeedCode(`${Date.now()}-${Math.random()}`);
    const name = playerName || get().settings.playerName || 'You';
    const pronouns = get().settings.playerPronouns;
    set({ genLoading: true });

    // Server-first (DeepSeek + persisted, shareable); deterministic local fallback.
    const remote = await fetchOrCreateWorld(cleanSeed, prompt ?? '', pronouns);
    const base = remote ?? fallbackWorld(cleanSeed, prompt ?? '', name, pronouns);
    // Show the player's own name regardless of how the canonical world was made.
    const world: GeneratedWorld = { ...base, seed: cleanSeed, mc: { ...base.mc, name } };

    const remoteCh0 = await fetchChapter(cleanSeed, 0);
    const ch0 = remoteCh0 ?? fallbackChapter(world, 0);

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
  },

  ensureGeneratedChapter: async (index) => {
    const state = get();
    const cached = state.generatedChapters[index];
    if (cached) return cached;
    const world = state.world;
    if (!world) throw new Error('ensureGeneratedChapter: no world');
    const remote = await fetchChapter(state.seed, index);
    const ch = remote ?? fallbackChapter(world, index);
    set({ generatedChapters: { ...get().generatedChapters, [index]: ch } });
    return ch;
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
      set({ affinity: completed, screen: 'menu', storyFlags: { ...state.storyFlags, route_complete: true } });
      const s = get();
      autoSave(s);
      if (s.isLoggedIn) dbSave(s);
      return false;
    }
    set({ genLoading: true });
    const cached = state.generatedChapters[nextIndex];
    const ch = cached ?? (await fetchChapter(state.seed, nextIndex)) ?? fallbackChapter(world, nextIndex);
    set({
      generatedChapters: { ...get().generatedChapters, [nextIndex]: ch },
      currentChapterIndex: nextIndex,
      currentSceneIndex: 0,
      currentDialogueIndex: 0,
      genLoading: false,
      screen: 'dialogue',
    });
    const s = get();
    autoSave(s);
    debouncedDbSave(get);
    return true;
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
