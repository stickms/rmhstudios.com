/**
 * RMHbox — Undercover Editor Data Loader
 *
 * Loads and validates story prompts and keywords from static JSON files.
 * Provides selection logic for picking a prompt and keyword per game,
 * excluding previously used ones within the lobby session.
 *
 * Uses array indices for deduplication (no id fields in data).
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md §2.3
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { StoryPromptSchema, KeywordSchema, type StoryPrompt, type Keyword } from './schemas';
import { logger } from '../../../server/rmhbox/logger';

// ─── Singleton Caches ────────────────────────────────────────────

let cachedPrompts: StoryPrompt[] | null = null;
let cachedKeywords: Keyword[] | null = null;

/**
 * Load and validate all story prompts from prompts.json.
 * Uses singleton caching — returns the same array on subsequent calls.
 */
export function loadPrompts(): StoryPrompt[] {
  if (cachedPrompts) return cachedPrompts;

  const filePath = join(process.cwd(), 'data', 'rmhbox', 'undercover-editor', 'prompts.json');
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown[];

  const valid: StoryPrompt[] = [];
  for (const entry of raw) {
    const result = StoryPromptSchema.safeParse(entry);
    if (result.success) {
      valid.push(result.data);
    } else {
      logger.warn({
        event: 'ue_prompt_validation_failed',
        error: result.error.message,
        entry: JSON.stringify(entry).slice(0, 200),
      });
    }
  }

  cachedPrompts = valid;
  logger.info({ event: 'ue_prompts_loaded', totalLoaded: valid.length, totalRaw: raw.length });
  return cachedPrompts;
}

/**
 * Load and validate all keywords from keywords.json.
 * Uses singleton caching — returns the same array on subsequent calls.
 */
export function loadKeywords(): Keyword[] {
  if (cachedKeywords) return cachedKeywords;

  const filePath = join(process.cwd(), 'data', 'rmhbox', 'undercover-editor', 'keywords.json');
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown[];

  const valid: Keyword[] = [];
  for (const entry of raw) {
    const result = KeywordSchema.safeParse(entry);
    if (result.success) {
      valid.push(result.data);
    } else {
      logger.warn({
        event: 'ue_keyword_validation_failed',
        error: result.error.message,
        entry: JSON.stringify(entry).slice(0, 200),
      });
    }
  }

  cachedKeywords = valid;
  logger.info({ event: 'ue_keywords_loaded', totalLoaded: valid.length, totalRaw: raw.length });
  return cachedKeywords;
}

/**
 * Reset cached data (useful for testing).
 */
export function resetDataCache(): void {
  cachedPrompts = null;
  cachedKeywords = null;
}

// ─── Indexed types for deduplication ─────────────────────────────

/** A prompt tagged with its original pool index for deduplication. */
export type IndexedPrompt = StoryPrompt & { poolIndex: number };

/** A keyword tagged with its original pool index for deduplication. */
export type IndexedKeyword = Keyword & { poolIndex: number };

// ─── Selection ───────────────────────────────────────────────────

/**
 * Select a random story prompt not in the used index set.
 */
export function selectPromptForGame(pool: StoryPrompt[], usedIndices: Set<number>): IndexedPrompt {
  if (pool.length === 0) {
    throw new Error('Cannot select prompt from empty pool');
  }
  const available: IndexedPrompt[] = pool
    .map((p, index) => ({ ...p, poolIndex: index }))
    .filter((p) => !usedIndices.has(p.poolIndex));

  if (available.length === 0) {
    // Fall back to any prompt if all are used
    const idx = Math.floor(Math.random() * pool.length);
    return { ...pool[idx], poolIndex: idx };
  }
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Select a random keyword not in the used index set.
 */
export function selectKeywordForGame(pool: Keyword[], usedIndices: Set<number>): IndexedKeyword {
  if (pool.length === 0) {
    throw new Error('Cannot select keyword from empty pool');
  }
  const available: IndexedKeyword[] = pool
    .map((k, index) => ({ ...k, poolIndex: index }))
    .filter((k) => !usedIndices.has(k.poolIndex));

  if (available.length === 0) {
    const idx = Math.floor(Math.random() * pool.length);
    return { ...pool[idx], poolIndex: idx };
  }
  return available[Math.floor(Math.random() * available.length)];
}
