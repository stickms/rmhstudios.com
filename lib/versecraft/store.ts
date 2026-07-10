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
import { createWorldWithOpening, fetchChapter, fetchOutline } from './gen/client';
import { makeSeedCode, normalizeSeed } from './gen/rng';
import { choicePathHash } from './gen/choice-path';
import { buildSkeletonOutline, beatForChapter } from './gen/outline';
import { getWordPool } from './words';
import type { GeneratedWorld, GenChapter, GenChoice, LedgerEntry } from './gen/world-types';
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
    customPronouns: '',
    attraction: 'everyone',
    characterPresentations: presentations,
    spritePack: 'default' as const,
    textSpeed: 'normal' as const,
    musicVolume: 0.7,
    sfxVolume: 0.8,
    matureDefault: true,
    reducedMotion: false,
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
    ledger: [],
    outline: null,
  };
}

// Dedupe in-flight chapter generations (prefetch + on-demand) by seed:index so
// we never fire two DeepSeek calls for the same chapter.
const chapterInFlight = new Set<string>();

/** The outline beat for the current chapter, from the player's outline (skeleton
 *  if Tier-2 hasn't enriched yet). */
function beatFor(state: GameState & GameActions, index: number) {
  const outline = state.outline ?? (state.world ? buildSkeletonOutline(state.world) : null);
  return outline ? beatForChapter(outline, index) : undefined;
}

/** The cache-key hash of the player's committed choices, derived from the choice
 *  log so there is no second array to keep in sync. */
function pathHash(state: GameState & GameActions): string {
  return choicePathHash(state.genChoiceLog.map(c => ({
    chapter: c.chapter, tone: c.tone, label: c.direction ?? c.text,
  })));
}

/** A compact "live player signal" fed alongside the ledger: the direction of the
 *  player's recent choices, who they've grown closest to, and notable flags. The
 *  ledger says what HAPPENED; this says what the player has been DOING and wanting,
 *  so the next chapter follows the path they set (not just a tone average). */
