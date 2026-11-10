import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { useResolvedUser, useSession } from '@/components/Providers';
import { useFreshUser } from '@/stores/userDisplayStore';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { RelatedPosts } from './RelatedPosts';
import { PostArticle } from './post-detail/PostArticle';
import { ReplyComposer } from './post-detail/ReplyComposer';
import { ReplyList } from './post-detail/ReplyList';
import { withResolvedIdentity } from './post-detail/post-detail-state';
import { useFeedSync } from './post-detail/useFeedSync';
import { usePostData } from './post-detail/usePostData';
import { usePostTranslation } from './post-detail/usePostTranslation';
import { useReplyComposer } from './post-detail/useReplyComposer';
import { useReplyThread } from './post-detail/useReplyThread';

interface PostDetailProps {
  postId: string;
}

export function PostDetail({ postId }: PostDetailProps) {
  const { t } = useTranslation('feed');
  const navigate = useNavigate();
  const pathname = useLocation({ select: (l) => l.pathname });
  const { post, setPost, comments, setComments, loading, loadingComments, notFound } =
    usePostData(postId);
  const { data: session } = useSession();
  const { resolved: resolvedUser } = useResolvedUser();
  const { syncToFeed, bumpFeedComment } = useFeedSync(postId);
  const composer = useReplyComposer(postId, setComments, setPost, bumpFeedComment);
  const translation = usePostTranslation(postId);
  const thread = useReplyThread(setComments, setPost, bumpFeedComment);

  const isAuthor = session?.user?.id === post?.user?.id;
  const freshPostUser = useFreshUser(post?.user);
  const freshOriginalUser = useFreshUser(post?.original?.user);

  if (loading) {
    return (
      <div className="flex items-center justify-center px-4 pt-4 pb-12">
        <Spinner size={32} />
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="flex flex-col items-center justify-center px-4 pt-4 pb-12 text-center">
        <p className="text-lg font-medium text-site-text mb-2">
          {t('post-not-found', { defaultValue: 'Post not found' })}
        </p>
        <p className="text-sm text-site-text-muted mb-4">
          {t('post-not-found-detail', { defaultValue: "This post doesn't exist or was deleted." })}
        </p>
        <Link to="/">
          <Button variant="accent" size="sm">
            {t('go-home', { defaultValue: 'Go Home' })}
          </Button>
        </Link>
      </div>
    );
  }

  const sessionUserForReplies = session?.user
    ? withResolvedIdentity(session.user, resolvedUser)
    : undefined;

  const authorName = freshPostUser?.name || t('unknown-user', { defaultValue: 'Unknown' });

  // One column, one rhythm: the post, the reply surface, every reply thread and
  // the related posts are siblings of `.post-page` (feed.css), so they share the
  // same width, the same gutter and the same --space-4 gap. The page title is
  // the author's name, visually hidden: the card below already says who wrote it.
  return (
    <div className="post-page">
      <h1 className="sr-only">
        {t('post-by', { defaultValue: 'Post by {{name}}', name: authorName })}
      </h1>
      <div className="post-page__back">
        <button type="button" onClick={() => window.history.back()} className="page-heading__back">
          <ArrowLeft aria-hidden />
          <span>{t('back', { defaultValue: 'Back' })}</span>
        </button>
      </div>

      <PostArticle
        post={post}
        postId={postId}
        isAuthor={isAuthor}
        authorName={authorName}
        freshPostUser={freshPostUser}
        freshOriginalUser={freshOriginalUser}
        translation={translation}
        setPost={setPost}
        syncToFeed={syncToFeed}
        onRemove={() => navigate({ to: '/' })}
      />

      {/* Deleted notice: a quiet card in the column, not a ruled strip. */}
      {post.deletedAt && (
        <div className="glass-fill rounded-site px-5 py-4">
          <p className="text-center text-sm text-site-text-muted">
            {post.deletedByAdmin
              ? t('deleted-by-admin', { defaultValue: 'This RMHark was deleted by an admin.' })
              : t('deleted-by-user', { defaultValue: 'This RMHark was deleted by the user.' })}
          </p>
        </div>
      )}

      {!post.deletedAt && (
        <ReplyComposer
          post={post}
          postId={postId}
          sessionUser={session?.user ?? null}
          resolvedUser={resolvedUser}
          composer={composer}
          pathname={pathname}
        />
      )}

      {!post.deletedAt && (
        <ReplyList
          postId={postId}
          postAuthorId={post.user?.id}
          comments={comments}
          loadingComments={loadingComments}
          sessionUser={sessionUserForReplies}
          thread={thread}
        />
      )}

      {!post.deletedAt && <RelatedPosts postId={postId} />}
    </div>
  );
}
