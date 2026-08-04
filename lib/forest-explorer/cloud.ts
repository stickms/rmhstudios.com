/**
 * Forest Explorer's save, on the shared kit.
 *
 * The story mode already synced to an account — but with the two rules every
 * game had written for itself and every game had written slightly wrong: the
 * local copy was not stamped with whose it was (so two people on one laptop
 * shared a run), and the newer of the two copies simply won (so opening the
 * game on a second device wrote an empty save over a finished Act 2).
 *
 * The endpoint and the table are unchanged — there is nothing to gain from
 * migrating a working save — so this is the same route with the kit's rules
 * around it. See `lib/game-saves/conflict.ts` for why "newest wins" is not one.
 */
import { createCloudSave, jsonTransport } from '@/lib/game-saves/cloud-save';
import { untranslated, type SaveSummary, type SummaryTranslate } from '@/lib/game-saves/conflict';
import type { ForestExplorerSave } from './types';
import { CURRENT_VERSION, STORAGE_KEY } from './saveSystem';

/** Acts in order, so "how far in" is a number the conflict check can compare. */
const ACT_ORDER = ['act1', 'act2', 'act3'] as const;

function actIndex(save: ForestExplorerSave): number {
  const index = ACT_ORDER.indexOf(save.currentAct as (typeof ACT_ORDER)[number]);
  return index < 0 ? 0 : index;
}

/** Everything found across every act, whichever act you are standing in. */
function totals(save: ForestExplorerSave) {
  let puzzles = 0;
  let entries = 0;
  let landmarks = 0;
  for (const progress of Object.values(save.actProgress ?? {})) {
    puzzles += progress?.puzzlesSolved?.length ?? 0;
    entries += progress?.journalEntriesFound?.length ?? 0;
    landmarks += progress?.landmarksVisited?.length ?? 0;
  }
  return { puzzles, entries, landmarks };
}

export const forestExplorerSave = createCloudSave<ForestExplorerSave>({
  gameId: 'forest-explorer',
  localKey: STORAGE_KEY,
  transport: jsonTransport('/api/forest-explorer/save'),

  parse(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const save = raw as ForestExplorerSave;
    // The same two checks `loadGame` made: a save from another version is not a
    // save this build can read, and one missing its act is corrupt.
    if (save.version !== CURRENT_VERSION) return null;
    if (!save.currentAct || !save.actProgress) return null;
    return save;
  },

  monotonic: (save) => {
    const { puzzles, entries, landmarks } = totals(save);
    return {
      act: actIndex(save),
      playtime: save.playtime ?? 0,
      puzzles,
      entries,
      landmarks,
    };
  },

  savedAt: (save) => save.savedAt ?? 0,
  summarize: (save) => summarizeForestSave(save, untranslated),
});

export function summarizeForestSave(
  save: ForestExplorerSave,
  t: SummaryTranslate,
): SaveSummary {
  const { puzzles, entries, landmarks } = totals(save);
  const hours = Math.floor((save.playtime ?? 0) / 3600);
  const minutes = Math.floor(((save.playtime ?? 0) % 3600) / 60);

  return {
    savedAt: save.savedAt ?? 0,
    headline: t('save-summary-act', {
      act: actIndex(save) + 1,
      defaultValue: 'Act {{act}}',
    }),
    lines: [
      {
        label: t('save-summary-playtime', { defaultValue: 'Played for' }),
        value: hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`,
      },
      { label: t('save-summary-puzzles', { defaultValue: 'Puzzles solved' }), value: String(puzzles) },
      { label: t('save-summary-journal', { defaultValue: 'Journal entries' }), value: String(entries) },
      { label: t('save-summary-landmarks', { defaultValue: 'Landmarks' }), value: String(landmarks) },
    ],
  };
}
