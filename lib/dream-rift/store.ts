/**
 * Zustand UI store for Dream Rift.
 *
 * Holds menu / lobby / dialogue / results state and audio preferences. The
 * per-frame HUD (lives, score, boss bar, scrolling comments) is drawn on the
 * canvas by the renderer, so this store is updated infrequently (screen and
 * lobby changes, dialogue beats, run results) and never every frame — React
 * overlays stay cheap.
 */

import { create } from 'zustand';
import type { Difficulty, PlayerId, Screen } from './types';
import type { LobbySnapshot, PublicLobbyInfo } from './net/events';
import { loadBindings, saveBindings, type Bindings } from './keybinds';
import { PLAYER_IDS } from './render/sprites';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';
export type GameMode = 'single' | 'multi';

export interface DialogueView {
    speakerSide: 'left' | 'right';
    speakerName: string;
    speakerChar: PlayerId | null; // null → boss portrait
    bossThemeIndex: number;
    bossSprite: string;
    text: string;
    index: number;
    total: number;
    canAdvance: boolean;
}

export interface RunResult {
    cleared: boolean; // reached victory
    stageReached: number;
    score: number;
    graze: number;
    spellsCaptured: number;
    deaths: number;
    character: PlayerId;
    difficulty: Difficulty;
    perPlayer: { name: string; score: number; charId: PlayerId; userId: string }[];
    /** Sum of every joined player's score (co-op combined-score leaderboard). */
    combinedScore: number;
    /** Seconds the squad stayed in the run (time-survived leaderboard). */
    timeSurvived: number;
    /** Number of players in the run (1 = solo). */
    playerCount: number;
    /** Whether the local client hosted the run (only the host submits co-op runs). */
    isHost: boolean;
}

export interface DreamRiftState {
    screen: Screen;
    mode: GameMode;
    connection: ConnectionState;
    lobby: LobbySnapshot | null;
    browse: PublicLobbyInfo[];
    selfSocketId: string | null;
    errorMsg: string | null;

    difficulty: Difficulty;
    selectedChar: PlayerId;

    dialogue: DialogueView | null;
    stageBanner: { title: string; subtitle: string } | null;
    paused: boolean;
    result: RunResult | null;

    musicOn: boolean;
    sfxOn: boolean;
    musicVol: number;
    sfxVol: number;

    showHitbox: boolean;
    bindings: Bindings;

    // setters
    setScreen: (s: Screen) => void;
    setMode: (m: GameMode) => void;
    setConnection: (c: ConnectionState) => void;
    setLobby: (l: LobbySnapshot | null) => void;
    setBrowse: (b: PublicLobbyInfo[]) => void;
    setSelf: (id: string | null) => void;
    setError: (m: string | null) => void;
    setDifficulty: (d: Difficulty) => void;
    setSelectedChar: (c: PlayerId) => void;
    setDialogue: (d: DialogueView | null) => void;
    setStageBanner: (b: { title: string; subtitle: string } | null) => void;
    setPaused: (p: boolean) => void;
    setResult: (r: RunResult | null) => void;
    setMusicOn: (v: boolean) => void;
    setSfxOn: (v: boolean) => void;
    setMusicVol: (v: number) => void;
    setSfxVol: (v: number) => void;
    setShowHitbox: (v: boolean) => void;
    setBindings: (b: Bindings) => void;
    reset: () => void;
}

/** localStorage that never throws (Safari private mode, blocked site data). */
function readStore(key: string): string | null {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    } catch {
        return null;
    }
}
function writeStore(key: string, value: string): void {
    try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch {
        /* storage blocked: the preference lasts for this session only */
    }
}
function loadPref(key: string, fallback: number): number {
    const v = readStore(key);
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : fallback;
}
function loadBool(key: string, fallback: boolean): boolean {
    const v = readStore(key);
    return v == null ? fallback : v === '1';
}
function validChar(raw: string | null): PlayerId {
    return raw && (PLAYER_IDS as string[]).includes(raw) ? (raw as PlayerId) : 'bllm';
}
function validDifficulty(raw: string | null): Difficulty {
    return raw === 'easy' || raw === 'normal' || raw === 'hard' || raw === 'lunatic' ? raw : 'normal';
}
function savePref(key: string, v: number | boolean): void {
    writeStore(key, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
}

export const useDreamRift = create<DreamRiftState>((set) => ({
    screen: 'title',
    mode: 'single',
    connection: 'idle',
    lobby: null,
    browse: [],
    selfSocketId: null,
    errorMsg: null,

    difficulty: validDifficulty(readStore('dr.difficulty')),
    selectedChar: validChar(readStore('dr.char')),

    dialogue: null,
    stageBanner: null,
    paused: false,
    result: null,

    musicOn: loadBool('dr.musicOn', true),
    sfxOn: loadBool('dr.sfxOn', true),
    musicVol: loadPref('dr.musicVol', 0.6),
    sfxVol: loadPref('dr.sfxVol', 0.7),

    showHitbox: loadBool('dr.showHitbox', false),
    bindings: loadBindings(),

    setScreen: (screen) => set({ screen }),
    setMode: (mode) => set({ mode }),
    setConnection: (connection) => set({ connection }),
    setLobby: (lobby) => set({ lobby }),
    setBrowse: (browse) => set({ browse }),
    setSelf: (selfSocketId) => set({ selfSocketId }),
    setError: (errorMsg) => set({ errorMsg }),
    setDifficulty: (difficulty) => {
        writeStore('dr.difficulty', difficulty);
        set({ difficulty });
    },
    setSelectedChar: (selectedChar) => {
        writeStore('dr.char', selectedChar);
        set({ selectedChar });
    },
    setDialogue: (dialogue) => set({ dialogue }),
    setStageBanner: (stageBanner) => set({ stageBanner }),
    setPaused: (paused) => set({ paused }),
    setResult: (result) => set({ result }),
    setMusicOn: (v) => {
        savePref('dr.musicOn', v);
        set({ musicOn: v });
    },
    setSfxOn: (v) => {
        savePref('dr.sfxOn', v);
        set({ sfxOn: v });
    },
    setMusicVol: (v) => {
        savePref('dr.musicVol', v);
        set({ musicVol: v });
    },
    setSfxVol: (v) => {
        savePref('dr.sfxVol', v);
        set({ sfxVol: v });
    },
    setShowHitbox: (v) => {
        savePref('dr.showHitbox', v);
        set({ showHitbox: v });
    },
    setBindings: (b) => {
        saveBindings(b);
        set({ bindings: b });
    },
    reset: () =>
        set({
            screen: 'title',
            mode: 'single',
            connection: 'idle',
            lobby: null,
            browse: [],
            selfSocketId: null,
            errorMsg: null,
            dialogue: null,
            stageBanner: null,
            paused: false,
            result: null,
        }),
}));
