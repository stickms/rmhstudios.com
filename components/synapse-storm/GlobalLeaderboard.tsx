'use client';
import React, { useEffect, useState } from 'react';
import { fetchGlobalLeaderboard, type LeaderboardEntry } from '../../lib/synapse-storm/persistence';
import { Trophy, ChevronDown, ChevronUp } from 'lucide-react';

interface GlobalLeaderboardProps {
    currentUserId?: string;
    currentScore?: number;
    compact?: boolean;
    autoRefresh?: boolean;
    /** Change this value to trigger an immediate re-fetch (e.g. after score save completes). */
    refreshKey?: number;
}

export const GlobalLeaderboard: React.FC<GlobalLeaderboardProps> = ({
    currentUserId, currentScore, compact = false, autoRefresh = false, refreshKey = 0,
}) => {
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(!compact);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            const data = await fetchGlobalLeaderboard(compact ? 10 : 20);
            if (!cancelled) {
                setEntries(data);
                setLoading(false);
            }
        };
        load();

        let interval: ReturnType<typeof setInterval> | null = null;
        if (autoRefresh) {
            interval = setInterval(load, 30000);
        }

        return () => {
            cancelled = true;
            if (interval) clearInterval(interval);
        };
    }, [compact, autoRefresh, refreshKey]);

    const myRank = currentUserId
        ? entries.findIndex(e => e.userId === currentUserId) + 1
        : 0;

    if (compact && !expanded) {
        return (
            <button className="ss-glb-toggle" onClick={() => setExpanded(true)}>
                <Trophy size={14} />
                <span>GLOBAL LEADERBOARD</span>
                {myRank > 0 && <span className="ss-glb-my-rank">#{myRank}</span>}
                <ChevronDown size={14} />
            </button>
        );
    }

    return (
        <div className={`ss-glb ${compact ? 'ss-glb-compact' : ''}`}>
            <div className="ss-glb-header">
                <div className="ss-glb-header-left">
                    <Trophy size={14} className="ss-glb-trophy" />
                    <span>GLOBAL LEADERBOARD</span>
                </div>
                {compact && (
                    <button className="ss-glb-collapse" onClick={() => setExpanded(false)}>
                        <ChevronUp size={14} />
                    </button>
                )}
            </div>

            {loading ? (
                <div className="ss-glb-loading">Loading...</div>
            ) : entries.length === 0 ? (
                <div className="ss-glb-empty">No scores yet. Be the first!</div>
            ) : (
                <div className="ss-glb-list">
                    {entries.map((entry) => {
                        const isSelf = currentUserId && entry.userId === currentUserId;
                        const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null;
                        const isNewBest = isSelf && currentScore !== undefined && currentScore > entry.highScore;

                        return (
                            <div
                                key={entry.userId}
                                className={`ss-glb-row ${isSelf ? 'ss-glb-row-self' : ''}`}
                            >
                                <span className="ss-glb-rank">
                                    {medal ?? `#${entry.rank}`}
                                </span>
                                <div className="ss-glb-player">
                                    <span className="ss-glb-name">
                                        {entry.displayName}
                                        {isSelf && <span className="ss-glb-you">YOU</span>}
                                    </span>
                                    {!compact && (
                                        <span className="ss-glb-meta">
                                            Combo x{entry.maxCombo} &middot; Lv.{entry.peakDifficulty.toFixed(1)}
                                        </span>
                                    )}
                                </div>
                                <span className={`ss-glb-score ${isNewBest ? 'ss-glb-score-new' : ''}`}>
                                    {entry.highScore.toLocaleString()}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {myRank === 0 && currentUserId && !loading && entries.length > 0 && (
                <div className="ss-glb-not-ranked">
                    You haven't placed yet. Play a round!
                </div>
            )}
        </div>
    );
};
