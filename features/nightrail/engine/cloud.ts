/**
 * Nightrail's unlocked lines, on the shared kit.
 *
 * The whole save is "which of the five lines have I opened": one `localStorage` key (`nightrail.unlocks`, a sorted
 * array) and therefore one browser. This is Neon Driftway's shape (`lib/neon-driftway/cloud.ts`) with two differences:
 *
 * - **A union, never a conflict.** Lines are opened and never closed, so two copies that each opened something the
 *   other did not simply both count: the merged set loses nothing, and there is nothing to ask. `resolve` returns the
 *   union instead of the kit's `chooseSave`, which would call {1,2,3} against {1,2,4} a conflict.
 * - **A compare-and-set transport.** The kit's `jsonTransport` is last-writer-wins; `casJsonTransport` sends the
 *   `updatedAt` it last saw, so a stale tab is refused (409) instead of overwriting. On a refusal the account copy is
 *   read again, folded in (the union again) and written once more.
 *
 * Stored as a sorted array, never a `Set`: a `Set` JSON-stringifies to `{}`.
 *
 * Nightrail is an island: nothing here imports React Query or the router.
 */
import { casJsonTransport, SaveNotWrittenError } from '@/lib/game-saves/cas-transport';
import { createCloudSave, type CloudSave } from '@/lib/game-saves/cloud-save';
import { untranslated, type SaveChoice, type SaveSummary, type SummaryTranslate } from '@/lib/game-saves/conflict';
import { LEVEL_ORDER } from './levels';
import type { LevelId } from './types';

export const NIGHTRAIL_STORAGE_KEY = 'nightrail.unlocks';
export const NIGHTRAIL_GAME_ID = 'nightrail';

export type NightrailSave = LevelId[];

/** The unlocked set as a sorted list: only real lines, and the first line is always open. */
export function normaliseUnlocks(raw: unknown): NightrailSave {
  const list = Array.isArray(raw) ? raw : [];
  const unlocked = new Set<LevelId>([LEVEL_ORDER[0]]);
  for (const value of list) {
    if ((LEVEL_ORDER as readonly unknown[]).includes(value)) unlocked.add(value as LevelId);
  }
  return [...unlocked].sort((a, b) => a - b);
}

const same = (a: NightrailSave, b: NightrailSave) => a.length === b.length && a.every((id, i) => id === b[i]);

export function summarizeNightrailSave(save: NightrailSave, t: SummaryTranslate = untranslated): SaveSummary {
  return {
    savedAt: 0,
    headline: t('save-summary-lines', {
      count: save.length,
      total: LEVEL_ORDER.length,
      defaultValue: '{{count}} of {{total}} lines',
    }),
    lines: [
      {
        label: t('save-summary-furthest', { defaultValue: 'Furthest line' }),
        value: String(Math.max(...save, LEVEL_ORDER[0])),
      },
    ],
  };
}

const transport = casJsonTransport(NIGHTRAIL_GAME_ID);

const base = createCloudSave<NightrailSave>({
  gameId: NIGHTRAIL_GAME_ID,
  localKey: NIGHTRAIL_STORAGE_KEY,
  transport,

  // Never `null`: an unreadable save is "line one only", which is where every player starts anyway.
  parse: (raw) => normaliseUnlocks(raw),

  // Not used to decide (resolve below takes the union); the count is what a summary would compare.
  monotonic: (save) => ({ unlocked: save.length }),

  summarize: (save) => summarizeNightrailSave(save),
});

export const nightrailSave: CloudSave<NightrailSave> = {
  ...base,

  /**
   * Read both sides and merge: the union of the lines each has opened. Never a conflict. The merged set is written
   * to this device when it adds something here; whether the account needs it is `origin`.
   */
  async resolve(): Promise<SaveChoice<NightrailSave>> {
    const local = base.readLocal();
    const cloud = await base.readCloud();
    if (!local && !cloud) return { kind: 'none' };

    const merged = normaliseUnlocks([...(local ?? []), ...(cloud ?? [])]);
    if (!local || !same(merged, local)) base.writeLocal(merged);
    // `cloud` origin: the account already holds exactly this, so nothing is sent.
    return { kind: 'resolved', origin: cloud && same(merged, cloud) ? 'cloud' : 'local', save: merged };
  },
};

/**
 * Write the unlocks everywhere they belong: this device first, synchronously, then the account. Resolves with the
 * set the player now has, which is larger than the one passed only when another device had opened more lines.
 */
export async function persistNightrailUnlocks(unlocks: Iterable<number>): Promise<NightrailSave> {
  const save = normaliseUnlocks([...unlocks]);
  nightrailSave.writeLocal(save);
  try {
    await nightrailSave.writeCloud(save);
    return save;
  } catch (error) {
    // Offline, over the limit or not yet read: the local copy stands and the next visit syncs.
    if (!(error instanceof SaveNotWrittenError) || error.reason !== 'stale') return save;
  }
  // Another device saved first. Fold its lines in (a union loses nothing) and write once more.
  const choice = await nightrailSave.resolve();
  const merged = choice.kind === 'resolved' ? choice.save : save;
  await nightrailSave.writeCloud(merged).catch(() => {});
  return merged;
}
