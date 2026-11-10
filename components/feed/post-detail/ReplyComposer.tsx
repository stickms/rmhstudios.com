import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { MAX_COMMENT_LENGTH } from '@/lib/rmhark-limits';
import type { FeedItem } from '@/lib/feed-types';
import { AIGenerateButton } from '../AIGenerateButton';
import { MentionTextarea } from '../MentionTextarea';
import { UserAvatar } from '../UserAvatar';
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
 * Reply surface. Signed in: the composer, a singular panel (`.glass-pane`)
 * around a `.glass-inset` field, the same grammar as the feed's composer.
 * Signed out: a quiet `.glass-fill` card with the one way forward.
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
      <div className="glass-fill flex flex-wrap items-center justify-between gap-3 rounded-site px-5 py-4">
        <p className="text-sm text-site-text-muted">
          {t('sign-in-to-reply', { defaultValue: 'Sign in to reply' })}
        </p>
        <Link to="/login" search={{ callbackURL: pathname }}>
          <Button variant="accent" size="sm" tabIndex={-1}>
            {t('sign-in', { defaultValue: 'Sign in' })}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <section
      className="glass-pane post-page__compose"
      aria-label={t('reply', { defaultValue: 'Reply' })}
    >
      {post.replyControl && post.replyControl !== 'EVERYONE' && (
        <p className="mb-3 flex items-center gap-2 text-xs text-site-text-muted">
          <MessageCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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
        {/* User avatar */}
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
            id="post-comment-input"
            value={commentContent}
            onChange={setCommentContent}
            placeholder={t('reply-placeholder', { defaultValue: 'Post your reply...' })}
            rows={2}
            maxLength={MAX_COMMENT_LENGTH}
            className="glass-inset w-full resize-none rounded-site px-4 py-3 text-sm text-site-text outline-none transition-colors placeholder:text-site-text-dim focus:border-site-accent"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSubmit();
              }
            }}
          />
          <div className="mt-3 flex items-center justify-between">
            <span
              className={`font-mono text-xs ${remaining <= 20 ? 'text-site-warning' : 'text-site-text-muted'}`}
            >
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
                variant="accent"
                size="sm"
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
    </section>
  );
}
