import { useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ContextNotesLazy } from '@/components/context-notes/ContextNotesLazy';
import { RunnableEmbed } from '@/components/code-embed/RunnableEmbed';
import { PostPlusBadges } from '@/components/posts-plus/PostPlusBadges';
import type { FeedItem, FeedItemUser } from '@/lib/feed-types';
import { postMediaVTName } from '@/lib/view-transition';
import { RMHarkOverflowMenu } from '../RMHarkOverflowMenu';
import { RMHarkActions } from '../RMHarkActions';
import { RMHarkContent } from '../RMHarkContent';
import { PollDisplay } from '../PollDisplay';
import { TakeMeterLazy } from '../TakeMeterLazy';
import { GifEmbed } from '../GifEmbed';
import { PostImageGrid } from '../PostImageGrid';
import { SensitiveMedia } from '../SensitiveMedia';
import { LinkPreview } from '../LinkPreview';
import { UserAvatar } from '../UserAvatar';
import { EditHistoryButton } from '../EditHistory';
import { SpineItem } from '@/components/ui/spine';
import { REPLY_INPUT_ID } from './reply-input-id';
import { formatFullDate, postLinkPreviewUrl } from './post-detail-state';
import type { PostTranslation } from './usePostTranslation';

interface PostArticleProps {
  post: FeedItem;
  postId: string;
  isAuthor: boolean;
  authorName: string;
  freshPostUser: FeedItemUser | undefined;
  freshOriginalUser: FeedItemUser | undefined;
  translation: PostTranslation;
  setPost: Dispatch<SetStateAction<FeedItem | null>>;
  syncToFeed: (updates: Partial<FeedItem>) => void;
  onRemove: () => void;
}

/**
 * The post, the first item on the thread's spine (Steel section 10, Post and replies): author, the text at 19px, its
 * picture, the full time and the K8 action words. No box and no morph (S1, M8): the replies that follow hang on the same
 * spine.
 */
