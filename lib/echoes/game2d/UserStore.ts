export async function submitScore(
    timeSurvived: number,
    kills: number,
    totalXP: number
): Promise<void> {
    try {
        await fetch('/api/echoes/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeSurvived, kills, totalXP }),
        });
    } catch (e) {
        console.error('Score submit failed:', e);
    }
}

export type LeaderboardSort = 'time' | 'kills' | 'xp';

export interface LeaderboardEntry {
    username: string;
    bestTime: number;
    totalKills: number;
    totalXP: number;
    gamesPlayed: number;
}

export async function fetchLeaderboard(sort: LeaderboardSort = 'time'): Promise<LeaderboardEntry[]> {
    try {
        const res = await fetch(`/api/echoes/leaderboard?sort=${sort}`);
        if (!res.ok) return [];
        return res.json();
    } catch {
        return [];
    }
}
