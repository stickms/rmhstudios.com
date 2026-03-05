'use client';
import React from 'react';
import { GameState } from '../../lib/synapse-storm/types';
import { GlobalLeaderboard } from './GlobalLeaderboard';

interface GameOverProps {
    state: GameState;
    onRestart: () => void;
    onMenu: () => void;
    currentUserId?: string;
    scoreSaved?: boolean;
}

function getGrade(score: number): { grade: string; cls: string; label: string } {
    if (score >= 25000) return { grade: 'S', cls: 'grade-S', label: 'Neural Apex — Flawless Efficiency' };
    if (score >= 12000) return { grade: 'A', cls: 'grade-A', label: 'High Efficiency — Remarkable Performance' };
    if (score >= 5000)  return { grade: 'B', cls: 'grade-B', label: 'Stable Link — Solid Performance' };
    return { grade: 'C', cls: 'grade-C', label: 'Link Degraded — Keep Training' };
}

export const GameOver: React.FC<GameOverProps> = ({ state, onRestart, onMenu, currentUserId, scoreSaved }) => {
    const accuracy = state.puzzlesSolved + state.puzzlesMissed > 0
        ? Math.round((state.puzzlesSolved / (state.puzzlesSolved + state.puzzlesMissed)) * 100)
        : 0;

    const { grade, cls, label } = getGrade(state.score);

    return (
        <div className="game-over">
            <div className="menu-bg-effect" style={{ opacity: 0.35 }} />

            <div className="go-content">
                <span className="go-title">NEURAL COLLAPSE</span>

                <div className={`go-grade ${cls}`}>{grade}</div>
                <div className="go-final-score">{state.score.toLocaleString()}</div>
                <p className="go-rating">{label}</p>

                <div className="go-stats-grid">
                    <div className="go-stat">
                        <span className="hud-label">Solved</span>
                        <div className="hud-value">{state.puzzlesSolved}</div>
                    </div>
                    <div className="go-stat">
                        <span className="hud-label">Missed</span>
                        <div className="hud-value">{state.puzzlesMissed}</div>
                    </div>
                    <div className="go-stat">
                        <span className="hud-label">Accuracy</span>
                        <div className="hud-value">{accuracy}%</div>
                    </div>
                    <div className="go-stat">
                        <span className="hud-label">Max Combo</span>
                        <div className="hud-value">×{state.maxCombo}</div>
                    </div>
                    <div className="go-stat">
                        <span className="hud-label">Survival</span>
                        <div className="hud-value">{Math.floor(state.totalTime)}s</div>
                    </div>
                    <div className="go-stat">
                        <span className="hud-label">Peak Level</span>
                        <div className="hud-value">{state.difficulty.toFixed(1)}</div>
                    </div>
                </div>

                <GlobalLeaderboard
                    currentUserId={currentUserId}
                    currentScore={state.score}
                    autoRefresh
                    refreshKey={scoreSaved ? 1 : 0}
                />

                <div className="go-buttons">
                    <button className="go-button go-restart" onClick={onRestart}>
                        REBOOT NEURAL LINK
                    </button>
                    <button className="go-button go-menu" onClick={onMenu}>
                        RETURN TO HUB
                    </button>
                </div>
            </div>
        </div>
    );
};
