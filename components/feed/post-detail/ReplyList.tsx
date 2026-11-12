import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/spinner';
import { SpineItem } from '@/components/ui/spine';
import { CommentItem } from '../CommentItem';
import type { Comment } from '../CommentItem';
import { HiddenRepliesGroup } from '../HiddenReplies';
import { ThreadSummary } from '../ThreadSummary';
import type { ReplyThread } from './useReplyThread';

type ReplySessionUser = NonNullable<React.ComponentProps<typeof CommentItem>['sessionUser']>;

interface ReplyListProps {
  postId: string;
  postAuthorId: string | undefined;
  comments: Comment[];
  loadingComments: boolean;
  sessionUser: ReplySessionUser | undefined;
  thread: ReplyThread;
}

/**
 * The replies, as items on the thread's spine: each reply to the post is one item (CommentItem), and everything under a
 * reply hangs on ONE nested spine inside it (P2), so the column keeps one width all the way down. Rendered as a fragment:
 * the caller owns the `Spine` these items hang on. Nothing here enters or staggers (M6).
 */
export function ReplyList({
  postId,
  postAuthorId,
  comments,
  loadingComments,
  sessionUser,
  thread,
}: ReplyListProps) {
  const { t } = useTranslation('feed');
  const { handleHiddenChange, handleReplyAdded, handleCommentRemoved } = thread;
  const renderComment = (comment: Comment) => (
    <CommentItem
      key={comment.id}
      comment={comment}
      postId={postId}
      postAuthorId={postAuthorId}
      onHiddenChange={handleHiddenChange}
      sessionUser={sessionUser}
      onReplyAdded={handleReplyAdded}
      onCommentRemoved={handleCommentRemoved}
    />
  );
  const hidden = comments.filter((c) => c.hidden);
  return (
    <>
      {!loadingComments && comments.length > 0 && (
        <ThreadSummary postId={postId} commentCount={comments.length} />
      )}
      {loadingComments ? (
        <SpineItem dot={false} className="flex justify-center">
          <Spinner />
        </SpineItem>
      ) : comments.length === 0 ? (
        <SpineItem dot={false}>
          <p className="t-body font-semibold">
            {t('no-replies-title', { defaultValue: 'No replies yet' })}
          </p>
          <p className="t-body mt-1 text-site-text-muted">
            {t('no-replies-hint', { defaultValue: 'Be the first to reply.' })}
          </p>
        </SpineItem>
      ) : (
        <>
          {comments.filter((c) => !c.hidden).map(renderComment)}
          <HiddenRepliesGroup count={hidden.length}>{hidden.map(renderComment)}</HiddenRepliesGroup>
        </>
      )}
    </>
  );
}
