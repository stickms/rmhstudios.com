'use client';

/**
 * The community composer: the site's ComposeBox plus a flair picker (N1) and the
 * posting-requirement notice (S2). Posting rules are enforced on the server; this
 * component explains them up front so a refusal is never a surprise.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNowStrict } from 'date-fns';
import { ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { ComposeBox } from '@/components/feed/ComposeBox';
import { FlairChip } from '@/components/communities/FlairChip';
import type { CommunityExtrasDTO } from '@/lib/communities/plus-schema';
import type { FeedItem } from '@/lib/feed-types';

function PostingNotice({ posting }: { posting: CommunityExtrasDTO['posting'] }) {
  const { t } = useTranslation('f-communities-plus');
  const wait =
    posting.remainingMs && posting.remainingMs > 0
      ? formatDistanceToNowStrict(new Date(Date.now() + posting.remainingMs))
      : '';
  let text: string;
  if (posting.reason === 'email') {
    text = t('posting-email', {
      defaultValue:
        'This community requires a verified email address before you can post. Verify your email in your account settings.',
    });
  } else if (posting.reason === 'account_age') {
    text = t('posting-account-age', {
      days: posting.value,
      wait,
      defaultValue:
        'This community requires accounts at least {{days}} days old. You can post in {{wait}}.',
    });
  } else {
    text = t('posting-member-age', {
      minutes: posting.value,
      wait,
      defaultValue:
        'New members can post after {{minutes}} minutes in this community. You can post in {{wait}}.',
    });
  }
  return (
    <div role="status" className="glass-fill m-3 flex items-start gap-3 p-4 text-sm text-site-text">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-site-warning" aria-hidden />
      <p>{text}</p>
    </div>
  );
}

export function CommunityComposer({
  communityId,
  extras,
  challengeId,
  onPosted,
}: {
  communityId: string;
  extras: CommunityExtrasDTO | null;
  /** Set when the post is an entry to the running challenge (N5). */
  challengeId?: string;
  onPosted: (item: FeedItem) => void;
}) {
  const { t } = useTranslation('f-communities-plus');
  const [flairId, setFlairId] = useState<string | null>(null);

  if (extras && !extras.posting.ok) return <PostingNotice posting={extras.posting} />;

  const handlePosted = (data: FeedItem & { held?: boolean; message?: string }) => {
    if (data.held) {
      toast.info(
        data.message ||
          t('post-held', {
            defaultValue: 'Your post is being held for review by the community moderators.',
          }),
      );
    } else {
      onPosted(data);
    }
    setFlairId(null);
  };

  const flairs = extras?.flairs ?? [];
  return (
    <div>
      {flairs.length > 0 && (
        <div
          className="px-4 pt-3"
          role="group"
          aria-label={t('flair-picker', { defaultValue: 'Post flair' })}
        >
          <p className="mb-1.5 text-xs text-site-text-muted">
            {extras?.flairRequired
              ? t('flair-required', { defaultValue: 'Choose a flair for your post (required)' })
              : t('flair-optional', { defaultValue: 'Add a flair (optional)' })}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {flairs.map((f) => (
              <FlairChip
                key={f.id}
                as="button"
                flair={f}
                aria-pressed={flairId === f.id}
                onClick={() => setFlairId((cur) => (cur === f.id ? null : f.id))}
                className={`cursor-pointer focus-visible:ring-2 focus-visible:ring-site-accent ${
                  flairId === f.id ? 'ring-2 ring-site-accent' : 'opacity-80 hover:opacity-100'
                }`}
              />
            ))}
          </div>
        </div>
      )}
      <ComposeBox
        communityId={communityId}
        extraBody={{
          ...(flairId ? { flairId } : {}),
          ...(challengeId ? { challengeId } : {}),
        }}
        onPosted={handlePosted}
      />
    </div>
  );
}
