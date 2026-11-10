import { authClient } from '../auth-client';
import { api } from '@/lib/contract/client';
import { submitSynapseStormScoreApi } from '@/lib/game/score.contract';
import { HttpError } from '@/lib/http';
import {
    getSynapseStormLeaderboardApi,
    loadSynapseStormSaveApi,
} from './synapse-storm.contract';

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

export interface ScoreSaveData {
    score: number;
    puzzlesSolved: number;
    maxCombo: number;
    peakDifficulty: number;
    totalTime: number;
}

export async function saveSynapseStormScore(data: ScoreSaveData) {
    try {
        return await api(submitSynapseStormScoreApi, { body: data });
    } catch (error) {
        console.error('Error saving Synapse Storm score:', error);
        return { error: 'Failed to save score' };
    }
}

export async function loadSynapseStormSave() {
    try {
        return await api(loadSynapseStormSaveApi);
    } catch (error) {
        if (error instanceof HttpError && error.status === 404) return null;
        console.error('Error loading Synapse Storm save:', error);
        return null;
    }
}

export async function fetchGlobalLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
    try {
        const data = await api(getSynapseStormLeaderboardApi, { query: { limit } });
        return data.leaderboard ?? [];
    } catch (error) {
        console.error('Error fetching Synapse Storm leaderboard:', error);
        return [];
    }
}
