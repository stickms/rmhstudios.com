/**
 * The code-split imports of the playable minigames, shared by
 * MinigameRenderer (which renders them through React.lazy) and PreloadScreen
 * (which loads the chunk during PRELOADING and only then reports ready).
 *
 * Reporting ready before the chunk had loaded let a slow client (cold cache,
 * Discord's proxy) mount the game after its first short phase (2-5 s) had
 * already begun, so it missed that phase's events and sat on the wrong screen.
 * A module import is cached, so the lazy component resolves at once later.
 */

import type { ComponentType } from 'react';
import type { MinigameProps } from './MinigameRenderer';

type MinigameModule = {
  default: ComponentType<MinigameProps>;
};

export const MINIGAME_LOADERS: Record<string, () => Promise<MinigameModule>> = {
  'rhyme-time': () => import('./rhyme-time/RhymeTimeGame'),
  'undercover-agent': () => import('./undercover-agent/UndercoverAgentGame'),
  'category-crash': () => import('./category-crash/CategoryCrashGame'),
  'wiki-race': () => import('./wiki-race/WikiRaceGame'),
  'wit-war': () => import('./wit-war/WitWarGame'),
  'fact-or-friction': () => import('./fact-or-friction/FactOrFrictionGame'),
  'undercover-editor': () => import('./undercover-editor/UndercoverEditorGame'),
  'minimalist-masterpiece': () => import('./minimalist-masterpiece/MinimalistMasterpieceGame'),
  'emoji-cinema': () => import('./emoji-cinema/EmojiCinemaGame'),
  'ranking-file': () => import('./ranking-file/RankingFileGame'),
  'sequence-sam': () => import('./sequence-sam/SequenceSamGame'),
  'identity-crisis': () => import('./identity-crisis/IdentityCrisisGame'),
};

/** Load a minigame's code. Resolves (never rejects) once it is loaded or has failed. */
export async function preloadMinigame(minigameId: string | null | undefined): Promise<void> {
  const load = minigameId ? MINIGAME_LOADERS[minigameId] : undefined;
  if (!load) return;
  try {
    await load();
  } catch {
    // The renderer's error boundary reports a chunk that fails to load.
  }
}
