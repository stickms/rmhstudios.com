import { create } from 'zustand';
import type { ActId, ActPhase, PuzzleState, ActProgress, ForestExplorerSave } from './types';
import { saveGame, loadGame, createNewSave, dbSave, dbLoad } from './saveSystem';
import { getPuzzleById } from './puzzleDefinitions';
import { getEntryById } from '@/components/forest-explorer/story/journal/journalData';

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

        // Increment shift counter for Act 2 tree shift events
        const treesShiftCount = puzzle.worldEvent === 'trees_calm_briefly'
            ? state.treesShiftCount + 1
            : state.treesShiftCount;

        set({
            puzzleStates,
            actProgress: actProg,
            storyFlags,
            treesShiftCount,
            showPuzzleOverlay: false,
            activePuzzleId: null,
            actPhase: 'exploring',
        });

        // Auto-save
        get().saveProgress();
    },

    openPuzzle: (puzzleId: string) => {
        const state = get();
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
        });
        get().saveProgress();
    },

    setStoryFlag: (flag, value) => {
        set((s) => ({ storyFlags: { ...s.storyFlags, [flag]: value } }));
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
