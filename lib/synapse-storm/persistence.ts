import { authClient } from '../auth-client';

export interface LeaderboardEntry {
    rank: number;
    userId: string;
    displayName: string;
    avatar: string | null;
    highScore: number;
    maxCombo: number;
    puzzlesSolved: number;
    peakDifficulty: number;
    totalTime: number;
    updatedAt: string;
}

export async function saveSynapseStormScore(score: number) {
    try {
        const response = await fetch('/api/games/synapse-storm/score', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ score }),
        });

        if (!response.ok) {
            throw new Error('Failed to save score');
        }

        return await response.json();
    } catch (error) {
        console.error('Error saving Synapse Storm score:', error);
        return { error: 'Failed to save score' };
    }
}

export async function loadSynapseStormSave() {
    try {
        const response = await fetch('/api/games/synapse-storm/save');
        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error('Failed to load save');
        }
        return await response.json();
    } catch (error) {
        console.error('Error loading Synapse Storm save:', error);
        return null;
    }
}

export async function fetchGlobalLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
    try {
        const response = await fetch(`/api/games/synapse-storm/leaderboard?limit=${limit}`);
        if (!response.ok) {
            throw new Error('Failed to fetch leaderboard');
        }
        const data = await response.json();
        return data.leaderboard ?? [];
    } catch (error) {
        console.error('Error fetching Synapse Storm leaderboard:', error);
        return [];
    }
}
