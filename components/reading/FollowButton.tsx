import { Bell, BellRing } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/button';
import { useReadingFollow } from '@/components/reading/useReadingFollow';
import type { SubscriptionKind } from '@/lib/reading/subscriptions';

// Literal t() keys per kind: i18next-cli cannot see a templated key. The name carries the target so a screen
// reader hears what the toggle follows ("Follow Science news"), and it stays the same when pressed (`aria-pressed`
// says which state it is in).
function followName(t: TFunction, kind: SubscriptionKind, target: string): string {
  switch (kind) {
    case 'blog':
      return t('follow-blog', {
        defaultValue: 'Follow the Logs',
      });
    case 'blog_tag':
      return t('follow-tag', {
        defaultValue: 'Follow the {{tag}} tag',
        tag: target,
      });
    case 'news_category':
      return t('follow-category', {
        defaultValue: 'Follow {{category}} news',
        category: target,
      });
    case 'news_story':
      return t('follow-story', {
        defaultValue: 'Follow this story',
      });
  }
}

/**
 * A secondary toggle that follows the Logs, a Log tag, a News category or a story: "Follow", then "Following" and a
 * second press unfollows. Members only; a signed-out visitor sees nothing (the RSS links stay where they are).
 * Never the view's ink primary.
 */
export function FollowButton({
  kind,
  target = '',
  className,
}: {
  kind: SubscriptionKind;
  target?: string;
  className?: string;
}) {
  const { t } = useTranslation('subscriptions');
  const { signedIn, loading, busy, find, toggle } = useReadingFollow();
  if (!signedIn) return null;
  const following = !!find(kind, target);
  const Icon = following ? BellRing : Bell;
  return (
    <Button
      type="button"
      variant="default"
      size="sm"
      className={className}
      aria-pressed={following}
      aria-label={followName(t, kind, target)}
      aria-busy={loading || busy !== null}
      disabled={loading || busy !== null}
      onClick={() => void toggle(kind, target)}
    >
      <Icon aria-hidden />
      {following
        ? t('following', {
            defaultValue: 'Following',
          })
        : t('follow', {
            defaultValue: 'Follow',
          })}
    </Button>
  );
}
