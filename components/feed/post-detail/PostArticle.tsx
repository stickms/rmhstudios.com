import { useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ContextNotesLazy } from '@/components/context-notes/ContextNotesLazy';
import { RunnableEmbed } from '@/components/code-embed/RunnableEmbed';
import { PostPlusBadges } from '@/components/posts-plus/PostPlusBadges';
import type { FeedItem, FeedItemUser } from '@/lib/feed-types';
import { postMediaVTName, liquidVTName } from '@/lib/view-transition';
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
 * The post: a singular panel, so `.glass-pane` (L2). It is the liquid-open
 * hero the feed card morphs into (§5.48); the name is static because there
 * is one post per detail page. Author, body, media, timestamp and the
 * action row all live inside it.
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
    <article
      className="glass-pane post-page__post relative"
      style={{ viewTransitionName: liquidVTName('post', postId) }}
    >
      {/* More menu — top right (shared with the feed card so features match) */}
      {!post.deletedAt && (
        <div className="absolute top-3 right-3 z-20">
          <RMHarkOverflowMenu
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
        </div>
      )}

      {/* User header */}
      <div className="flex items-center gap-3 mb-4 pr-10">
        <UserAvatar user={freshPostUser} size="lg" />
        <div className="min-w-0">
          <Link
            to={`/u/${freshPostUser?.handle || freshPostUser?.id}` as string}
            className="hover:underline"
          >
            <span className="block truncate text-base font-bold text-site-text">{authorName}</span>
          </Link>
          {freshPostUser?.handle && (
            <p className="truncate text-sm text-site-text-muted">@{freshPostUser.handle}</p>
          )}
        </div>
      </div>

      {/* Content - larger text for detail view */}
      {post.content && (
        <RMHarkContent
          text={post.content}
          className="mb-4 text-lg leading-relaxed whitespace-pre-wrap break-words text-site-text sm:text-xl"
        />
      )}

      {/* Translation (toggled from the overflow menu) */}
      {showTranslated && translatedText && (
        <div className="mb-3 rounded-site glass-fill px-4 py-3 text-body leading-relaxed text-site-text whitespace-pre-wrap break-words">
          {translatedText}
        </div>
      )}

      {/* Poll */}
      {post.poll && (
        <div className="mb-3">
          <PollDisplay
            poll={post.poll}
            postId={postId}
            onUpdate={(updatedPoll) =>
              setPost((prev) => (prev ? { ...prev, poll: updatedPoll } : prev))
            }
          />
        </div>
      )}

      {/* Take meter (X6) — only on posts the author marked as a take */}
      {post.isTake && !post.locked && (
        <div className="mb-3">
          <TakeMeterLazy postId={postId} />
        </div>
      )}

      {post.hasEmbed && !post.locked && <RunnableEmbed postId={postId} />}

      {/* Context notes (X3) — a button until opened; open straight away when a note is visible */}
      {!post.locked && (
        <div className="mb-3">
          <ContextNotesLazy postId={postId} hasNote={post.hasNote} />
        </div>
      )}

      {/* Series part (X5) and auto-delete (X8) badges */}
      {!post.locked && (
        <PostPlusBadges
          postId={postId}
          seriesId={post.seriesId}
          expiresAt={post.expiresAt}
          className="mb-3"
        />
      )}

      {/* Image / GIF — hidden behind a content warning when marked sensitive.
 The gutter is `mb-5`, not the `mb-3` the text blocks above use: a photo's
 edge is a hard rectangle, so the gap that reads as a paragraph break under
 text reads as the timestamp sitting ON the image. */}
      {(post.gifUrl || (post.imageUrls && post.imageUrls.length > 0)) && (
        <SensitiveMedia sensitive={post.isSensitive} className="mb-4">
          {post.gifUrl && <GifEmbed url={post.gifUrl} className="mb-1" />}
          {post.imageUrls && post.imageUrls.length > 0 && (
            <PostImageGrid
              urls={post.imageUrls}
              alts={post.imageAlts}
              heroName={postMediaVTName(postId)}
              // This is the single-post page, so the post's first image is the
              // largest element on it and therefore the LCP candidate. No
              // `<link rel=preload>` to pair with: the post body is fetched on
              // the client, so the URL does not exist at head() time.
              priority
            />
          )}
        </SensitiveMedia>
      )}

      {/* Link preview — only when no poll, gif, or image */}
      {linkPreviewUrl && <LinkPreview url={linkPreviewUrl} className="mb-3" />}

      {/* Quoted original */}
      {post.original && (
        <div className="glass-fill mb-3 rounded-site px-4 py-3">
          <div className="flex items-center gap-2 text-sm mb-1">
            {freshOriginalUser ? (
              <Link
                to={`/u/${freshOriginalUser.handle || freshOriginalUser.id}` as string}
                className="flex items-center gap-2 min-w-0 hover:underline"
              >
                <span className="font-bold text-site-text truncate">
                  {freshOriginalUser.name || t('unknown-user', { defaultValue: 'Unknown' })}
                </span>
                {freshOriginalUser.handle && (
                  <span className="text-site-text-muted truncate">@{freshOriginalUser.handle}</span>
                )}
              </Link>
            ) : (
              <span className="font-bold text-site-text truncate">
                {t('unknown-user', { defaultValue: 'Unknown' })}
              </span>
            )}
          </div>
          <RMHarkContent
            text={post.original.content ?? ''}
            className="text-site-text text-sm whitespace-pre-wrap break-words"
          />
        </div>
      )}

      {/* Full timestamp */}
      <p className="mb-1 text-sm text-site-text-muted">
        {formatFullDate(post.createdAt)}
        {post.edited && !post.deletedAt ? (
          <EditHistoryButton postId={postId} className="text-sm" />
        ) : null}
      </p>

      {/* The passive "N reRMHarks · N Likes · N Views" bar that used to sit here
            is gone. `RMHarkActions` directly below already renders every one of
            those counts against the same icons the rest of the site uses, so the
            page showed each figure twice: once as text that looked clickable and
            did nothing, and once on the control that performs the action. The
            toolbar stays because it is the one you can press. It closes the card
            with space, not a rule. */}
      {!post.deletedAt && (
        <RMHarkActions
          item={post}
          className="mt-2 -mb-2"
          onUpdate={(_, updates) => {
            setPost((prev) => (prev ? { ...prev, ...updates } : prev));
            syncToFeed(updates);
          }}
        />
      )}
    </article>
  );
}
