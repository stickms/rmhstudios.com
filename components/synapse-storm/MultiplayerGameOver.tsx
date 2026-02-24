'use client';
import React from 'react';
import { GameState } from '../../lib/synapse-storm/types';
import type { SSLeaderboardEntry } from '../../lib/synapse-storm/multiplayerClient';
import { MultiplayerLeaderboard } from './MultiplayerLeaderboard';

interface MultiplayerGameOverProps {
    gameState: GameState;
    leaderboard: SSLeaderboardEntry[];
    currentUserId: string;
    isHost: boolean;
    onBackToLobby: () => void;
    onPlayAgain: () => void;
}

export const MultiplayerGameOver: React.FC<MultiplayerGameOverProps> = ({
    gameState, leaderboard, currentUserId, isHost, onBackToLobby, onPlayAgain,
}) => {
    const myEntry = leaderboard.find(e => e.userId === currentUserId);
    const myRank = leaderboard
        .sort((a, b) => b.score - a.score)
        .findIndex(e => e.userId === currentUserId) + 1;

    const accuracy = gameState.puzzlesSolved > 0
        ? Math.round((gameState.puzzlesSolved / (gameState.puzzlesSolved + gameState.puzzlesMissed)) * 100)
        : 0;

    return (
        <div className="game-over">
            <div className="menu-bg-effect" style={{ opacity: 0.3 }} />
            <div className="go-content" style={{ maxWidth: '600px' }}>
                <h2 className="hud-label" style={{ fontSize: '1.2rem', color: 'var(--accent-cyan)' }}>
                    MATCH COMPLETE
                </h2>

                <div className="ss-mp-go-rank">
                    {myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : `#${myRank}`}
                </div>
                <div className="go-final-score">{(myEntry?.score ?? gameState.score).toLocaleString()}</div>

                <div className="go-stats-grid">
                    <div className="go-stat">
                        <span className="hud-label">Solved</span>
                        <div className="hud-value">{myEntry?.puzzlesSolved ?? gameState.puzzlesSolved}</div>
                    </div>
                    <div className="go-stat">
                        <span className="hud-label">Max Combo</span>
                        <div className="hud-value">{myEntry?.maxCombo ?? gameState.maxCombo}</div>
                    </div>
                    <div className="go-stat">
                        <span className="hud-label">Accuracy</span>
                        <div className="hud-value">{accuracy}%</div>
                    </div>
                    <div className="go-stat">
                        <span className="hud-label">Survival</span>
                        <div className="hud-value">{Math.floor(gameState.totalTime)}s</div>
                    </div>
                    <div className="go-stat">
                        <span className="hud-label">Peak Intensity</span>
                        <div className="hud-value">{gameState.difficulty.toFixed(1)}</div>
                    </div>
                    <div className="go-stat">
                        <span className="hud-label">Rank</span>
                        <div className="hud-value" style={{ color: 'var(--accent-gold)' }}>
                            #{myRank} / {leaderboard.length}
                        </div>
                    </div>
                </div>

                <MultiplayerLeaderboard
                    leaderboard={leaderboard}
                    currentUserId={currentUserId}
                />

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginTop: '1.5rem' }}>
                    {isHost && (
                        <button className="go-button go-restart" onClick={onPlayAgain}>
                            PLAY AGAIN
                        </button>
                    )}
                    <button
                        className="go-button"
                        style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                        onClick={onBackToLobby}
                    >
                        {isHost ? 'BACK TO LOBBY' : 'WAITING FOR HOST...'}
                    </button>
                </div>
            </div>
        </div>
    );
};
