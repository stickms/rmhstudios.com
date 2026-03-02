// ─── Act & Story Types ──────────────────────────────────────────────────────

export type ActId = 'act1' | 'act2' | 'act3';

export type PuzzleType =
    | 'rune_sequence'
    | 'constellation'
    | 'shadow_match'
    | 'ward_seal'
    | 'sound_pipe'
    | 'reflection'
    | 'memory_echo'
    | 'root_network'
    | 'corrupted_glyph';

export type PuzzleStatus = 'locked' | 'discovered' | 'active' | 'solved';

export type ActPhase = 'exploring' | 'puzzle' | 'transition';

export type JournalCategory = 'lore' | 'hint' | 'creature' | 'history' | 'personal' | 'landmark';

// ─── Puzzle Definitions ─────────────────────────────────────────────────────

export interface PuzzleDefinition {
    id: string;
    type: PuzzleType;
    act: ActId;
    title: string;
    description: string;
    difficulty: 'easy' | 'medium' | 'hard';
    estimatedMinutes: number;
    landmarkId: string;
    /** Puzzle-specific config data (grid size, pattern, etc.) */
    config: Record<string, unknown>;
    /** World event triggered on solve */
    worldEvent?: string;
    /** Journal entry IDs that provide hints for this puzzle */
    hintEntryIds?: string[];
}

// ─── Interactable Definitions ───────────────────────────────────────────────

export type InteractableType = 'puzzle_stone' | 'journal_item' | 'landmark' | 'portal';

export type RevealMethod = 'always_visible' | 'flashlight_only' | 'proximity';

export interface InteractableDefinition {
    id: string;
    act: ActId;
    type: InteractableType;
    label: string;
    position: [number, number, number];
    revealMethod: RevealMethod;
    interactionRadius: number;
    flashlightAngle?: number;
    /** ID of puzzle to activate */
    puzzleId?: string;
    /** ID of journal entry to discover */
    journalEntryId?: string;
}

// ─── Journal ────────────────────────────────────────────────────────────────

export interface JournalEntryData {
    id: string;
    act: ActId;
    category: JournalCategory;
    title: string;
    content: string;
    /** 0 = pure lore, 1 = subtle hint, 2 = direct hint */
    hintLevel: 0 | 1 | 2;
    relatedPuzzleId?: string;
}

// ─── Act Map Config ─────────────────────────────────────────────────────────

export interface AtmosphereConfig {
    fogColor: string;
    fogNear: number;
    fogFar: number;
    ambientColor: string;
    ambientIntensity: number;
    directionalColor: string;
    directionalIntensity: number;
    directionalPosition: [number, number, number];
    backgroundColor: string;
    showSky: boolean;
    showStars: boolean;
    starCount: number;
    showMoon: boolean;
    firefliesIntensity: number;
}

export interface CorridorSegment {
    start: [number, number];
    end: [number, number];
    width: number;
}

export interface LandmarkPlacement {
    id: string;
    type: string;
    position: [number, number, number];
    rotation?: [number, number, number];
    scale?: number;
}

export interface ActMapConfig {
    id: ActId;
    name: string;
    mapRadius: number;
    treeSeed: number;
    treeCount: number;
    rockCount: number;
    mushroomCount: number;
    atmosphere: AtmosphereConfig;
    corridors: CorridorSegment[];
    landmarks: LandmarkPlacement[];
    portalPosition?: [number, number, number];
}

// ─── Save System ────────────────────────────────────────────────────────────

export interface ActProgress {
    puzzlesSolved: string[];
    journalEntriesFound: string[];
    landmarksVisited: string[];
    checkpointPosition: [number, number, number];
    checkpointRotation: [number, number];
}

export interface PuzzleState {
    status: PuzzleStatus;
    attemptCount: number;
    partialState?: unknown;
}

export interface ForestExplorerSave {
    version: 1;
    savedAt: number;
    currentAct: ActId;
    playtime: number;
    actProgress: Record<ActId, ActProgress>;
    puzzleStates: Record<string, PuzzleState>;
    journalEntries: string[];
    storyFlags: Record<string, boolean>;
}
