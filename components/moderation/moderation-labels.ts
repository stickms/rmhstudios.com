/**
 * Translated labels for feature timeouts, shared by the moderation dialog, the
 * admin users page and the user's account-status page so a feature is named
 * the same way everywhere.
 */

import { useTranslation } from 'react-i18next';
import type { RestrictableFeature } from '@/lib/moderation/restrictions';

export function useFeatureLabels(): Record<RestrictableFeature, string> {
  const { t } = useTranslation('c-moderation');
  return {
    post: t('restriction-feature-post', { defaultValue: 'Posting' }),
    comment: t('restriction-feature-comment', { defaultValue: 'Replying' }),
    message: t('restriction-feature-message', { defaultValue: 'Direct messages' }),
    community: t('restriction-feature-community', { defaultValue: 'Creating communities' }),
    space: t('restriction-feature-space', { defaultValue: 'Hosting spaces' }),
    vibe: t('restriction-feature-vibe', { defaultValue: 'Building vibes' }),
    persona: t('restriction-feature-persona', { defaultValue: 'Creating personas' }),
  };
}

/** "1 day", "7 days", "Permanent". */
export function useTimeoutLabel(): (days: number | null) => string {
  const { t } = useTranslation('c-moderation');
  return (days) =>
    days === null
      ? t('restriction-permanent', { defaultValue: 'Permanent' })
      : t('restriction-days', { count: days, defaultValue_one: '{{count}} day', defaultValue: '{{count}} days' });
}
