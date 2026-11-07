// ============================================================
// Zustand Game Store — menus, lobby, and the active runtime
// ============================================================

import { create } from 'zustand';
import type { FighterClass, GamePhase, MatchMode } from '@/lib/kowloon-knockout/game/fighters/types';
import type { MatchConfig, SeatConfig } from '@/lib/kowloon-knockout/game/config';
import { defaultSeatName } from '@/lib/kowloon-knockout/game/config';
import { ALL_FIGHTERS } from '@/lib/kowloon-knockout/game/fighters/stats';
import { DEFAULT_FIGHTER_MODEL, sanitizeFighterModelId } from '@/lib/kowloon-knockout/render/fighter/models';
import { randomAiModel } from '@/lib/kowloon-knockout/render/fighter/aiPool';
import type { MatchSeat, LobbySeat } from '@/lib/kowloon-knockout/net/client';
import type { HudFighter } from '@/lib/kowloon-knockout/net/session';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'waiting' | 'ready' | 'playing';

/** Everything GameView needs to instantiate the correct session. */
export type Runtime =
    | { kind: 'local'; config: MatchConfig; training?: boolean }
    | { kind: 'host'; config: MatchConfig }
    | { kind: 'guest'; seats: MatchSeat[]; localSeat: number; mode: MatchMode };

export interface MatchResult {
    winnerSeat: number | null;
    mode: MatchMode;
    fighters: HudFighter[];
}

interface GameStore {
    phase: GamePhase;
    setPhase: (phase: GamePhase) => void;

    selectedClass: FighterClass;
    setSelectedClass: (c: FighterClass) => void;

    /** Fighter model id (render/fighter/models.ts); persisted in the browser. */
    selectedModel: string;
    setSelectedModel: (id: string) => void;

    // Local match setup
    mode: MatchMode;
    playerCount: number;       // 2..4
    aiDifficulty: number;      // 0..1
    maxRounds: number;
    setMode: (m: MatchMode) => void;
    setPlayerCount: (n: number) => void;
    setAiDifficulty: (d: number) => void;

    // Multiplayer / lobby
    isMultiplayer: boolean;
    isHost: boolean;
    roomCode: string | null;
    isPublic: boolean;
    connectionStatus: ConnectionStatus;
    localSeat: number;
    lobbySeats: LobbySeat[];
    setMultiplayer: (v: boolean) => void;
    setRoomCode: (c: string | null) => void;
    setConnectionStatus: (s: ConnectionStatus) => void;
    setLobby: (info: { you: number; seats: LobbySeat[]; mode: MatchMode; arenaSize: number; maxRounds: number; isHost: boolean; code: string; isPublic: boolean }) => void;
    resetMultiplayer: () => void;

    // Active runtime
    runtime: Runtime | null;
    matchResult: MatchResult | null;
    setMatchResult: (r: MatchResult | null) => void;

    mpError: string | null;
    setMpError: (e: string | null) => void;
    /** Our own link is down and being retried (a match is running). */
    netReconnecting: boolean;
    setNetReconnecting: (v: boolean) => void;
    /** Seats whose player's link is down; the hub holds the seat for a few seconds. */
    offlineSeats: number[];
    setSeatOnline: (seat: number, online: boolean) => void;
    clearLobbyRoom: () => void;

    startLocalMatch: () => void;
    startTraining: () => void;
    startHostMatch: (seats: MatchSeat[], mode: MatchMode, maxRounds: number, aiDifficulty: number, localSeat: number) => void;
    startGuestMatch: (seats: MatchSeat[], mode: MatchMode, localSeat: number) => void;

    resetGame: () => void;
}

const MODEL_STORAGE_KEY = 'kk-fighter-model';

/** The remembered model, or the default. Never throws (private windows, SSR). */
export function readStoredModel(): string {
    try {
        if (typeof localStorage === 'undefined') return DEFAULT_FIGHTER_MODEL;
        return sanitizeFighterModelId(localStorage.getItem(MODEL_STORAGE_KEY));
    } catch { return DEFAULT_FIGHTER_MODEL; }
}

function writeStoredModel(id: string): void {
    try { localStorage.setItem(MODEL_STORAGE_KEY, id); } catch { /* storage unavailable: choice lasts the session */ }
}

