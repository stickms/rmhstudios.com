/**
 * Wiki-Race — Data Loader
 *
 * Loads article-pairs.json and provides selection helpers.
 */

import fs from 'fs';
import path from 'path';

export interface WikiArticleRef {
  title: string;
  url: string;
  description: string;
  thumbnail?: string;
}

export interface ArticlePair {
  id: string;
  startArticle: WikiArticleRef;
  targetArticle: WikiArticleRef;
  optimalPathLength: number;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
}

let cachedPairs: ArticlePair[] | null = null;

export function loadArticlePairs(): ArticlePair[] {
  if (cachedPairs) return cachedPairs;
  const raw = fs.readFileSync(
    path.join(process.cwd(), 'public', 'data', 'rmhbox', 'wiki-race', 'article-pairs.json'),
    'utf-8',
  );
  cachedPairs = JSON.parse(raw) as ArticlePair[];
  return cachedPairs;
}

/** Selects a random article pair, excluding previously used pair IDs. */
export function selectArticlePair(usedPairIds: string[]): ArticlePair {
  const all = loadArticlePairs();
  const usedSet = new Set(usedPairIds);
  const available = all.filter((p) => !usedSet.has(p.id));
  if (available.length === 0) throw new Error('No available article pairs remaining');
  const idx = Math.floor(Math.random() * available.length);
  return available[idx];
}

export function _resetCache(): void {
  cachedPairs = null;
}
