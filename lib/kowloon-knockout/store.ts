// ============================================================
// Zustand Game Store — menus, lobby, and the active runtime
// ============================================================

import { create } from 'zustand';
import type { FighterClass, GamePhase, MatchMode } from '@/lib/kowloon-knockout/game/fighters/types';
import type { MatchConfig, SeatConfig } from '@/lib/kowloon-knockout/game/config';
import { defaultSeatName } from '@/lib/kowloon-knockout/game/config';
import { ALL_FIGHTERS } from '@/lib/kowloon-knockout/game/fighters/stats';
import type { MatchSeat, LobbySeat } from '@/lib/kowloon-knockout/net/client';
import type { HudFighter } from '@/lib/kowloon-knockout/net/session';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'waiting' | 'ready' | 'playing';

/** Everything GameView needs to instantiate the correct session. */
export type Runtime =
    | { kind: 'local'; config: MatchConfig }
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
    connectionStatus: ConnectionStatus;
    localSeat: number;
    lobbySeats: LobbySeat[];
    setMultiplayer: (v: boolean) => void;
    setRoomCode: (c: string | null) => void;
    setConnectionStatus: (s: ConnectionStatus) => void;
    setLobby: (info: { you: number; seats: LobbySeat[]; mode: MatchMode; arenaSize: number; maxRounds: number; isHost: boolean }) => void;
    resetMultiplayer: () => void;

    // Active runtime
    runtime: Runtime | null;
    matchResult: MatchResult | null;
    setMatchResult: (r: MatchResult | null) => void;

    startLocalMatch: () => void;
    startHostMatch: (seats: MatchSeat[], mode: MatchMode, maxRounds: number, aiDifficulty: number, localSeat: number) => void;
    startGuestMatch: (seats: MatchSeat[], mode: MatchMode, localSeat: number) => void;

    resetGame: () => void;
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
function buildLocalConfig(selected: FighterClass, playerCount: number, mode: MatchMode, aiDifficulty: number, maxRounds: number): MatchConfig {
    const aiClasses = randomClasses(playerCount - 1, selected);
    const seats: SeatConfig[] = [];
    for (let i = 0; i < playerCount; i++) {
        const className = i === 0 ? selected : aiClasses[i - 1];
        const kind = i === 0 ? 'human-local' : 'ai';
        seats.push({
            seat: i,
            className,
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
    connectionStatus: 'disconnected',
    localSeat: 0,
    lobbySeats: [],
    setMultiplayer: (isMultiplayer) => set({ isMultiplayer }),
    setRoomCode: (roomCode) => set({ roomCode }),
    setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
    setLobby: (info) => set({
        localSeat: info.you, lobbySeats: info.seats, mode: info.mode,
        playerCount: info.arenaSize, maxRounds: info.maxRounds, isHost: info.isHost,
    }),
    resetMultiplayer: () => set({
        isMultiplayer: false, isHost: false, roomCode: null,
        connectionStatus: 'disconnected', localSeat: 0, lobbySeats: [],
    }),

    runtime: null,
    matchResult: null,
    setMatchResult: (matchResult) => set({ matchResult }),

    startLocalMatch: () => {
        const { selectedClass, playerCount, mode, aiDifficulty, maxRounds } = get();
        const config = buildLocalConfig(selectedClass, playerCount, mode, aiDifficulty, maxRounds);
        set({ runtime: { kind: 'local', config }, isMultiplayer: false, phase: 'fight' });
    },
    startHostMatch: (seats, mode, maxRounds, aiDifficulty, localSeat) => {
        const config = buildHostConfig(seats, mode, maxRounds, aiDifficulty, localSeat);
        set({ runtime: { kind: 'host', config }, isMultiplayer: true, isHost: true, localSeat, phase: 'fight' });
    },
    startGuestMatch: (seats, mode, localSeat) => {
        set({ runtime: { kind: 'guest', seats, localSeat, mode }, isMultiplayer: true, isHost: false, localSeat, phase: 'fight' });
    },

    resetGame: () => set({
        phase: 'menu', runtime: null, matchResult: null,
        isMultiplayer: false, isHost: false, roomCode: null,
        connectionStatus: 'disconnected', localSeat: 0, lobbySeats: [],
    }),
}));
