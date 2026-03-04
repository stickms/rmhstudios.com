import { CHAPTER_1, CH01_PUZZLE, CH01_POST_PUZZLE_SCENES } from './ch01';
import { ALL_CHAPTERS } from '../progress';
import type { ChapterData, Scene, WordSelectPuzzleData, LineArrangePuzzleData } from '../types';

export interface ChapterEntry {
  data: ChapterData;
  puzzle: WordSelectPuzzleData | LineArrangePuzzleData | null;
  postPuzzleScenes: Scene[];
  /** Word categories to seed the word pool for word_select puzzles */
  puzzleCategories?: string[];
}

/**
 * Registry of all playable chapters. Add new chapters here as they're created.
 * The key must match the chapter's `id` field.
 */
export const CHAPTER_REGISTRY: Record<string, ChapterEntry> = {
  ch01: {
    data: CHAPTER_1,
    puzzle: CH01_PUZZLE,
    postPuzzleScenes: CH01_POST_PUZZLE_SCENES,
    puzzleCategories: ['night', 'flowers', 'solitude', 'warmth', 'light'],
  },
};

export function getChapterEntry(chapterId: string): ChapterEntry | null {
  return CHAPTER_REGISTRY[chapterId] ?? null;
}

/**
 * Returns the next chapter ID based on the ALL_CHAPTERS catalog order,
 * but only if the chapter has actual data in the registry.
 */
export function getNextChapterId(currentChapterId: string): string | null {
  const catalogIdx = ALL_CHAPTERS.findIndex(c => c.id === currentChapterId);
  if (catalogIdx === -1) return null;

  // Look for the next chapter that has data in the registry
  for (let i = catalogIdx + 1; i < ALL_CHAPTERS.length; i++) {
    if (CHAPTER_REGISTRY[ALL_CHAPTERS[i].id]) {
      return ALL_CHAPTERS[i].id;
    }
  }
  return null;
}
