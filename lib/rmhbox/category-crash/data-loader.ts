/**
 * Category Crash — Data Loader
 *
 * Loads categories.json and provides helpers for selecting
 * round letters (weighted random) and categories (by difficulty distribution).
 */

import fs from 'fs';
import path from 'path';
import {
  CC_CATEGORIES_PER_ROUND,
  CC_CATEGORY_DISTRIBUTION,
  CC_LETTER_WEIGHTS,
} from '../constants';

export interface Category {
  id: string;
  name: string;
  difficulty: 'easy' | 'medium' | 'hard';
  examples: string[];
}

let cachedCategories: Category[] | null = null;

export function loadCategories(): Category[] {
  if (cachedCategories) return cachedCategories;
  const raw = fs.readFileSync(
    path.join(process.cwd(), 'public', 'data', 'rmhbox', 'category-crash', 'categories.json'),
    'utf-8',
  );
  cachedCategories = JSON.parse(raw) as Category[];
  return cachedCategories;
}

/** Selects a weighted random letter from A-Z, excluding usedLetters. */
export function selectRoundLetter(usedLetters: string[]): string {
  const usedSet = new Set(usedLetters.map((l) => l.toUpperCase()));
  const entries = Object.entries(CC_LETTER_WEIGHTS).filter(([l]) => !usedSet.has(l));
  if (entries.length === 0) throw new Error('No available letters remaining');
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  let random = Math.random() * totalWeight;
  for (const [letter, weight] of entries) {
    random -= weight;
    if (random <= 0) return letter;
  }
  return entries[entries.length - 1][0];
}

/** Selects CC_CATEGORIES_PER_ROUND categories with correct difficulty distribution, excluding used IDs. */
export function selectRoundCategories(usedCategoryIds: string[]): Category[] {
  const all = loadCategories();
  const usedSet = new Set(usedCategoryIds);
  const available = all.filter((c) => !usedSet.has(c.id));

  const byDifficulty = {
    easy: available.filter((c) => c.difficulty === 'easy'),
    medium: available.filter((c) => c.difficulty === 'medium'),
    hard: available.filter((c) => c.difficulty === 'hard'),
  };

  // Shuffle each pool
  for (const arr of Object.values(byDifficulty)) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  const selected: Category[] = [];
  const dist = CC_CATEGORY_DISTRIBUTION as Record<string, number>;
  for (const [diff, count] of Object.entries(dist)) {
    const pool = byDifficulty[diff as keyof typeof byDifficulty];
    selected.push(...pool.slice(0, count));
  }

  // If we didn't get enough (rare edge case), fill from any remaining
  while (selected.length < CC_CATEGORIES_PER_ROUND) {
    const remaining = available.filter((c) => !selected.includes(c));
    if (remaining.length === 0) break;
    selected.push(remaining[0]);
  }

  return selected;
}

export function _resetCache(): void {
  cachedCategories = null;
}
