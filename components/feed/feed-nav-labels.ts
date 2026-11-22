import { useTranslation } from 'react-i18next';

/**
 * The labels of the nine post-navigation bindings, for the `?` overlay and /settings/keyboard. The registry carries a
 * key and an English default as data; the literal calls live here, where the string extractor can see them. Returns
 * `undefined` for any other id, so the caller falls back to its own lookup.
 */
export function useFeedNavLabel(): (id: string) => string | undefined {
  const { t } = useTranslation('feed-keyboard');
  const labels: Record<string, string> = {
    'feed.nav.next': t('kbd-next', {
      defaultValue: 'Next post',
    }),
    'feed.nav.prev': t('kbd-prev', {
      defaultValue: 'Previous post',
    }),
    'feed.nav.open': t('kbd-open', {
      defaultValue: 'Open post',
    }),
    'feed.nav.like': t('kbd-like', {
      defaultValue: 'Like or unlike',
    }),
    'feed.nav.reply': t('kbd-reply', {
      defaultValue: 'Reply',
    }),
    'feed.nav.repost': t('kbd-repost', {
      defaultValue: 'Repost menu',
    }),
    'feed.nav.save': t('kbd-save', {
      defaultValue: 'Save or unsave',
    }),
    'feed.nav.reveal': t('kbd-reveal', {
      defaultValue: 'Show or hide a content warning',
    }),
    'feed.nav.leave': t('kbd-leave', {
      defaultValue: 'Leave post navigation',
    }),
  };
  return (id) => labels[id];
}

/** The overlay's section heading and its one-line hint. */
export function useFeedNavCopy(): {
  heading: string;
  hint: string;
} {
  const { t } = useTranslation('feed-keyboard');
  return {
    heading: t('kbd-section-posts', {
      defaultValue: 'Posts',
    }),
    hint: t('kbd-hint', {
      defaultValue: 'Press j and k to move between posts',
    }),
  };
}
