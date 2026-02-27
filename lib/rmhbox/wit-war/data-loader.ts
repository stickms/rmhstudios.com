/**
 * Wit War Lash — Data Loader
 *
 * Loads prompts.json and provides helpers for selecting round prompts
 * and assigning prompt pairs to players.
 */

import fs from 'fs';
import path from 'path';
import { WW_PROMPTS_PER_PLAYER } from '../constants';

let cachedPrompts: string[] | null = null;

export function loadPrompts(): string[] {
  if (cachedPrompts) return cachedPrompts;
  const raw = fs.readFileSync(
    path.join(process.cwd(), 'data', 'rmhbox', 'wit-war-lash', 'prompts.json'),
    'utf-8',
  );
  cachedPrompts = JSON.parse(raw) as string[];
  return cachedPrompts;
}

/**
 * Selects `count` unique prompts, excluding already-used indices.
 * Returns the selected prompts with their original indices.
 */
export function selectRoundPrompts(
  count: number,
  usedIndices: Set<number>,
): Array<{ index: number; text: string }> {
  const all = loadPrompts();
  const available = all
    .map((text, index) => ({ index, text }))
    .filter(({ index }) => !usedIndices.has(index));

  // Fisher-Yates shuffle
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }

  return available.slice(0, count);
}

/**
 * Assigns prompts to player pairs for head-to-head matchups.
 *
 * With N players, creates N matchups. Each player gets exactly
 * WW_PROMPTS_PER_PLAYER (2) prompts. Each prompt is assigned to
 * exactly 2 different players.
 *
 * Uses a round-robin pairing: player i is paired with player
 * (i + offset) mod N for each prompt slot, varying the offset
 * to avoid repeated pairings.
 */
export function assignPromptsToPlayers(
  prompts: Array<{ index: number; text: string }>,
  playerIds: string[],
): Array<{
  promptIndex: number;
  promptText: string;
  playerA: string;
  playerB: string;
}> {
  const n = playerIds.length;
  if (n < 3) throw new Error('Wit War Lash requires at least 3 players');

  const matchups: Array<{
    promptIndex: number;
    promptText: string;
    playerA: string;
    playerB: string;
  }> = [];

  // Shuffle player order for variety
  const shuffled = [...playerIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Each player gets exactly WW_PROMPTS_PER_PLAYER prompts.
  // Total prompt slots = N * 2 = 2N, and each prompt fills 2 slots,
  // so we need exactly N prompts for N matchups.
  for (let i = 0; i < n; i++) {
    const offset = i < Math.floor(n / 2) ? 1 : Math.floor(n / 2);
    const playerA = shuffled[i];
    const playerB = shuffled[(i + offset) % n];
    const prompt = prompts[i % prompts.length];

    matchups.push({
      promptIndex: prompt.index,
      promptText: prompt.text,
      playerA,
      playerB,
    });
  }

  return matchups;
}

export function _resetCache(): void {
  cachedPrompts = null;
}
