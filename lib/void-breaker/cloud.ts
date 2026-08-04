/**
 * Void Breaker's meta-progression, on the shared kit.
 *
 * The **meta** and not the run. Void Breaker keeps two saves: a mid-run resume
 * (`voidbreaker-save-v2`, a full engine state blob up to 200 KB) and the Void
 * Forge's permanent progression (`vb-meta` — cores, node levels, unlocked
 * characters and weapons). Only the second one goes to the account, and the
 * distinction is not laziness:
 *
 * - The meta is what a player would be upset to lose and what they expect to
 *   find on another device. It is also about two hundred bytes.
 * - The run is a session artifact. Nobody resumes a 3D twin-stick run on a
 *   different machine, and shipping a 200 KB engine blob on every autosave to
 *   make that possible would be paid for by everybody.
 */
import { createCloudSave } from '@/lib/game-saves/cloud-save';
import { untranslated, type SaveSummary, type SummaryTranslate } from '@/lib/game-saves/conflict';
import {
  coresEarned,
  emptyMeta,
  META_NODES,
  META_STORAGE_KEY,
  nodeLevel,
  type MetaState,
} from './metaProgression';

function totalLevels(state: MetaState): number {
  return META_NODES.reduce((sum, def) => sum + nodeLevel(state, def.id), 0);
}

export const voidBreakerSave = createCloudSave<MetaState>({
  gameId: 'void-breaker',
  localKey: META_STORAGE_KEY,

  parse(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const parsed = raw as MetaState;
    // The same normalising `loadMeta` does — a hand-edited or truncated save
    // comes back as a valid one rather than as a crash three screens later.
    return {
      ...emptyMeta(),
      cores: Math.max(0, Math.floor(parsed.cores ?? 0)),
      levels: parsed.levels ?? {},
      unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked : [],
      unlockedWeapons: Array.isArray(parsed.unlockedWeapons) ? parsed.unlockedWeapons : [],
    };
  },

  /**
   * `coresEarned`, not `cores`. The balance goes DOWN every time you buy
   * something, so using it would report a shopping trip as a divergence — and,
   * worse, two saves with the same unlocks and different balances would tie and
   * resolve on the clock, quietly discarding the larger one.
   */
  monotonic: (save) => ({
    coresEarned: coresEarned(save),
    levels: totalLevels(save),
    characters: save.unlocked?.length ?? 0,
    weapons: save.unlockedWeapons?.length ?? 0,
  }),

  summarize: (save) => summarizeVoidBreakerSave(save, untranslated),
});

export function summarizeVoidBreakerSave(
  save: MetaState,
  t: SummaryTranslate,
  locale = 'en',
): SaveSummary {
  const number = new Intl.NumberFormat(locale);
  return {
    // No timestamp in the format; the kit's sidecar supplies one.
    savedAt: 0,
    headline: t('save-summary-cores', {
      cores: number.format(coresEarned(save)),
      defaultValue: '{{cores}} cores banked',
    }),
    lines: [
      {
        label: t('save-summary-unspent', { defaultValue: 'Cores unspent' }),
        value: number.format(Math.max(0, Math.floor(save.cores ?? 0))),
      },
      {
        label: t('save-summary-upgrades', { defaultValue: 'Forge upgrades' }),
        value: number.format(totalLevels(save)),
      },
      {
        label: t('save-summary-characters', { defaultValue: 'Characters' }),
        value: number.format(save.unlocked?.length ?? 0),
      },
      {
        label: t('save-summary-weapons', { defaultValue: 'Weapons' }),
        value: number.format(save.unlockedWeapons?.length ?? 0),
      },
    ],
  };
}

/** Write the meta everywhere it belongs. Replaces a bare `saveMeta`. */
export function persistVoidBreakerMeta(state: MetaState): void {
  voidBreakerSave.writeLocal(state);
  voidBreakerSave.writeCloud(state).catch(() => {});
}
