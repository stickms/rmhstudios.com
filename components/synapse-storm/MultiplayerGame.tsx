'use client';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useMultiplayer } from '../../lib/synapse-storm/MultiplayerProvider';
import { useGameEngine } from '../../lib/synapse-storm/engine';
import type { MultiplayerConfig } from '../../lib/synapse-storm/engine';
import { MultiplayerMenu } from './MultiplayerMenu';
import { Lobby } from './Lobby';
import { GameBoard } from './GameBoard';
import { MultiplayerLeaderboard } from './MultiplayerLeaderboard';
import { MultiplayerGameOver } from './MultiplayerGameOver';
import './SynapseStorm.css';

type MPView = 'menu' | 'lobby' | 'playing' | 'gameover';

export const MultiplayerGame: React.FC<{ onBackToMain: () => void }> = ({ onBackToMain }) => {
    const mp = useMultiplayer();
    const matchStartedRef = useRef(false);
    const gameStartedRef = useRef(false);
    const localGameOverRef = useRef(false);

    const handleScoreUpdate = useCallback((data: { score: number; maxCombo: number; puzzlesSolved: number; puzzlesMissed: number }) => {
        if (!mp.matchState?.matchId) return;
        mp.sendScoreUpdate({ matchId: mp.matchState.matchId, ...data });
    }, [mp]);

    const handleGameOver = useCallback((data: { score: number; maxCombo: number; puzzlesSolved: number; puzzlesMissed: number }) => {
        if (!mp.matchState?.matchId) return;
        localGameOverRef.current = true;
        mp.finishMatch({ matchId: mp.matchState.matchId, ...data });
    }, [mp]);

    const mpConfig: MultiplayerConfig | undefined = useMemo(() => {
        if (!mp.matchState || mp.matchState.status !== 'RUNNING') return undefined;
        return {
            matchSeed: mp.matchState.seed,
            matchStartAt: mp.matchState.startAt,
            onScoreUpdate: handleScoreUpdate,
            onGameOver: handleGameOver,
        };
    }, [mp.matchState, handleScoreUpdate, handleGameOver]);

    const computedMode = mp.matchState?.status === 'RUNNING' && !localGameOverRef.current ? 'multiplayer' as const : 'singleplayer' as const;

    const { state: gameState, startGame, solvePuzzle, skipMemoryPhase, returnToMenu } = useGameEngine(
        computedMode,
        mpConfig,
    );

    const localGameOver = gameState.status === 'gameover';

    const view: MPView = useMemo(() => {
        if (mp.matchState?.status === 'FINISHED') return 'gameover';
        if (mp.matchState?.status === 'RUNNING' && localGameOver) return 'gameover';
        if (mp.matchState?.status === 'RUNNING') return 'playing';
        if (mp.lobbyState) return 'lobby';
        return 'menu';
    }, [mp.matchState, mp.lobbyState, localGameOver]);

    // Auto-start game when match begins
    useEffect(() => {
        if (mp.matchState?.status === 'RUNNING' && !gameStartedRef.current) {
            gameStartedRef.current = true;
            matchStartedRef.current = true;
            localGameOverRef.current = false;
            startGame();
        }
        if (!mp.matchState || mp.matchState.status === 'FINISHED') {
            gameStartedRef.current = false;
        }
    }, [mp.matchState, startGame]);

    // Reset on return to lobby
    useEffect(() => {
        if (view === 'lobby' && matchStartedRef.current) {
            matchStartedRef.current = false;
            returnToMenu();
        }
    }, [view, returnToMenu]);

    const handleBack = () => {
        mp.disconnect();
        onBackToMain();
    };

    const handleLeaveLobby = () => {
        // Stay in multiplayer menu
    };

    const handleBackToLobby = () => {
        mp.returnToLobby();
    };

    const handlePlayAgain = () => {
        if (mp.lobbyState?.hostUserId === mp.userId) {
            mp.returnToLobby();
        }
    };

    return (
        <div className="synapse-storm-root">
            <div className="scanline-overlay" />
            <div className="app-container">
                {view === 'menu' && (
                    <MultiplayerMenu onBack={handleBack} />
                )}

                {view === 'lobby' && (
                    <Lobby onLeave={handleLeaveLobby} />
                )}

                {view === 'playing' && (
                    <div className="ss-mp-game-layout">
                        <div className="ss-mp-game-main">
                            <GameBoard state={gameState} onSolve={solvePuzzle} onSkipPhase={skipMemoryPhase} />
                        </div>
                        <div className="ss-mp-game-sidebar">
                            <MultiplayerLeaderboard
                                leaderboard={mp.leaderboard}
                                currentUserId={mp.userId}
                                compact
                            />
                            <div className="ss-mp-connection-status">
                                <span className={`ss-mp-status-dot ss-mp-status-${mp.connectionStatus}`} />
                                {mp.connectionStatus === 'connected' ? 'LIVE' : mp.connectionStatus.toUpperCase()}
                            </div>
                        </div>
                    </div>
                )}

                {view === 'gameover' && (
                    <MultiplayerGameOver
                        gameState={gameState}
                        leaderboard={mp.leaderboard}
                        currentUserId={mp.userId}
                        isHost={mp.lobbyState?.hostUserId === mp.userId || false}
                        onBackToLobby={handleBackToLobby}
                        onPlayAgain={handlePlayAgain}
                    />
                )}
            </div>
        </div>
    );
};
