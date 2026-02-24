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
}

export interface ArticlePair {
  startArticle: WikiArticleRef;
  targetArticle: WikiArticleRef;
  difficulty: 'medium' | 'hard' | 'extreme';
  tags: string[];
}

let cachedPairs: ArticlePair[] | null = null;

export function loadArticlePairs(): ArticlePair[] {
  if (cachedPairs) return cachedPairs;
  const raw = fs.readFileSync(
    path.join(process.cwd(), 'data', 'rmhbox', 'wiki-race', 'article-pairs.json'),
    'utf-8',
  );
  cachedPairs = JSON.parse(raw) as ArticlePair[];
  return cachedPairs;
}

/** Returns a unique key for a pair based on article titles. */
export function pairKey(pair: ArticlePair): string {
  return `${pair.startArticle.title}::${pair.targetArticle.title}`;
}

/** Selects a random article pair, excluding previously used pair keys. */
export function selectArticlePair(usedPairKeys: string[]): ArticlePair {
  const all = loadArticlePairs();
  const usedSet = new Set(usedPairKeys);
  const available = all.filter((p) => !usedSet.has(pairKey(p)));
  if (available.length === 0) throw new Error('No available article pairs remaining');
  const idx = Math.floor(Math.random() * available.length);
  return available[idx];
}

export function _resetCache(): void {
  cachedPairs = null;
}
