import { create } from 'zustand';
import type { ActId, ActPhase, PuzzleState, ActProgress, ForestExplorerSave } from './types';
import { saveGame, loadGame, createNewSave, dbSave, dbLoad } from './saveSystem';
import { getPuzzleById, getPuzzlesByAct, isPuzzleLocked } from './puzzleDefinitions';
import { getEntryById } from '@/components/forest-explorer/story/journal/journalData';

// ─── Narration beats (letterboxed story text) ───────────────────────────────

const ACT_INTRO_NARRATION: Record<ActId, string[]> = {
    act1: [
        'The forest is old, and it is forgetting.',
        'Somewhere ahead, a Warden walked this path before you. Follow the lanterns. Wake the stones.',
    ],
    act2: [
        'Beyond the gate, the deep wood thrashes in its sleep.',
        'Calm the wind, the light, and the echoes — and the fever will break.',
    ],
    act3: [
        'Dawn gathers at the edge of the grove, held back by a purple forgetting.',
        'The Heartwood waits at the end of the Warden\'s trail. Finish the song.',
    ],
};

const GATEWAY_NARRATION: Record<string, string[]> = {
    act1_gateway_opened: ['The arch exhales a slow blue light.', 'The deep wood is open — it was waiting for you.'],
    act2_gateway_opened: ['The roots unknot. The canopy stills.', 'Beyond, the sky is thinking about morning.'],
};

// ─── State shape ────────────────────────────────────────────────────────────

interface StoryState {
    // Act tracking
    currentAct: ActId;
    actPhase: ActPhase;
    actProgress: Record<ActId, ActProgress>;

    // Puzzles
    puzzleStates: Record<string, PuzzleState>;
    activePuzzleId: string | null;
    showPuzzleOverlay: boolean;

    // Journal
    discoveredEntries: string[];
    journalOpen: boolean;

    // Interaction
    nearbyInteractable: string | null;
    flashlightRevealedIds: string[];

    // Player
    playerPosition: [number, number, number];
    playerRotation: [number, number];
    flashlightOn: boolean;

    // Toast
    toastMessage: string | null;

    // Narration (letterboxed story lines, advanced by click/E)
    narrationLines: string[] | null;

    // Meta
    playtime: number;
    storyFlags: Record<string, boolean>;
    /** Counter that increments each time a trees_calm_briefly event fires (Act 2) */
    treesShiftCount: number;
    isLoggedIn: boolean;
    initialized: boolean;

    // Actions
    showToast: (msg: string) => void;
    dismissToast: () => void;
    showNarration: (lines: string[]) => void;
    dismissNarration: () => void;
    initializeGame: (isLoggedIn: boolean) => Promise<void>;
    newGame: () => void;
    solvePuzzle: (puzzleId: string) => void;
    openPuzzle: (puzzleId: string) => void;
    closePuzzle: () => void;
    incrementAttempt: (puzzleId: string) => void;
    discoverEntry: (entryId: string) => void;
    toggleJournal: () => void;
    setNearbyInteractable: (id: string | null) => void;
    setFlashlightRevealed: (ids: string[]) => void;
    visitLandmark: (landmarkId: string, label?: string) => void;
    setPlayerPosition: (pos: [number, number, number]) => void;
    setPlayerRotation: (rot: [number, number]) => void;
    setFlashlight: (on: boolean) => void;
    advanceToAct: (act: ActId) => void;
    setStoryFlag: (flag: string, value: boolean) => void;
    incrementTreeSeedOffset: () => void;
    saveProgress: () => void;
    loadProgress: () => Promise<boolean>;
    tickPlaytime: (delta: number) => void;
}

// ─── Default progress ───────────────────────────────────────────────────────

function defaultActProgress(): ActProgress {
    return {
        puzzlesSolved: [],
        journalEntriesFound: [],
        landmarksVisited: [],
        checkpointPosition: [0, 1.7, 0],
        checkpointRotation: [0, 0],
    };
}

// ─── Debounced DB sync ──────────────────────────────────────────────────────