function randomClasses(count: number, exclude: FighterClass): FighterClass[] {
    const pool = ALL_FIGHTERS.filter((c) => c !== exclude);
    const out: FighterClass[] = [];
    for (let i = 0; i < count; i++) {
        out.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    return out;
}

/** Build a single-player MatchConfig (seat 0 = you, the rest CPU). */
function buildLocalConfig(selected: FighterClass, playerCount: number, mode: MatchMode, aiDifficulty: number, maxRounds: number, selectedModel: string): MatchConfig {
    const aiClasses = randomClasses(playerCount - 1, selected);
    const seats: SeatConfig[] = [];
    for (let i = 0; i < playerCount; i++) {
        const className = i === 0 ? selected : aiClasses[i - 1];
        const kind = i === 0 ? 'human-local' : 'ai';
        seats.push({
            seat: i,
            className,
            modelId: i === 0 ? selectedModel : randomAiModel(),
            team: mode === 'teams' ? i % 2 : i,
            kind,
            displayName: i === 0 ? 'YOU' : defaultSeatName(i, className, 'ai'),
        });
    }
    return { mode, maxRounds, aiDifficulty, seats };
}

/** Convert server match seats (human/ai + `you`) into a host MatchConfig. */
function buildHostConfig(seats: MatchSeat[], mode: MatchMode, maxRounds: number, aiDifficulty: number, localSeat: number): MatchConfig {
    return {
        mode,
        maxRounds,
        aiDifficulty,
        seats: seats.map((s) => ({
            seat: s.seat,
            className: s.className,
            modelId: s.modelId,
            team: s.team,
            kind: s.seat === localSeat ? 'human-local' : s.kind === 'ai' ? 'ai' : 'remote',
            displayName: s.name,
        })),
    };
}

export const useGameStore = create<GameStore>((set, get) => ({
    phase: 'menu',
    setPhase: (phase) => set({ phase }),

    selectedClass: 'jade_dragon',
    setSelectedClass: (selectedClass) => set({ selectedClass }),

    // Starts at the default on the server and on first client render (no hydration
    // mismatch); CharacterSelect loads the remembered choice in an effect.
    selectedModel: DEFAULT_FIGHTER_MODEL,
    setSelectedModel: (id) => {
        const selectedModel = sanitizeFighterModelId(id);
        writeStoredModel(selectedModel);
        set({ selectedModel });
    },

    mode: 'ffa',
    playerCount: 2,
    aiDifficulty: 0.55,
    maxRounds: 3,
    setMode: (mode) => set({ mode }),
    setPlayerCount: (playerCount) => set({ playerCount: Math.max(2, Math.min(4, playerCount)) }),
    setAiDifficulty: (aiDifficulty) => set({ aiDifficulty }),

    isMultiplayer: false,
    isHost: false,
    roomCode: null,
    isPublic: true,
    connectionStatus: 'disconnected',
    localSeat: 0,
    lobbySeats: [],
    setMultiplayer: (isMultiplayer) => set({ isMultiplayer }),
    setRoomCode: (roomCode) => set({ roomCode }),
    setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
    setLobby: (info) => set({
        localSeat: info.you, lobbySeats: info.seats, mode: info.mode,
        playerCount: info.arenaSize, maxRounds: info.maxRounds, isHost: info.isHost,
        roomCode: info.code, isPublic: info.isPublic, isMultiplayer: true,
    }),
    resetMultiplayer: () => set({
        isMultiplayer: false, isHost: false, roomCode: null, isPublic: true,
        connectionStatus: 'disconnected', localSeat: 0, lobbySeats: [], mpError: null,
    }),

    runtime: null,
    matchResult: null,
    setMatchResult: (matchResult) => set({ matchResult }),

    mpError: null,
    setMpError: (mpError) => set({ mpError }),
    netReconnecting: false,
    setNetReconnecting: (netReconnecting) => set({ netReconnecting }),
    offlineSeats: [],
    setSeatOnline: (seat, online) =>
        set((st) => ({
            offlineSeats: online ? st.offlineSeats.filter((x) => x !== seat) : st.offlineSeats.includes(seat) ? st.offlineSeats : [...st.offlineSeats, seat],
        })),
    clearLobbyRoom: () => set({ lobbySeats: [], roomCode: null }),

    startLocalMatch: () => {
        const { selectedClass, selectedModel, playerCount, mode, aiDifficulty, maxRounds } = get();
        const config = buildLocalConfig(selectedClass, playerCount, mode, aiDifficulty, maxRounds, selectedModel);
        set({ runtime: { kind: 'local', config }, isMultiplayer: false, phase: 'fight' });
    },
    startTraining: () => {
        const { selectedClass, selectedModel } = get();
        const config: MatchConfig = {
            mode: 'ffa', maxRounds: 1, aiDifficulty: 0,
            seats: [
                { seat: 0, className: selectedClass, modelId: selectedModel, team: 0, kind: 'human-local', displayName: 'YOU' },
                { seat: 1, className: selectedClass === 'iron_bull' ? 'stone_tiger' : 'iron_bull', modelId: selectedModel, team: 1, kind: 'remote', displayName: 'DUMMY' },
            ],
        };
        set({ runtime: { kind: 'local', config, training: true }, isMultiplayer: false, phase: 'fight' });
    },
    startHostMatch: (seats, mode, maxRounds, aiDifficulty, localSeat) => {
        const config = buildHostConfig(seats, mode, maxRounds, aiDifficulty, localSeat);
        set({ runtime: { kind: 'host', config }, isMultiplayer: true, isHost: true, localSeat, phase: 'fight' });
    },
    startGuestMatch: (seats, mode, localSeat) => {
        set({ runtime: { kind: 'guest', seats, localSeat, mode }, isMultiplayer: true, isHost: false, localSeat, phase: 'fight' });
    },

    resetGame: () => set({
        phase: 'menu', runtime: null, matchResult: null, mpError: null,
        isMultiplayer: false, isHost: false, roomCode: null,
        connectionStatus: 'disconnected', localSeat: 0, lobbySeats: [],
    }),
}));

/** Load the remembered fighter model into the store (client only; call from an effect so SSR and hydration match). */
export function restoreStoredModel(): void {
    const stored = readStoredModel();
    if (stored !== useGameStore.getState().selectedModel) useGameStore.setState({ selectedModel: stored });
}
