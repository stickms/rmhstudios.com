const USERNAME_KEY = 'echoes_username';

export function getStoredUsername(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(USERNAME_KEY);
}

export function setStoredUsername(username: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(USERNAME_KEY, username);
}

export async function submitScore(
    username: string,
    timeSurvived: number,
    kills: number,
    totalXP: number
): Promise<void> {
    try {
        await fetch('/api/echoes/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, timeSurvived, kills, totalXP }),
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
