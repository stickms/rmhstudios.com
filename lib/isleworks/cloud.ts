/**
 * Isleworks' city, on the shared kit.
 *
 * The save was `localStorage` and nothing else — a city was tied to one browser
 * and died with a cleared cache. It goes to the account too now, on the shared
 * `/api/game-saves/isleworks` table, keeping the same key so no existing city is
 * orphaned.
 *
 * The stored payload is `SavedCity`, not `CityState`: the format deliberately
 * holds only what cannot be recomputed — the seed, the placed buildings, the
 * treasury and the counters that carry history — so a finished city is a few
 * kilobytes and can never disagree with the simulation. That property is what
 * makes it small enough to send at all.
 */
import { createCloudSave } from '@/lib/game-saves/cloud-save';
import { untranslated, type SaveSummary, type SummaryTranslate } from '@/lib/game-saves/conflict';
import { SAVE_KEY, SAVE_VERSION, type SavedCity } from './save-format';

export const isleworksSave = createCloudSave<SavedCity>({
  gameId: 'isleworks',
  localKey: SAVE_KEY,

  parse(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const payload = raw as SavedCity;
    if (payload.v !== SAVE_VERSION || typeof payload.seed !== 'number') return null;
    return payload;
  },

  /**
   * A city can lose money and lose residents — it cannot un-build. Months
   * elapsed, buildings standing, parcels bought and objectives claimed are the
   * four that only ever rise, and `peak` is the high-water mark by definition.
   */
  monotonic: (save) => ({
    month: save.month ?? 0,
    peak: save.peak ?? 0,
    buildings: save.buildings?.length ?? 0,
    parcels: save.parcels?.length ?? 0,
    claimed: save.claimed?.length ?? 0,
    completed: save.completed?.length ?? 0,
  }),

  summarize: (save) => summarizeIsleworksSave(save, untranslated),
});

/**
 * `locale` rather than a hardcoded `en-US`: a treasury and a headcount are read
 * by whoever is playing, and the grouping separator is not the same character
 * in every language this site ships. It defaults to English for the callers
 * outside React, which have no locale to offer.
 */
export function summarizeIsleworksSave(
  save: SavedCity,
  t: SummaryTranslate,
  locale = 'en',
): SaveSummary {
  const number = new Intl.NumberFormat(locale);
  return {
    // No timestamp in the format; the kit's sidecar supplies one.
    savedAt: 0,
    headline: t('save-summary-month', {
      month: save.month ?? 1,
      defaultValue: 'Month {{month}}',
    }),
    lines: [
      {
        label: t('save-summary-residents', { defaultValue: 'Residents' }),
        value: number.format(save.population ?? 0),
      },
      {
        label: t('save-summary-buildings', { defaultValue: 'Buildings' }),
        value: number.format(save.buildings?.length ?? 0),
      },
      {
        label: t('save-summary-parcels', { defaultValue: 'Parcels owned' }),
        value: number.format(save.parcels?.length ?? 0),
      },
      {
        label: t('save-summary-treasury', { defaultValue: 'Treasury' }),
        value: `$${number.format(Math.round(save.money ?? 0))}`,
      },
    ],
  };
}
