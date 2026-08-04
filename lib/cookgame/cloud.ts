/**
 * Cookgame's save, on the shared kit.
 *
 * It had no account copy at all before this — the whole business lived in one
 * `localStorage` key, which meant it lived on exactly one browser and died with
 * a cleared cache. It rides the shared `/api/game-saves/cookgame` table now, and
 * the same key as before, so nobody loses the run they already have.
 */
import { createCloudSave } from '@/lib/game-saves/cloud-save';
import { untranslated, type SaveSummary, type SummaryTranslate } from '@/lib/game-saves/conflict';
import { parseSave, serializeSave, STORAGE_KEY, type SaveV4 } from './saveSystem';

export const cookgameSave = createCloudSave<SaveV4>({
  gameId: 'cookgame',
  localKey: STORAGE_KEY,

  // `parseSave` takes the raw JSON *string* — it is the same function that
  // reads localStorage, migrations and all, so a save from the server goes
  // through the identical v1→v4 path a local one does.
  parse: (raw) => parseSave(typeof raw === 'string' ? raw : JSON.stringify(raw)),

  /**
   * Cash and heat are spent, not accumulated — a save with less cash than
   * another may simply have bought a property. These five only ever rise.
   */
  monotonic: (save) => ({
    xp: save.xp ?? 0,
    clock: save.clock ?? 0,
    property: save.ownedPropertyTier ?? 0,
    recipes: save.discoveredRecipes?.length ?? 0,
    effects: save.discoveredEffects?.length ?? 0,
    keys: save.keys?.length ?? 0,
  }),

  summarize: (save) => summarizeCookgameSave(save, untranslated),
});

export function summarizeCookgameSave(
  save: SaveV4,
  t: SummaryTranslate,
  locale = 'en',
): SaveSummary {
  const number = new Intl.NumberFormat(locale);
  return {
    // No timestamp in the format; the kit's sidecar supplies one.
    savedAt: 0,
    headline: t('save-summary-cash', {
      cash: number.format(Math.round(save.cash ?? 0)),
      defaultValue: '${{cash}}',
    }),
    lines: [
      { label: t('save-summary-xp', { defaultValue: 'XP' }), value: number.format(Math.round(save.xp ?? 0)) },
      {
        label: t('save-summary-recipes', { defaultValue: 'Recipes known' }),
        value: number.format(save.discoveredRecipes?.length ?? 0),
      },
      {
        label: t('save-summary-property', { defaultValue: 'Property tier' }),
        value: String(save.ownedPropertyTier ?? 0),
      },
      {
        label: t('save-summary-district', { defaultValue: 'District' }),
        value: String(save.currentDistrict ?? '—'),
      },
    ],
  };
}

/** Write the save everywhere it belongs. Called by the store's `saveNow`. */
export function persistCookgameSave(save: SaveV4): void {
  cookgameSave.writeLocal(save);
  // Best-effort and unawaited: the local write above has already landed, and a
  // dropped request costs nothing but a slightly stale account copy.
  cookgameSave.writeCloud(save).catch(() => {});
}

/** Kept for the export/import path, which still speaks strings. */
export { serializeSave };
