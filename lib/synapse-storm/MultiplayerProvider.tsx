'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
    getMultiplayerClient,
    getStoredUserId,
    getStoredDisplayName,
    setStoredDisplayName,
    type SSLobbyState,
    type SSMatchState,
    type SSLeaderboardEntry,
    type SSConnectionStatus,
} from './multiplayerClient';

interface MultiplayerContextValue {
    connectionStatus: SSConnectionStatus;
    lobbyState: SSLobbyState | null;
    matchState: SSMatchState | null;
    leaderboard: SSLeaderboardEntry[];
    countdown: number | null;
    error: string | null;
    userId: string;
    displayName: string;
    setDisplayName: (name: string) => void;
    connect: () => void;
    disconnect: () => void;
    createLobby: () => void;
    joinLobby: (code: string) => void;
    leaveLobby: () => void;
    toggleReady: () => void;
    startMatch: () => void;
    sendScoreUpdate: (data: { matchId: string; score: number; maxCombo: number; puzzlesSolved: number; puzzlesMissed: number }) => void;
    finishMatch: (data: { matchId: string; score: number; maxCombo: number; puzzlesSolved: number; puzzlesMissed: number }) => void;
    returnToLobby: () => void;
    getServerTime: () => number;
}

const MultiplayerContext = createContext<MultiplayerContextValue | null>(null);

export function useMultiplayer(): MultiplayerContextValue {
    const ctx = useContext(MultiplayerContext);
    if (!ctx) throw new Error('useMultiplayer must be used within MultiplayerProvider');
    return ctx;
}

export function MultiplayerProvider({ children }: { children: React.ReactNode }) {
    const [connectionStatus, setConnectionStatus] = useState<SSConnectionStatus>('disconnected');
    const [lobbyState, setLobbyState] = useState<SSLobbyState | null>(null);
    const [matchState, setMatchState] = useState<SSMatchState | null>(null);
    const [leaderboard, setLeaderboard] = useState<SSLeaderboardEntry[]>([]);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [displayName, setDisplayNameState] = useState('');

    const userIdRef = useRef(getStoredUserId());
    const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        const stored = getStoredDisplayName();
        if (stored) setDisplayNameState(stored);
    }, []);

    const handleSetDisplayName = useCallback((name: string) => {
        setDisplayNameState(name);
        setStoredDisplayName(name);
    }, []);

    const client = getMultiplayerClient();

    useEffect(() => {
        client.setHandlers({
            onConnectionChange: (status) => setConnectionStatus(status),
            onLobbyUpdate: (lobby) => {
                setLobbyState(lobby);
                setError(null);
            },
            onMatchCountdown: (countdownEndsAt) => {
                setCountdown(countdownEndsAt);
                if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
                countdownTimerRef.current = setInterval(() => {
                    const remaining = Math.max(0, countdownEndsAt - client.getServerTime());
                    if (remaining <= 0) {
                        setCountdown(null);
                        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
                    } else {
                        setCountdown(countdownEndsAt);
                    }
                }, 100);
            },
            onMatchStart: (match) => {
                setMatchState(match);
                setLeaderboard(match.leaderboard);
                setCountdown(null);
                if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
            },
            onLeaderboardUpdate: (lb) => setLeaderboard(lb),
            onMatchFinished: (lb) => {
                setLeaderboard(lb);
                setMatchState(prev => prev ? { ...prev, status: 'FINISHED' } : null);
            },
            onTimeSync: () => {},
            onError: (msg) => setError(msg),
            onReturnToLobby: () => {
                setMatchState(null);
                setLeaderboard([]);
                setCountdown(null);
            },
        });

        return () => {
            if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        };
    }, [client]);

    const connect = useCallback(() => {
        client.connect(userIdRef.current, displayName);
    }, [client, displayName]);

    const disconnect = useCallback(() => {
        client.disconnect();
        setLobbyState(null);
        setMatchState(null);
        setLeaderboard([]);
        setCountdown(null);
    }, [client]);

    const createLobby = useCallback(() => client.createLobby(), [client]);
    const joinLobby = useCallback((code: string) => client.joinLobby(code), [client]);
    const leaveLobby = useCallback(() => {
        client.leaveLobby();
        setLobbyState(null);
        setMatchState(null);
        setLeaderboard([]);
    }, [client]);
    const toggleReady = useCallback(() => client.toggleReady(), [client]);
    const startMatch = useCallback(() => client.startMatch(), [client]);
    const sendScoreUpdate = useCallback((data: { matchId: string; score: number; maxCombo: number; puzzlesSolved: number; puzzlesMissed: number }) => client.sendScoreUpdate(data), [client]);
    const finishMatch = useCallback((data: { matchId: string; score: number; maxCombo: number; puzzlesSolved: number; puzzlesMissed: number }) => client.finishMatch(data), [client]);
    const returnToLobby = useCallback(() => client.returnToLobby(), [client]);
    const getServerTime = useCallback(() => client.getServerTime(), [client]);

    const value: MultiplayerContextValue = {
        connectionStatus,
        lobbyState,
        matchState,
        leaderboard,
        countdown,
        error,
        userId: userIdRef.current,
        displayName,
        setDisplayName: handleSetDisplayName,
        connect,
        disconnect,
        createLobby,
        joinLobby,
        leaveLobby,
        toggleReady,
        startMatch,
        sendScoreUpdate,
        finishMatch,
        returnToLobby,
        getServerTime,
    };

    return (
        <MultiplayerContext.Provider value={value}>
            {children}
        </MultiplayerContext.Provider>
    );
}
