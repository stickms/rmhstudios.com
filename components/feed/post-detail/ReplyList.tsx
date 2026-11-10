import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react';
import { m as motion } from 'framer-motion';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { staggerContainer, staggerItem } from '@/lib/motion';
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
 * Replies: each top-level reply is its own card (CommentItem draws it), and
 * nested replies indent inside their parent's card, so the column keeps one
 * width all the way down.
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
  return (
    <>
      {!loadingComments && comments.length > 0 && (
        <ThreadSummary postId={postId} commentCount={comments.length} />
      )}
      {loadingComments ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : comments.length === 0 ? (
        <div className="glass-fill rounded-site">
          <EmptyState
            icon={MessageCircle}
            title={t('no-replies-title', { defaultValue: 'No replies yet' })}
            description={t('no-replies-hint', { defaultValue: 'Be the first to reply.' })}
            className="py-8"
          />
        </div>
      ) : (
        // §16.3.5 — one entrance per navigation. The post body is fetched
        // CLIENT-side (the route loader only has meta+sidebar), so the column
        // enters ONCE via `page-enter`/the liquid-open morph while a spinner
        // shows, THEN the replies arrive a beat later. Re-staggering them here
        // was a second, jarring entrance wave on the SAME navigation (the
        // owner's "double load animation"). `initial={false}` mounts the
        // replies already-settled — the page/morph is the single entrance.
        <>
          <motion.div
            className="post-page__replies"
            variants={staggerContainer(0.03)}
            initial={false}
            animate="animate"
          >
            {comments
              .filter((c) => !c.hidden)
              .map((comment, i) => {
                const node = (
                  <CommentItem
                    comment={comment}
                    postId={postId}
                    postAuthorId={postAuthorId}
                    onHiddenChange={handleHiddenChange}
                    sessionUser={sessionUser}
                    onReplyAdded={handleReplyAdded}
                    onCommentRemoved={handleCommentRemoved}
                  />
                );
                return i < 8 ? (
                  <motion.div key={comment.id} variants={staggerItem}>
                    {node}
                  </motion.div>
                ) : (
                  <div key={comment.id}>{node}</div>
                );
              })}
          </motion.div>
          <HiddenRepliesGroup card count={comments.filter((c) => c.hidden).length}>
            {comments
              .filter((c) => c.hidden)
              .map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  postId={postId}
                  depth={1}
                  postAuthorId={postAuthorId}
                  onHiddenChange={handleHiddenChange}
                  sessionUser={sessionUser}
                  onReplyAdded={handleReplyAdded}
                  onCommentRemoved={handleCommentRemoved}
                />
              ))}
          </HiddenRepliesGroup>
        </>
      )}
    </>
  );
}