let dbSyncTimeout: ReturnType<typeof setTimeout> | null = null;
function debouncedDbSync(save: ForestExplorerSave) {
    if (dbSyncTimeout) clearTimeout(dbSyncTimeout);
    dbSyncTimeout = setTimeout(() => {
        dbSave(save).catch(() => {});
    }, 2000);
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useStoryStore = create<StoryState>((set, get) => ({
    // Initial state
    currentAct: 'act1',
    actPhase: 'exploring',
    actProgress: {
        act1: defaultActProgress(),
        act2: defaultActProgress(),
        act3: defaultActProgress(),
    },
    puzzleStates: {},
    activePuzzleId: null,
    showPuzzleOverlay: false,
    discoveredEntries: [],
    journalOpen: false,
    nearbyInteractable: null,
    flashlightRevealedIds: [],
    playerPosition: [0, 1.7, 0],
    playerRotation: [0, 0],
    flashlightOn: true,
    toastMessage: null,
    narrationLines: null,
    playtime: 0,
    storyFlags: {},
    treesShiftCount: 0,
    isLoggedIn: false,
    initialized: false,

    // ─── Actions ────────────────────────────────────────────────────────────

    showToast: (msg: string) => {
        set({ toastMessage: msg });
        setTimeout(() => {
            if (useStoryStore.getState().toastMessage === msg) {
                set({ toastMessage: null });
            }
        }, 3000);
    },

    dismissToast: () => set({ toastMessage: null }),

    showNarration: (lines: string[]) => set({ narrationLines: lines }),
    dismissNarration: () => set({ narrationLines: null }),

    initializeGame: async (isLoggedIn: boolean) => {
        set({ isLoggedIn });

        // Try localStorage first
        let save = loadGame();

        // If logged in, also try DB and take the newer one
        if (isLoggedIn) {
            const dbSaveData = await dbLoad();
            if (dbSaveData) {
                if (!save || dbSaveData.savedAt > save.savedAt) {
                    save = dbSaveData;
                }
            }
        }

        if (save) {
            set({
                currentAct: save.currentAct,
                actProgress: save.actProgress,
                puzzleStates: save.puzzleStates,
                discoveredEntries: save.journalEntries,
                playtime: save.playtime,
                storyFlags: save.storyFlags,
                playerPosition: save.actProgress[save.currentAct].checkpointPosition,
                playerRotation: save.actProgress[save.currentAct].checkpointRotation,
                initialized: true,
            });
        } else {
            set({ initialized: true });
        }
    },

    newGame: () => {
        const fresh = createNewSave();
        set({
            currentAct: 'act1',
            actPhase: 'exploring',
            actProgress: fresh.actProgress,
            puzzleStates: {},
            activePuzzleId: null,
            showPuzzleOverlay: false,
            discoveredEntries: [],
            journalOpen: false,
            nearbyInteractable: null,
            flashlightRevealedIds: [],
            playerPosition: [0, 1.7, 0],
            playerRotation: [0, 0],
            flashlightOn: true,
            toastMessage: null,
            narrationLines: ACT_INTRO_NARRATION.act1,
            playtime: 0,
            storyFlags: {},
            treesShiftCount: 0,
            initialized: true,
        });
        saveGame(fresh);
    },

    solvePuzzle: (puzzleId: string) => {
        const state = get();
        const puzzle = getPuzzleById(puzzleId);
        if (!puzzle) return;

        const puzzleStates = {
            ...state.puzzleStates,
            [puzzleId]: {
                ...state.puzzleStates[puzzleId],
                status: 'solved' as const,
            },
        };

        const actProg = { ...state.actProgress };
        const currentProg = { ...actProg[state.currentAct] };
        if (!currentProg.puzzlesSolved.includes(puzzleId)) {
            currentProg.puzzlesSolved = [...currentProg.puzzlesSolved, puzzleId];
        }
        actProg[state.currentAct] = currentProg;

        const storyFlags = puzzle.worldEvent
            ? { ...state.storyFlags, [puzzle.worldEvent]: true }
            : state.storyFlags;

        set({
            puzzleStates,
            actProgress: actProg,
            storyFlags,
        });

        // Gateway world events get a narration beat
        if (puzzle.worldEvent && GATEWAY_NARRATION[puzzle.worldEvent]) {
            set({ narrationLines: GATEWAY_NARRATION[puzzle.worldEvent] });
        }

        // Story auto-discoveries driven by act 3 restoration progress
        if (puzzle.act === 'act3') {
            const act3Ids = getPuzzlesByAct('act3').map(p => p.id);
            const solvedCount = act3Ids.filter(id => puzzleStates[id]?.status === 'solved').length;
            if (solvedCount === 1) get().discoverEntry('act3_corruption');
            if (solvedCount === 3) get().discoverEntry('act3_final_lore');
        }

        // Auto-save
        get().saveProgress();
    },

    openPuzzle: (puzzleId: string) => {
        const state = get();

        // Gateway puzzles stay sealed until the act's other mysteries are solved
        if (isPuzzleLocked(puzzleId, state.puzzleStates)) {
            const puzzle = getPuzzleById(puzzleId);
            get().showToast(puzzle?.lockedHint ?? 'Something still binds this seal.');
            const current = state.puzzleStates[puzzleId];
            if (current?.status !== 'discovered') {
                set({
                    puzzleStates: {
                        ...state.puzzleStates,
                        [puzzleId]: {
                            status: 'discovered',
                            attemptCount: current?.attemptCount ?? 0,
                            partialState: current?.partialState,
                        },
                    },
                });
            }
            return;
        }

        const current = state.puzzleStates[puzzleId];
        const newStatus = current?.status === 'solved' ? 'solved' : 'active';

        set({
            activePuzzleId: puzzleId,
            showPuzzleOverlay: true,
            actPhase: 'puzzle',
            puzzleStates: {
                ...state.puzzleStates,
                [puzzleId]: {
                    status: newStatus as PuzzleState['status'],
                    attemptCount: current?.attemptCount ?? 0,
                    partialState: current?.partialState,
                },
            },
        });
    },

    closePuzzle: () => {
        set({
            showPuzzleOverlay: false,
            activePuzzleId: null,
            actPhase: 'exploring',
        });
    },

    incrementAttempt: (puzzleId: string) => {
        const state = get();
        const current = state.puzzleStates[puzzleId];
        set({
            puzzleStates: {
                ...state.puzzleStates,
                [puzzleId]: {
                    ...current,
                    status: current?.status ?? 'active',
                    attemptCount: (current?.attemptCount ?? 0) + 1,
                },
            },
        });
    },

    discoverEntry: (entryId: string) => {
        const state = get();
        if (state.discoveredEntries.includes(entryId)) return;

        const discoveredEntries = [...state.discoveredEntries, entryId];

        const actProg = { ...state.actProgress };
        const currentProg = { ...actProg[state.currentAct] };
        if (!currentProg.journalEntriesFound.includes(entryId)) {
            currentProg.journalEntriesFound = [...currentProg.journalEntriesFound, entryId];
        }
        actProg[state.currentAct] = currentProg;

        set({ discoveredEntries, actProgress: actProg });

        // Show toast with entry title
        const entry = getEntryById(entryId);
        if (entry) {
            get().showToast(`Journal Updated: ${entry.title}`);
        }

        get().saveProgress();
    },

    toggleJournal: () => set((s) => ({ journalOpen: !s.journalOpen })),

    setNearbyInteractable: (id) => set({ nearbyInteractable: id }),

    setFlashlightRevealed: (ids) => set({ flashlightRevealedIds: ids }),

    visitLandmark: (landmarkId: string, label?: string) => {
        const state = get();
        const actProg = { ...state.actProgress };
        const currentProg = { ...actProg[state.currentAct] };
        if (!currentProg.landmarksVisited.includes(landmarkId)) {
            currentProg.landmarksVisited = [...currentProg.landmarksVisited, landmarkId];
            currentProg.checkpointPosition = [...state.playerPosition];
            currentProg.checkpointRotation = [...state.playerRotation];
            actProg[state.currentAct] = currentProg;
            set({ actProgress: actProg });
            if (label) {
                get().showToast(`Checkpoint: ${label}`);
            }
            get().saveProgress();
        }
    },

    setPlayerPosition: (pos) => set({ playerPosition: pos }),
    setPlayerRotation: (rot) => set({ playerRotation: rot }),
    setFlashlight: (on) => set({ flashlightOn: on }),

    advanceToAct: (act: ActId) => {
        set({
            currentAct: act,
            actPhase: 'exploring',
            activePuzzleId: null,
            showPuzzleOverlay: false,
            nearbyInteractable: null,
            flashlightRevealedIds: [],
            playerPosition: [0, 1.7, 0],
            playerRotation: [0, 0],
            narrationLines: ACT_INTRO_NARRATION[act] ?? null,
        });
        // The explorer writes an opening journal entry as each act begins
        if (act === 'act2') get().discoverEntry('act2_intro');
        if (act === 'act3') get().discoverEntry('act3_intro');
        get().saveProgress();
    },

    setStoryFlag: (flag, value) => {
        set((s) => ({ storyFlags: { ...s.storyFlags, [flag]: value } }));
    },

    incrementTreeSeedOffset: () => {
        const next = get().treesShiftCount + 1;
        set({ treesShiftCount: next });
        // The explorer records the shifting after living through it
        if (next === 1) {
            setTimeout(() => get().discoverEntry('act2_shifting_trees'), 2500);
        }
        if (next === 3) {
            setTimeout(() => get().discoverEntry('act2_calm_returns'), 2500);
        }
    },

    saveProgress: () => {
        const state = get();
        const save: ForestExplorerSave = {
            version: 1,
            savedAt: Date.now(),
            currentAct: state.currentAct,
            playtime: state.playtime,
            actProgress: state.actProgress,
            puzzleStates: state.puzzleStates,
            journalEntries: state.discoveredEntries,
            storyFlags: state.storyFlags,
        };
        saveGame(save);
        if (state.isLoggedIn) {
            debouncedDbSync(save);
        }
    },

    loadProgress: async () => {
        const state = get();
        let save = loadGame();
        if (state.isLoggedIn) {
            const remote = await dbLoad();
            if (remote && (!save || remote.savedAt > save.savedAt)) {
                save = remote;
            }
        }
        if (!save) return false;

        set({
            currentAct: save.currentAct,
            actProgress: save.actProgress,
            puzzleStates: save.puzzleStates,
            discoveredEntries: save.journalEntries,
            playtime: save.playtime,
            storyFlags: save.storyFlags,
            playerPosition: save.actProgress[save.currentAct].checkpointPosition,
            playerRotation: save.actProgress[save.currentAct].checkpointRotation,
        });
        return true;
    },

    tickPlaytime: (delta: number) => {
        set((s) => ({ playtime: s.playtime + delta }));
    },
}));