export function PostArticle({
  post,
  postId,
  isAuthor,
  authorName,
  freshPostUser,
  freshOriginalUser,
  translation,
  setPost,
  syncToFeed,
  onRemove,
}: PostArticleProps) {
  const { t } = useTranslation('feed');
  const linkPreviewUrl = useMemo(() => postLinkPreviewUrl(post), [post]);
  const { translatedText, showTranslated, translating, handleTranslate } = translation;

  return (
    <SpineItem as="article">
      {/* Author, with the menu word at the inline end (shared with the feed row so features match) */}
      <div className="flex items-center gap-3">
        <UserAvatar user={freshPostUser} size="lg" />
        <div className="min-w-0 flex-1">
          <Link
            to={`/u/${freshPostUser?.handle || freshPostUser?.id}` as string}
            className="hover:underline"
          >
            <span className="t-body block truncate font-semibold text-site-text">{authorName}</span>
          </Link>
          {freshPostUser?.handle && <p className="t-meta truncate">@{freshPostUser.handle}</p>}
        </div>
        {!post.deletedAt && (
          <RMHarkOverflowMenu
            className="shrink-0"
            item={post}
            isAuthor={isAuthor}
            onUpdate={(updates) => {
              setPost((prev) => (prev ? { ...prev, ...updates } : prev));
              syncToFeed(updates);
            }}
            onRemove={onRemove}
            translate={{
              translating,
              hasTranslation: translatedText !== null,
              showing: showTranslated,
              onToggle: handleTranslate,
            }}
          />
        )}
      </div>

      {/* The text, at 19px */}
      {post.content && (
        <RMHarkContent
          text={post.content}
          className="post-page__text mt-3 break-words whitespace-pre-wrap text-site-text"
        />
      )}

      {/* Translation (toggled from the menu): set off by a rule, not a box */}
      {showTranslated && translatedText && (
        <p className="t-body mt-3 border-s-2 border-site-border ps-3 break-words whitespace-pre-wrap">
          {translatedText}
        </p>
      )}

      {/* Poll */}
      {post.poll && (
        <div className="mt-3">
          <PollDisplay
            poll={post.poll}
            postId={postId}
            onUpdate={(updatedPoll) =>
              setPost((prev) => (prev ? { ...prev, poll: updatedPoll } : prev))
            }
          />
        </div>
      )}

      {/* Take meter (X6): only on posts the author marked as a take */}
      {post.isTake && !post.locked && (
        <div className="mt-3">
          <TakeMeterLazy postId={postId} />
        </div>
      )}

      {post.hasEmbed && !post.locked && <RunnableEmbed postId={postId} />}

      {/* Context notes (X3): a button until opened; open straight away when a note is visible */}
      {!post.locked && (
        <div className="mt-3">
          <ContextNotesLazy postId={postId} hasNote={post.hasNote} />
        </div>
      )}

      {/* Series part (X5) and auto-delete (X8) badges */}
      {!post.locked && (
        <PostPlusBadges
          postId={postId}
          seriesId={post.seriesId}
          expiresAt={post.expiresAt}
          className="mt-3"
        />
      )}

      {/* Image / GIF: hidden behind a content warning when marked sensitive. */}
      {(post.gifUrl || (post.imageUrls && post.imageUrls.length > 0)) && (
        <SensitiveMedia sensitive={post.isSensitive} className="mt-3">
          {post.gifUrl && <GifEmbed url={post.gifUrl} className="mb-1" />}
          {post.imageUrls && post.imageUrls.length > 0 && (
            <PostImageGrid
              urls={post.imageUrls}
              alts={post.imageAlts}
              heroName={postMediaVTName(postId)}
              // This is the single-post page, so the post's first image is the largest element on it and therefore the
              // LCP candidate. No `<link rel=preload>` to pair with: the post body is fetched on the client, so the
              // URL does not exist at head() time.
              priority
            />
          )}
        </SensitiveMedia>
      )}

      {/* Link preview: only when no poll, gif, or image */}
      {linkPreviewUrl && <LinkPreview url={linkPreviewUrl} className="mt-3" />}

      {/* Quoted original: set off by a rule, not a box */}
      {post.original && (
        <div className="mt-3 border-s-2 border-site-border ps-3">
          <div className="t-body mb-1 flex items-center gap-2">
            {freshOriginalUser ? (
              <Link
                to={`/u/${freshOriginalUser.handle || freshOriginalUser.id}` as string}
                className="flex min-w-0 items-center gap-2 hover:underline"
              >
                <span className="truncate font-semibold text-site-text">
                  {freshOriginalUser.name || t('unknown-user', { defaultValue: 'Unknown' })}
                </span>
                {freshOriginalUser.handle && (
                  <span className="t-meta truncate">@{freshOriginalUser.handle}</span>
                )}
              </Link>
            ) : (
              <span className="truncate font-semibold text-site-text">
                {t('unknown-user', { defaultValue: 'Unknown' })}
              </span>
            )}
          </div>
          <RMHarkContent
            text={post.original.content ?? ''}
            className="t-body break-words whitespace-pre-wrap text-site-text"
          />
        </div>
      )}

      {/* The full time */}
      <p className="t-meta mt-3">
        {formatFullDate(post.createdAt)}
        {post.edited && !post.deletedAt ? <EditHistoryButton postId={postId} /> : null}
      </p>

      {/* The action words. "Reply" takes you to the field below instead of reloading this page. */}
      {!post.deletedAt && (
        <RMHarkActions
          item={post}
          onReply={() => document.getElementById(REPLY_INPUT_ID)?.focus()}
          onUpdate={(_, updates) => {
            setPost((prev) => (prev ? { ...prev, ...updates } : prev));
            syncToFeed(updates);
          }}
        />
      )}
    </SpineItem>
  );
}
