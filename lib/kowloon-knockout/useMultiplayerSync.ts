// ============================================================
// useMultiplayerSync — phase-agnostic multiplayer event router
//
// Mounted once at the game root so multiplayer events drive the
// store and phase regardless of which screen is showing. This is
// what lets a single player's "return to lobby" (or a host leaving)
// pull *every* player back to the shared lobby, even from the
// result screen.
// ============================================================

import { useEffect } from 'react';
import { useGameStore } from '@/lib/kowloon-knockout/store';
import { networkClient, type ServerMessage } from '@/lib/kowloon-knockout/net/client';

const FATAL = new Set(['Host left the room', 'Disconnected']);

export function useMultiplayerSync(): void {
    useEffect(() => {
        const store = useGameStore.getState;

        const onRoomCreated = (m: ServerMessage) => {
            if (m.type === 'room_created') {
                store().setRoomCode(m.code);
                store().setConnectionStatus('waiting');
            }
        };

        const onLobby = (m: ServerMessage) => {
            if (m.type !== 'lobby_update') return;
            store().setLobby({
                you: m.you, seats: m.seats, mode: m.mode, arenaSize: m.arenaSize,
                maxRounds: m.maxRounds, isHost: m.you === m.hostSeat, code: m.code, isPublic: m.isPublic,
            });
            store().setConnectionStatus('waiting');
            store().setMpError(null);
            // A lobby_update arriving outside the lobby means the room returned
            // to the lobby (post-match) — pull this client back with everyone.
            const phase = store().phase;
            if (phase === 'result' || phase === 'fight' || phase === 'countdown') {
                store().setMatchResult(null);
                store().setPhase('lobby');
            }
        };

        const onStart = (m: ServerMessage) => {
            if (m.type !== 'match_start') return;
            store().setMatchResult(null);
            if (m.you === 0) store().startHostMatch(m.seats, m.mode, m.maxRounds, m.aiDifficulty, m.you);
            else store().startGuestMatch(m.seats, m.mode, m.you);
        };

        const onError = (m: ServerMessage) => {
            if (m.type !== 'error') return;
            store().setMpError(m.message);
            if (FATAL.has(m.message)) {
                // Room is gone — drop back to the lobby browser.
                store().clearLobbyRoom();
                const phase = store().phase;
                if (phase !== 'menu') store().setPhase('lobby');
            }
        };

        networkClient.on('room_created', onRoomCreated);
        networkClient.on('lobby_update', onLobby);
        networkClient.on('match_start', onStart);
        networkClient.on('error', onError);
        return () => {
            networkClient.off('room_created', onRoomCreated);
            networkClient.off('lobby_update', onLobby);
            networkClient.off('match_start', onStart);
            networkClient.off('error', onError);
        };
    }, []);
}
