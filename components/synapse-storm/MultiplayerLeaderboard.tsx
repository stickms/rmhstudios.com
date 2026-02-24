'use client';
import React from 'react';
import type { SSLeaderboardEntry } from '../../lib/synapse-storm/multiplayerClient';

interface MultiplayerLeaderboardProps {
    leaderboard: SSLeaderboardEntry[];
    currentUserId: string;
    compact?: boolean;
}

export const MultiplayerLeaderboard: React.FC<MultiplayerLeaderboardProps> = ({
    leaderboard, currentUserId, compact = false,
}) => {
    const sorted = [...leaderboard].sort((a, b) => b.score - a.score);

    if (compact) {
        return (
            <div className="ss-lb-compact">
                <div className="ss-lb-header">LEADERBOARD</div>
                {sorted.map((entry, i) => (
                    <div
                        key={entry.userId}
                        className={`ss-lb-row ${entry.userId === currentUserId ? 'ss-lb-row-self' : ''} ${entry.finished ? 'ss-lb-row-finished' : ''}`}
                    >
                        <span className="ss-lb-rank">#{i + 1}</span>
                        <span className="ss-lb-name">{entry.displayName}</span>
                        <span className="ss-lb-score">{entry.score.toLocaleString()}</span>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="ss-lb-full">
            <h3 className="ss-lb-full-title">FINAL RANKINGS</h3>
            <div className="ss-lb-full-list">
                {sorted.map((entry, i) => (
                    <div
                        key={entry.userId}
                        className={`ss-lb-full-row ${entry.userId === currentUserId ? 'ss-lb-row-self' : ''}`}
                    >
                        <div className="ss-lb-full-rank">
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                        </div>
                        <div className="ss-lb-full-info">
                            <span className="ss-lb-full-name">{entry.displayName}</span>
                            <div className="ss-lb-full-stats">
                                <span>Solved: {entry.puzzlesSolved}</span>
                                <span>Combo: x{entry.maxCombo}</span>
                                <span>Missed: {entry.puzzlesMissed}</span>
                            </div>
                        </div>
                        <div className="ss-lb-full-score">{entry.score.toLocaleString()}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};
