import { useTranslation } from 'react-i18next';
import type { SectionId } from './sections';

/**
 * The section words ("You" is listed on `/sections` only; the sidebar's account row stands for it). They are written out here, one `t()` call each, so `pnpm i18n:extract` finds them (a key held in a
 * data table is invisible to the extractor and every locale would serve the English default).
 */
export function useSectionLabels(): Record<SectionId, string> {
  const { t } = useTranslation('feed');
  return {
    front: t('shell-section-feed', { defaultValue: 'Feed' }),
    explore: t('shell-section-explore', { defaultValue: 'Explore' }),
    games: t('shell-section-games', { defaultValue: 'Games' }),
    inbox: t('shell-section-inbox', { defaultValue: 'Inbox' }),
    you: t('shell-section-you', { defaultValue: 'You' }),
  };
}
