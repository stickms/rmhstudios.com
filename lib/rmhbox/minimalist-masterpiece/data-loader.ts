/**
 * RMHbox — Minimalist Masterpiece Data Loader
 *
 * Loads and caches drawing prompts from the static JSON file.
 * Provides selection logic for picking prompts for a game.
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md §3.3.2
 */

import path from 'path';
import fs from 'fs';

// ─── Types ───────────────────────────────────────────────────────

export interface DrawingPrompt {
  id: string;
  text: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

// ─── Singleton Cache ─────────────────────────────────────────────

let cachedPrompts: DrawingPrompt[] | null = null;

/**
 * Load drawing prompts from the static JSON file.
 * Caches the result as a singleton for subsequent calls.
 */
export function loadPrompts(): DrawingPrompt[] {
  if (cachedPrompts) return cachedPrompts;

  const filePath = path.join(process.cwd(), 'data/rmhbox/minimalist-masterpiece/prompts.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  cachedPrompts = JSON.parse(raw) as DrawingPrompt[];
  return cachedPrompts;
}

/**
 * Select a random prompt not in the used set.
 * Falls back to the full pool if all prompts have been used.
 */
export function selectPromptForGame(pool: DrawingPrompt[], usedIds: Set<string>): DrawingPrompt {
  if (pool.length === 0) {
    throw new Error('Cannot select a prompt from an empty pool');
  }
  const available = pool.filter((p) => !usedIds.has(p.id));
  const selection = available.length > 0 ? available : pool;
  return selection[Math.floor(Math.random() * selection.length)];
}
