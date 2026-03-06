'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { ArrowLeft, Loader2, MoreHorizontal, Heart, Repeat, Trash2, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { useResolvedUser } from '@/components/Providers';
import { RMHarkActions } from './RMHarkActions';
import { CommentItem } from './CommentItem';
import type { Comment } from './CommentItem';
import { MAX_COMMENT_LENGTH } from '@/lib/rmhark-schema';
import { Link, useNavigate } from '@tanstack/react-router';
import type { FeedItem } from '@/lib/feed-types';
import { RMHarkContent, extractFirstUrl } from './RMHarkContent';
import { PollDisplay } from './PollDisplay';
import { GifEmbed } from './GifEmbed';
import { LinkPreview } from './LinkPreview';
import { EngagementListModal } from './EngagementListModal';
import { ShareModal } from './ShareModal';

interface PostDetailProps {
  postId: string;
}

export function PostDetail({ postId }: PostDetailProps) {
  const navigate = useNavigate();
  const [post, setPost] = useState<FeedItem | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingComments, setLoadingComments] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [commentContent, setCommentContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { data: session } = authClient.useSession();
  const { resolved: resolvedUser } = useResolvedUser();
  const remaining = MAX_COMMENT_LENGTH - commentContent.length;
  const [menuOpen, setMenuOpen] = useState(false);
  const [engagementModal, setEngagementModal] = useState<'likes' | 'reposts' | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const linkPreviewUrl = useMemo(() => {
    if (!post || post.poll || post.gifUrl || !post.content) return null;
    return extractFirstUrl(post.content);
  }, [post]);

  const isAuthor = session?.user?.id === post?.user?.id;

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const handleShare = () => {
    setMenuOpen(false);
    const shareUrl = `${window.location.origin}/@${post?.user?.handle || post?.user?.id}/post/${postId}`;
    const userName = post?.user?.name || post?.user?.handle || 'someone';
    const shareText = `Check out what ${userName} RMHark'd on RMH Studios!`;
    if (navigator.share) {
      navigator.share({ title: 'RMH', text: shareText, url: shareUrl }).catch(() => {});
    } else {
      setShareModalOpen(true);
    }
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    if (!confirm('Delete this RMHark?')) return;
    try {
      await fetch(`/api/rmharks/${postId}`, { method: 'DELETE' });
      navigate({ to: '/' });
    } catch {
      // ignore
    }
  };

  // Fetch post
  useEffect(() => {
    setLoading(true);
    fetch(`/api/rmharks/${postId}`)
      .then(async (res) => {
        if (res.status === 404) { setNotFound(true); return; }
        const data = await res.json();
        setPost(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [postId]);

  // Fetch comments
  useEffect(() => {
    setLoadingComments(true);
    fetch(`/api/rmharks/${postId}/comment`)
      .then((res) => res.json())
      .then((data) => setComments(data))
      .catch(console.error)
      .finally(() => setLoadingComments(false));
  }, [postId]);

  const handleSubmit = async () => {
    if (!commentContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/rmharks/${postId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentContent.trim() }),
      });
      if (res.ok) {
        const comment = await res.json();
        setComments((prev) => [comment, ...prev]);
        setCommentContent('');
        setPost((prev) => prev ? { ...prev, commentCount: (prev.commentCount ?? 0) + 1 } : prev);
      }
    } catch (error) {
      console.error('Comment error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReplyAdded = useCallback((parentId: string, reply: Comment) => {
    const addReplyDeep = (comments: Comment[]): Comment[] =>
      comments.map((c) => {
        if (c.id === parentId) {
          return { ...c, replies: [...(c.replies ?? []), reply] };
        }
        if (c.replies?.length) {
          return { ...c, replies: addReplyDeep(c.replies) };
        }
        return c;
      });
    setComments((prev) => addReplyDeep(prev));
    setPost((prev) => prev ? { ...prev, commentCount: (prev.commentCount ?? 0) + 1 } : prev);
  }, []);

  const handleCommentRemoved = useCallback((commentId: string) => {
    const removeDeep = (comments: Comment[]): Comment[] =>
      comments
        .filter((c) => c.id !== commentId)
        .map((c) => c.replies?.length ? { ...c, replies: removeDeep(c.replies) } : c);
    setComments((prev) => removeDeep(prev));
    setPost((prev) => prev ? { ...prev, commentCount: Math.max(0, (prev.commentCount ?? 0) - 1) } : prev);
  }, []);

  const formatFullDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-site-accent animate-spin" />
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <p className="text-lg font-medium text-site-text mb-1">Post not found</p>
        <p className="text-sm text-site-text-muted mb-4">This post doesn&apos;t exist or was deleted.</p>
        <Link to="/"><Button variant="accent" size="sm">Go Home</Button></Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Header bar */}
      <div className="sticky top-0 z-10 bg-site-bg/85 backdrop-blur-md border-b border-site-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => window.history.back()}
            className="p-1.5 -ml-1.5 rounded-lg hover:bg-site-surface transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-site-text" />
          </button>
          <h1 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text">
            Post
          </h1>
        </div>
      </div>

      {/* Post content (expanded) */}
      <div className="relative px-4 pt-4 pb-3 border-b border-site-border">
        {/* More menu — top right */}
        <div className="absolute top-4 right-4 z-10" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface transition-colors"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-site-bg border border-site-border rounded-xl shadow-xl py-1 z-30">
              <button
                onClick={() => { setMenuOpen(false); setEngagementModal('likes'); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
              >
                <Heart className="w-4 h-4 text-site-text-dim" />
                Liked by
              </button>
              <button
                onClick={() => { setMenuOpen(false); setEngagementModal('reposts'); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
              >
                <Repeat className="w-4 h-4 text-site-text-dim" />
                reRMHark'd by
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
              >
                <Share2 className="w-5 h-5 text-site-text-dim" />
                Share
              </button>
              {isAuthor && (
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-danger hover:bg-site-danger/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>

        {/* User header */}
        <div className="flex items-center gap-3 mb-3 pr-8">
          <Link to={`/@${post.user?.handle || post.user?.id}`}>
            <div className="w-12 h-12 rounded-full bg-linear-to-tr from-site-accent to-site-accent-hover flex items-center justify-center text-white font-bold text-sm shrink-0">
              {post.user?.image ? (
                <img src={post.user.image} alt={post.user.name || 'User'} className="w-full h-full rounded-full object-cover" />
              ) : (
                (post.user?.name?.[0] || 'U').toUpperCase()
              )}
            </div>
          </Link>
          <div>
            <Link to={`/@${post.user?.handle || post.user?.id}`} className="hover:underline">
              <span className="font-bold text-site-text">{post.user?.name || 'Unknown'}</span>
            </Link>
            {post.user?.handle && (
              <p className="text-sm text-site-text-dim">@{post.user.handle}</p>
            )}
          </div>
        </div>

        {/* Content - larger text for detail view */}
        {post.content && (
          <RMHarkContent text={post.content} className="text-site-text text-[17px] leading-relaxed whitespace-pre-wrap break-words mb-3" />
        )}

        {/* Poll */}
        {post.poll && (
          <div className="mb-3">
            <PollDisplay
              poll={post.poll}
              postId={postId}
              onUpdate={(updatedPoll) => setPost((prev) => prev ? { ...prev, poll: updatedPoll } : prev)}
            />
          </div>
        )}

        {/* Image / GIF */}
        {post.gifUrl && <GifEmbed url={post.gifUrl} className="mb-3" />}

        {/* Link preview — only when no poll, gif, or image */}
        {linkPreviewUrl && <LinkPreview url={linkPreviewUrl} className="mb-3" />}

        {/* Quoted original */}
        {post.original && (
          <div className="mb-3 border border-site-border rounded-xl p-3 bg-site-surface/30">
            <div className="flex items-center gap-1.5 text-sm mb-1">
              {post.original.user ? (
                <Link to={`/@${post.original.user.handle || post.original.user.id}`} className="flex items-center gap-1.5 min-w-0 hover:underline">
                  <span className="font-bold text-site-text truncate">{post.original.user.name || 'Unknown'}</span>
                  {post.original.user.handle && (
                    <span className="text-site-text-dim truncate">@{post.original.user.handle}</span>
                  )}
                </Link>
              ) : (
                <span className="font-bold text-site-text truncate">Unknown</span>
              )}
            </div>
            <RMHarkContent text={post.original.content ?? ''} className="text-site-text text-sm whitespace-pre-wrap break-words" />
          </div>
        )}

        {/* Full timestamp */}
        <p className="text-sm text-site-text-dim mb-3">{formatFullDate(post.createdAt)}</p>

        {/* Engagement stats bar */}
        <div className="flex items-center gap-4 py-3 border-t border-site-border text-sm">
          <span>
            <span className="font-bold text-site-text">{post.repostCount ?? 0}</span>{' '}
            <span className="text-site-text-dim">reRMHarks</span>
          </span>
          <span>
            <span className="font-bold text-site-text">{post.likeCount ?? 0}</span>{' '}
            <span className="text-site-text-dim">Likes</span>
          </span>
          <span>
            <span className="font-bold text-site-text">{post.viewCount ?? 0}</span>{' '}
            <span className="text-site-text-dim">Views</span>
          </span>
        </div>

        {/* Actions */}
        <div className="border-t border-site-border pt-1">
          <RMHarkActions
            item={post}
            onUpdate={(_, updates) => setPost((prev) => prev ? { ...prev, ...updates } : prev)}
          />
        </div>
      </div>

      {/* Comment compose */}
      {session ? (
        <div className="px-4 py-3 border-b border-site-border">
          <div className="flex gap-3">
            {/* User avatar */}
            <div className="w-9 h-9 rounded-full bg-linear-to-tr from-site-accent to-site-accent-hover flex items-center justify-center text-white font-bold text-xs shrink-0">
              {(resolvedUser?.image || session.user?.image) ? (
                <img src={resolvedUser?.image || session.user!.image!} alt={resolvedUser?.name || session.user?.name || 'You'} className="w-full h-full rounded-full object-cover" />
              ) : (
                ((resolvedUser?.name || session.user?.name)?.[0] || 'U').toUpperCase()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <textarea
                id="post-comment-input"
                value={commentContent}
                onChange={(e) => setCommentContent(e.target.value)}
                placeholder="Post your reply..."
                rows={2}
                maxLength={MAX_COMMENT_LENGTH}
                className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-xl p-3 border border-site-border resize-none outline-none focus:border-site-accent transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleSubmit();
                  }
                }}
              />
              <div className="flex items-center justify-between mt-2">
                <span className={`text-xs font-mono ${remaining <= 20 ? 'text-site-warning' : 'text-site-text-dim'}`}>
                  {remaining}
                </span>
                <Button
                  variant="accent"
                  size="sm"
                  disabled={!commentContent.trim() || remaining < 0 || submitting}
                  onClick={handleSubmit}
                >
                  {submitting ? 'Posting...' : 'Reply'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 border-b border-site-border text-center text-sm text-site-text-dim">
          Sign in to reply
        </div>
      )}

      {/* Comments list */}
      <div className="px-4">
        {loadingComments ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 text-site-accent animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <p className="text-center text-sm text-site-text-dim py-8">
            No replies yet. Be the first!
          </p>
        ) : (
          <div className="divide-y divide-site-border">
            {comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                postId={postId}
                sessionUser={session?.user ? { ...session.user, image: resolvedUser?.image || session.user.image, name: resolvedUser?.name || session.user.name } : undefined}
                onReplyAdded={handleReplyAdded}
                onCommentRemoved={handleCommentRemoved}
              />
            ))}
          </div>
        )}
      </div>

      {engagementModal && (
        <EngagementListModal
          open={engagementModal !== null}
          onClose={() => setEngagementModal(null)}
          postId={postId}
          type={engagementModal}
        />
      )}

      <ShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        url={typeof window !== 'undefined' ? `${window.location.origin}/@${post?.user?.handle || post?.user?.id}/post/${postId}` : ''}
        text={`Check out what ${post?.user?.name || post?.user?.handle || 'someone'} RMHark'd on RMH Studios!`}
      />
    </div>
  );
}
