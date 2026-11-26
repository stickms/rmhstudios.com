/**
 * What the shared conflict dialog says about a House Always Wins run.
 *
 * `lib/house-always-wins/cloud.ts` returns figures (it has no translator); the sentences are written here, where the
 * strings are extracted.
 */
import { hawFigures, type HawSave } from '@/lib/house-always-wins/cloud';
import type { SaveSummary, SummaryTranslate } from '@/lib/game-saves/conflict';

export function describeHawSave(save: HawSave, t: SummaryTranslate): SaveSummary {
  const f = hawFigures(save);
  const lines = [
    { label: t('save-summary-chips', { ns: 'haw-saves', defaultValue: 'Chips' }), value: String(f.chips) },
    { label: t('save-summary-debt', { ns: 'haw-saves', defaultValue: 'Debt' }), value: String(f.debt) },
    { label: t('save-summary-keys', { ns: 'haw-saves', defaultValue: 'Vault keys' }), value: `${f.keys} / 3` },
    {
      label: t('save-summary-abilities', { ns: 'haw-saves', defaultValue: 'Abilities' }),
      value: `${f.abilities} / 3`,
    },
  ];
  if (f.cycles > 0) {
    lines.push({
      label: t('save-summary-cycles', { ns: 'haw-saves', defaultValue: 'New Game+ runs' }),
      value: String(f.cycles),
    });
  }
  return {
    savedAt: f.savedAt,
    headline:
      f.slot === 'ngplus'
        ? t('save-summary-rooms-ngplus', {
            ns: 'haw-saves',
            rooms: f.rooms,
            defaultValue: 'New Game+, rooms visited: {{rooms}}',
          })
        : t('save-summary-rooms', { ns: 'haw-saves', rooms: f.rooms, defaultValue: 'Rooms visited: {{rooms}}' }),
    lines,
  };
}
