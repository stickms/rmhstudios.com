import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useReconsider } from '@/components/safety/use-reconsider';
import type { FeedItem } from '@/lib/feed-types';
import type { Comment } from '../CommentItem';
import { withCommentDelta } from './post-detail-state';

export interface ReplyComposerState {
  commentContent: string;
  setCommentContent: Dispatch<SetStateAction<string>>;
  submitting: boolean;
  handleSubmit: () => Promise<void>;
}

/** The reply draft and its submit: posts the comment, prepends it and bumps the counts. */
export function useReplyComposer(
  postId: string,
  setComments: Dispatch<SetStateAction<Comment[]>>,
  setPost: Dispatch<SetStateAction<FeedItem | null>>,
  bumpFeedComment: (delta: number) => void,
): ReplyComposerState {
  const { t } = useTranslation('feed');
  const [commentContent, setCommentContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const reconsider = useReconsider();

  const handleSubmit = async () => {
    if (!commentContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await reconsider((confirmReconsider) =>
        fetch(`/api/rmharks/${postId}/comment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: commentContent.trim(), confirmReconsider }),
        }),
      );
      if (!res) return;
      if (res.ok) {
        const comment = (await res.json()) as Comment;
        setComments((prev) => [comment, ...prev]);
        setCommentContent('');
        setPost((prev) => withCommentDelta(prev, 1));
        bumpFeedComment(1);
      } else {
        // Surfaces the reply-control 403 ("The author limited who can reply…").
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(
          data.error || t('comment-failed', { defaultValue: 'Could not post your reply' }),
        );
      }
    } catch (error) {
      console.error('Comment error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return { commentContent, setCommentContent, submitting, handleSubmit };
}
