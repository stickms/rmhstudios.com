import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { SpineItem } from '@/components/ui/spine';
import { MAX_COMMENT_LENGTH } from '@/lib/rmhark-limits';
import type { FeedItem } from '@/lib/feed-types';
import { AIGenerateButton } from '../AIGenerateButton';
import { MentionTextarea } from '../MentionTextarea';
import { UserAvatar } from '../UserAvatar';
import { REPLY_INPUT_ID } from './reply-input-id';
import { canSubmitReply, remainingReplyChars } from './post-detail-state';
import type { ReplyComposerState } from './useReplyComposer';

interface ReplyComposerProps {
  post: FeedItem;
  postId: string;
  /** The signed-in user, or null for the sign-in prompt. */
  sessionUser: { id: string; name?: string | null; image?: string | null } | null;
  resolvedUser: { name?: string | null; image?: string | null } | null;
  composer: ReplyComposerState;
  pathname: string;
}

/**
 * The reply field: the first item under the post, with no dot (P3: a form hangs dotless). Avatar, a borderless field (K4: a
 * field inside a row has no border and no fill) and Reply, the page's one primary button (R4). Signed out, the same place
 * holds one line and a Sign in button, which is then the page's primary.
 */
export function ReplyComposer({
  post,
  postId,
  sessionUser,
  resolvedUser,
  composer,
  pathname,
}: ReplyComposerProps) {
  const { t } = useTranslation('feed');
  const { commentContent, setCommentContent, submitting, handleSubmit } = composer;
  const remaining = remainingReplyChars(commentContent);

  if (!sessionUser) {
    return (
      <SpineItem dot={false} className="flex flex-wrap items-center justify-between gap-3">
        <p className="t-body text-site-text-muted">
          {t('sign-in-to-reply', { defaultValue: 'Sign in to reply' })}
        </p>
        <Button asChild variant="primary">
          <Link to="/login" search={{ callbackURL: pathname }}>
            {t('sign-in', { defaultValue: 'Sign in' })}
          </Link>
        </Button>
      </SpineItem>
    );
  }

  return (
    <SpineItem as="section" dot={false} aria-label={t('reply', { defaultValue: 'Reply' })}>
      {post.replyControl && post.replyControl !== 'EVERYONE' && (
        <p className="t-meta mb-3">
          {post.replyControl === 'FOLLOWING'
            ? t('reply-limited-following', {
                defaultValue: 'Accounts the author follows can reply',
              })
            : t('reply-limited-mentioned', {
                defaultValue: 'Only accounts the author mentioned can reply',
              })}
        </p>
      )}
      <div className="flex gap-3">
        <UserAvatar
          user={{
            id: sessionUser.id,
            name: resolvedUser?.name || sessionUser.name,
            image: resolvedUser?.image || sessionUser.image,
          }}
          size="sm"
          linkToProfile={false}
        />
        <div className="min-w-0 flex-1">
          <MentionTextarea
            id={REPLY_INPUT_ID}
            value={commentContent}
            onChange={setCommentContent}
            placeholder={t('reply-placeholder', { defaultValue: 'Post your reply...' })}
            rows={2}
            maxLength={MAX_COMMENT_LENGTH}
            className="field-bare t-post w-full resize-none rounded-none border-0 bg-transparent p-0 text-site-text placeholder:text-site-text-muted"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSubmit();
              }
            }}
          />
          <div className="mt-3 flex items-center justify-between">
            <span className={`t-meta ${remaining <= 20 ? 'font-semibold text-site-danger' : ''}`}>
              {remaining}
            </span>
            <div className="flex items-center gap-2">
              <AIGenerateButton
                request={{ mode: 'reply', rmharkId: postId, draft: commentContent }}
                onGenerated={(text) => setCommentContent(text)}
                size="sm"
                title={t('ai-generate-title', { defaultValue: 'Generate a reply with AI' })}
              />
              <Button
                variant="primary"
                disabled={!canSubmitReply(commentContent, submitting)}
                onClick={handleSubmit}
              >
                {submitting
                  ? t('posting', { defaultValue: 'Posting…' })
                  : t('reply', { defaultValue: 'Reply' })}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </SpineItem>
  );
}
