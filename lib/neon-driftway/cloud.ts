/**
 * Neon Driftway's unlocked levels, on the shared kit.
 *
 * The whole save is "which of the three tracks have I opened", which was one
 * `localStorage` key and therefore one browser. It is small, but it is also the
 * only thing the game remembers about you — losing it means driving the first
 * track again to get back to the third.
 *
 * Stored as a sorted array rather than a `Set`: a `Set` JSON-stringifies to
 * `{}`, which is the kind of bug that only shows up once the save has already
 * been overwritten.
 */
import { createCloudSave } from '@/lib/game-saves/cloud-save';
import { untranslated, type SaveSummary, type SummaryTranslate } from '@/lib/game-saves/conflict';

export const NEON_DRIFTWAY_STORAGE_KEY = 'neon-driftway.unlocks';

/** The levels that exist. Track 1 is always open. */
const LEVELS = [1, 2, 3] as const;
export type NeonLevelId = (typeof LEVELS)[number];

export type NeonDriftwaySave = NeonLevelId[];

function normalise(raw: unknown): NeonDriftwaySave {
  const list = Array.isArray(raw) ? raw : [];
  const unlocked = new Set<NeonLevelId>([1]);
  for (const value of list) {
    if (LEVELS.includes(value as NeonLevelId)) unlocked.add(value as NeonLevelId);
  }
  return [...unlocked].sort((a, b) => a - b);
}

export const neonDriftwaySave = createCloudSave<NeonDriftwaySave>({
  gameId: 'neon-driftway',
  localKey: NEON_DRIFTWAY_STORAGE_KEY,

  // Never `null`: an unreadable save is "track 1 only", which is where every
  // player starts anyway — there is nothing here worth refusing to load over.
  parse: (raw) => normalise(raw),

  // Levels are opened and never closed, so the count is the whole comparison:
  // one save always contains the other unless they were opened in different
  // orders, which cannot happen because they open in sequence.
  monotonic: (save) => ({ unlocked: save.length }),

  summarize: (save) => summarizeNeonDriftwaySave(save, untranslated),
});

export function summarizeNeonDriftwaySave(
  save: NeonDriftwaySave,
  t: SummaryTranslate,
): SaveSummary {
  return {
    savedAt: 0,
    headline: t('save-summary-tracks', {
      count: save.length,
      total: LEVELS.length,
      defaultValue: '{{count}} of {{total}} tracks',
    }),
    lines: [
      {
        label: t('save-summary-furthest', { defaultValue: 'Furthest track' }),
        value: String(Math.max(...save, 1)),
      },
    ],
  };
}

/** Write the unlocks everywhere they belong. */
export function persistNeonDriftwayUnlocks(unlocks: Iterable<number>): void {
  const save = normalise([...unlocks]);
  neonDriftwaySave.writeLocal(save);
  neonDriftwaySave.writeCloud(save).catch(() => {});
}
