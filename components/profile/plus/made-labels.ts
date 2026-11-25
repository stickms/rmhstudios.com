/**
 * The "Made here" module's words (namespace `profile-made`), written out as literal `t()` calls so
 * `pnpm i18n:extract` sees every key. `lib/` returns kinds and figure units; this turns them into text.
 */
import type { TFunction } from 'i18next';
import type { MadeFigure, MadeKind } from '@/lib/profile/made';

/** What each kind is called, in a row and in the editor's list of kinds. */
export function madeKindLabels(t: TFunction): Record<MadeKind, string> {
  return {
    connections: t('kind-connections', { ns: 'profile-made', defaultValue: 'Connections grid' }),
    'lights-out': t('kind-lights-out', { ns: 'profile-made', defaultValue: 'Lights Out board' }),
    deck: t('kind-deck', { ns: 'profile-made', defaultValue: 'Deck' }),
    chart: t('kind-chart', { ns: 'profile-made', defaultValue: 'Slice It chart' }),
    build: t('kind-build', { ns: 'profile-made', defaultValue: 'Build' }),
  };
}

/** A row's one figure as text: plays, cards, releases, or a chart's tier. */
export function madeFigureText(t: TFunction, figure: MadeFigure): string {
  const count = typeof figure.value === 'number' ? figure.value : 0;
  switch (figure.unit) {
    case 'plays':
      return t('figure-plays', { ns: 'profile-made', count, defaultValue: '{{count}} plays' });
    case 'cards':
      return t('figure-cards', { ns: 'profile-made', count, defaultValue: '{{count}} cards' });
    case 'releases':
      return t('figure-releases', { ns: 'profile-made', count, defaultValue: '{{count}} releases' });
    case 'difficulty':
      switch (figure.value) {
        case 'easy':
          return t('difficulty-easy', { ns: 'profile-made', defaultValue: 'Easy' });
        case 'normal':
          return t('difficulty-normal', { ns: 'profile-made', defaultValue: 'Normal' });
        case 'hard':
          return t('difficulty-hard', { ns: 'profile-made', defaultValue: 'Hard' });
        case 'expert':
          return t('difficulty-expert', { ns: 'profile-made', defaultValue: 'Expert' });
        default:
          return '';
      }
  }
}
