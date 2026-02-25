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
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  minPathLength: number; 
  path: string[]; // Precomputed shortest path for reference (not revealed to players)
}

let cachedPairs: ArticlePair[] | null = null;

export function loadArticlePairs(): ArticlePair[] {
  if (cachedPairs) return cachedPairs;
  // load all pairs from the three difficulty files and combine into one array
  const pairs: ArticlePair[] = [];
  const difficulties: Array<ArticlePair['difficulty']> = ['easy', 'medium', 'hard'];
  for (const diff of difficulties) {
    const filePath = path.join(process.cwd(), 'data', 'wiki-race', `${diff}-pairs.json`);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const parsed: ArticlePair[] = JSON.parse(fileContent);
    pairs.push(...parsed);
  }
  cachedPairs = pairs;
  return cachedPairs!;
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
