import { useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { SpineItem } from '@/components/ui/spine';
import { useResolvedUser, useSession } from '@/components/Providers';
import { usePostsPlusCompose } from '@/components/posts-plus/PostsPlusCompose';
import { MAX_RMHARK_LENGTH } from '@/lib/rmhark-limits';
import { clearComposeDraft } from '@/hooks/useComposeDraft';
import { HOME_COMPOSER_INPUT_ID } from './home-composer-id';
import { useComposeSubmit } from './compose/useComposeSubmit';
import {
  buildComposeBody,
  buildOptimisticItem,
  computeCanSubmit,
  emptyPoll,
  prependFailedContent,
  type SessionUserShape,
} from './compose/compose-state';

/**
 * The home feed's one-line composer (Steel section 10, Home): avatar, a borderless field and the page's one primary
 * button, Post. It is the first item on the spine and has no dot (P3: a form hangs dotless).
 *
 * It sends through the same submit path as the full composer (`useComposeSubmit`): the post appears at the top of the
 * feed at once in its dimmed "posting" state, and is reconciled or rolled back and restored into the field when the
 * server answers. Anything richer than a line of text (pictures, a poll, a GIF, a schedule) is the full composer behind
 * "Write a post". Phones do not show the row at all (the globe's "Write a post" is the way in), so the row is hidden
 * below 1024px, the width at which the sidebar appears.
 *
 * Signed out, the row is a one-line sign-in prompt in the same place and the same height (plan section 18, D6), and the
 * sign-in button is that view's one primary (R4). While the session is still unknown the row holds its height empty, so
 * nothing shifts when it resolves.
 */
export function HomeComposer() {
  const { t } = useTranslation('feed');
  const { data: session, isPending } = useSession();
  const { resolved } = useResolvedUser();
  const postsPlus = usePostsPlusCompose();
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = content.trim();
  const canSubmit = computeCanSubmit({
    hasContent: trimmed.length > 0,
    hasPoll: false,
    hasGif: false,
    hasImages: false,
    hasCodeEmbed: false,
    remaining: MAX_RMHARK_LENGTH - content.length,
    submitting,
    uploadingCount: 0,
    missingAltCount: 0,
  });

  const resetForm = () => {
    clearComposeDraft();
    setContent('');
    postsPlus.reset();
  };

  const { handleSubmit } = useComposeSubmit({
    canSubmit,
    buildBody: () =>
      buildComposeBody({
        content,
        hasPoll: false,
        poll: emptyPoll(),
        pollDuration: 0,
        hasGif: false,
        gifUrl: '',
        hasImages: false,
        imageUrls: [],
        imageAlts: [],
        audience: 'PUBLIC',
        isSensitive: false,
        isTake: false,
        replyControl: 'EVERYONE',
        unlockPrice: '',
        featureFields: [postsPlus.bodyFields],
      }),
    buildOptimisticItem: (id) =>
      buildOptimisticItem({
        id,
        content,
        sessionUser: session!.user as SessionUserShape,
        resolvedUser: resolved ?? null,
        hasImages: false,
        imageUrls: [],
        imageAlts: [],
        isSensitive: false,
        isTake: false,
        replyControl: 'EVERYONE',
        hasGif: false,
        gifUrl: '',
        hasPoll: false,
        poll: emptyPoll(),
        unlockPrice: '',
      }),
    snapshotDraft: () => ({ content, answering: postsPlus.answering }),
    // A failed post goes back into the field, ahead of anything typed since.
    restoreFailedDraft: (draft) => {
      setContent((current) => (current.trim() ? prependFailedContent(draft.content, current) : draft.content));
      postsPlus.restore({ ttl: null, series: null, answering: draft.answering });
    },
    resetForm,
    setSubmitting,
    setSavedMsg: () => {},
  });

  if (!session) {
    return (
      <SpineItem dot={false} className="home-composer" data-slot="home-composer">
        {isPending ? (
          <div className="home-composer__row" aria-hidden />
        ) : (
          <div className="home-composer__row">
            <p className="t-body min-w-0 flex-1 text-site-text-muted">
              {t('sign-in-prompt', { defaultValue: 'Sign in to post RMHarks' })}
            </p>
            <Button asChild variant="primary">
              <Link to="/login" search={{ callbackURL: undefined }}>
                {t('sign-in', { defaultValue: 'Sign in' })}
              </Link>
            </Button>
          </div>
        )}
      </SpineItem>
    );
  }

  const name = resolved?.name || session.user.name || null;
  const image = resolved?.image || session.user.image || null;

  return (
    <SpineItem dot={false} className="home-composer hidden lg:block" data-slot="home-composer">
      <form
        className="home-composer__row"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
      >
        <UserAvatar src={image} alt="" size={28} fallbackName={name ?? undefined} />
        <Input
          ref={inputRef}
          id={HOME_COMPOSER_INPUT_ID}
          value={content}
          maxLength={MAX_RMHARK_LENGTH}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t('compose-placeholder', { defaultValue: "What's on your mind?" })}
          aria-label={t('compose-placeholder', { defaultValue: "What's on your mind?" })}
          autoComplete="off"
          className="h-9 min-w-0 flex-1 border-0 bg-transparent px-0"
        />
        <Button type="submit" variant="primary" disabled={!canSubmit}>
          {t('post-button', { defaultValue: 'Post' })}
        </Button>
      </form>
      {postsPlus.answering && (
        <p className="t-meta mt-2 flex items-center gap-3">
          <span className="min-w-0 flex-1 truncate">
            {t('chip-answering', {
              ns: 'f-posts-plus',
              defaultValue: 'Answering: {{question}}',
              question: postsPlus.answering.text,
            })}
          </span>
          <button type="button" className="feed-action" onClick={postsPlus.clearAnswering}>
            {t('chip-answering-remove', {
              ns: 'f-posts-plus',
              defaultValue: 'Stop answering the question',
            })}
          </button>
        </p>
      )}
    </SpineItem>
  );
}