function buildChoiceContext(state: GameState & GameActions): string {
  const world = state.world;
  if (!world) return '';
  const nameOf = (id: string) => world.characters.find(c => c.id === id)?.name ?? id;

  const recentChoices = state.genChoiceLog.slice(-4)
    .map(c => c.direction ? `chose to ${c.direction}` : `answered ${c.tone}`)
    .join('; ');

  const bonds = Object.entries(state.affinity)
    .filter(([, a]) => a.affinity > 0)
    .sort((a, b) => b[1].affinity - a[1].affinity)
    .slice(0, 3)
    .map(([id, a]) => `${nameOf(id)} (closeness ${a.affinity})`)
    .join(', ');

  const flags = Object.entries(state.storyFlags)
    .filter(([k]) => !k.startsWith('poem_') && k !== 'route_complete')
    .slice(-5)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');

  return [
    recentChoices && `Recently the player ${recentChoices}.`,
    bonds && `Closest bonds: ${bonds}.`,
    flags && `Active flags: ${flags}.`,
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

/** Fill the cohesion-harness fields for saves written before they existed, so
 *  loading an old generated save never yields undefined ledger/outline. */
function genLoadDefaults(s: Partial<GameState>): Pick<GameState, 'ledger' | 'outline'> {
  return {
    ledger: s.ledger ?? [],
    outline: s.outline ?? null,
  };
}

/** Merge a chapter's ledger entry into state (replacing any prior entry for that
 *  index so re-streams don't duplicate). */
function absorbLedger(
  get: () => GameState & GameActions,
  set: (partial: Partial<GameState & GameActions>) => void,
  entry: LedgerEntry,
): void {
  const ledger = get().ledger.filter((e) => e.index !== entry.index);
  ledger.push(entry);
  ledger.sort((a, b) => a.index - b.index);
  set({ ledger });
}

// Dedupe concurrent generation of the same (seed, index, choicePathHash) across
// prefetch + advance, so DeepSeek runs at most once and the client slot and the
// persisted row hold the same prose (a chapter ending on a choice node fires both
// the prefetch effect and the auto-advance in one commit).
const chapterPromises = new Map<string, Promise<GenChapter | null>>();

/** Generate + cache chapter `index` under the current choice path, sharing one
 *  in-flight request across all callers. Stores the result in `generatedChapters`
 *  and absorbs its ledger entry. Returns the stored chapter (or null on failure). */
function loadChapterOnce(
  get: () => GameState & GameActions,
  set: (partial: Partial<GameState & GameActions>) => void,
  index: number,
): Promise<GenChapter | null> {
  const s = get();
  const world = s.world;
  if (!world) return Promise.resolve(null);
  const key = `${s.seed}:${index}:${pathHash(s)}`;
  const inFlight = chapterPromises.get(key);
  if (inFlight) return inFlight;
  const p = (async (): Promise<GenChapter | null> => {
    try {
      const res = await fetchChapter(s.seed, index, {
        choicePathHash: pathHash(get()),
        beat: beatFor(get(), index),
        ledger: get().ledger,
        context: buildChoiceContext(get()),
      });
      const ch = (res?.chapter && res.chapter.scenes?.length) ? res.chapter : fallbackChapter(world, index);
      if (res?.ledgerEntry) absorbLedger(get, set, res.ledgerEntry);
      if (!get().generatedChapters[index]) {
        set({ generatedChapters: { ...get().generatedChapters, [index]: ch } });
      }
      return get().generatedChapters[index] ?? ch;
    } catch {
      return null;
    } finally {
      chapterPromises.delete(key);
    }
  })();
  chapterPromises.set(key, p);
  return p;
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
  /** Generate + cache a chapter in the background (no UI block) so it's ready
   *  by the time the player reaches it. */
  prefetchChapter: (index: number) => void;
  /** Stream the remaining scenes of a partial chapter in the background. */
  streamChapterRest: (index: number) => void;
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
          ...genLoadDefaults(savedState),
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
        ...genLoadDefaults(save.state),
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
    const attraction = get().settings.attraction ?? 'everyone';
    set({ genLoading: true });

    // One round trip: world + opening scene together (server-first, persisted,
    // shareable). Anything that goes wrong degrades to the instant local
    // generator — never a crash, never a long stall.
    let base: GeneratedWorld = fallbackWorld(cleanSeed, prompt ?? '', name, pronouns);
    let openingChapter: GenChapter | null = null;
    let streamRest = false;
    try {
      const res = await createWorldWithOpening(cleanSeed, prompt ?? '', pronouns, attraction);
      if (res) {
        base = res.world;
        if (res.opening) { openingChapter = res.opening.chapter; streamRest = res.opening.partial; }
      }
    } catch { /* keep local fallback world */ }

    // Show the player's own name regardless of how the canonical world was made.
    const world: GeneratedWorld = { ...base, seed: cleanSeed, mc: { ...base.mc, name, attraction: base.mc.attraction ?? attraction } };
    let ch0: GenChapter = openingChapter ?? fallbackChapter(world, 0);
    if (!ch0.scenes?.length) { ch0 = fallbackChapter(world, 0); streamRest = false; }

    const skeleton = buildSkeletonOutline(world);
    set({
      ...createInitialState(),
      mode: 'generated',
      seed: cleanSeed,
      mcPrompt: prompt ?? '',
      world,
      outline: skeleton,
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
    // Stream in the rest of the opening chapter while the player reads scene 1.
    if (streamRest) get().streamChapterRest(0);
    // NOTE: the next chapter is intentionally NOT warmed here — it's warmed only
    // once the player reaches chapter 0's final scene (so the choices that re-key
    // it are committed first). See GeneratedDialogueScreen's final-scene prefetch.
    // Enrich the outline (Tier-2) in the background; ready before chapter 1.
    (async () => {
      const detailed = await fetchOutline(cleanSeed, [], 1);
      if (detailed) set({ outline: detailed });
    })();
  },

  streamChapterRest: (index) => {
    const s = get();
    const world = s.world;
    const ch = s.generatedChapters[index];
    if (!world || !ch || !ch.partial) return;
    const key = `stream:${s.seed}:${index}`;
    if (chapterInFlight.has(key)) return;
    chapterInFlight.add(key);
    const opening = ch.scenes[0];
    (async () => {
      try {
        const res = await fetchChapter(s.seed, index, {
          choicePathHash: pathHash(get()),
          beat: beatFor(get(), index),
          ledger: get().ledger,
          context: buildChoiceContext(get()),
          opening,
        });
        const full = res?.chapter;
        const merged = (full && full.scenes?.length) ? full : { ...ch, partial: false };
        set({ generatedChapters: { ...get().generatedChapters, [index]: { ...merged, partial: false } } });
        if (res?.ledgerEntry) absorbLedger(get, set, res.ledgerEntry);
        const st = get();
        autoSave(st);
        debouncedDbSave(get);
      } catch {
        // Leave the opening playable; mark complete so the player isn't stuck.
        const cur = get().generatedChapters[index];
        if (cur) set({ generatedChapters: { ...get().generatedChapters, [index]: { ...cur, partial: false } } });
      } finally {
        chapterInFlight.delete(key);
      }
    })();
  },

  prefetchChapter: (index) => {
    const s = get();
    const world = s.world;
    if (!world || index < 0 || index >= world.routePlan.totalChapters) return;
    if (s.generatedChapters[index]) return;        // already have it
    // Fire and forget — loadChapterOnce dedups against a concurrent advance.
    void loadChapterOnce(get, set, index);
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
        genChoiceLog: [...s.genChoiceLog, { chapter: s.currentChapterIndex, tone: choice.tone, text: choice.text, direction: choice.direction }],
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
      // Shares one in-flight request with any prefetch already warming this
      // chapter under the same path, so we never double-generate it.
      ch = cached ?? (await loadChapterOnce(get, set, nextIndex)) ?? fallbackChapter(world, nextIndex);
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
    // The chapter after this one is warmed by the final-scene prefetch once the
    // player reaches the end of THIS chapter (so its choices are committed first).
    // Crossed into a new act → revise the remaining outline from the path so far.
    const prevAct = state.outline ? beatForChapter(state.outline, state.currentChapterIndex).act : 1;
    const nextAct = get().outline ? beatForChapter(get().outline!, nextIndex).act : 1;
    if (nextAct > prevAct) {
      (async () => {
        const revised = await fetchOutline(get().seed, get().ledger, nextAct);
        if (revised) set({ outline: revised });
      })();
    }
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
      ...genLoadDefaults(save.state),
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
