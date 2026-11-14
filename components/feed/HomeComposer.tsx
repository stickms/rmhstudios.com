import {
  Suspense,
  lazy,
  startTransition,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { Link } from '@tanstack/react-router';
import { BarChart3, ImagePlay, ImagePlus, MoreHorizontal, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SpineItem } from '@/components/ui/spine';
import { useResolvedUser, useSession } from '@/components/Providers';
import { PostsPlusChips, usePostsPlusCompose } from '@/components/posts-plus/PostsPlusCompose';
import { MAX_RMHARK_LENGTH } from '@/lib/rmhark-limits';
import { clearComposeDraft, readComposeDraft } from '@/hooks/useComposeDraft';
import { HOME_COMPOSER_INPUT_ID } from './home-composer-id';
import { useComposeSubmit } from './compose/useComposeSubmit';
import {
  COMPOSER_FIELD_CLASS,
  ComposerRow,
  ComposerTool,
  useComposerFieldGrow,
  type ComposerFieldHandoff,
  type ComposerOpen,
} from './compose/ComposerRow';
import {
  buildComposeBody,
  buildOptimisticItem,
  computeCanSubmit,
  counterToneClass,
  emptyPoll,
  prependFailedContent,
  type SessionUserShape,
} from './compose/compose-state';

/**
 * Pictures, a GIF, a poll, the AI tools, audience, a schedule: the full composer. It stays off the home page's
 * critical path: the chunk is requested when the composer is first touched (hovered, focused or pressed), so it is
 * usually there by the time a quick action asks for it.
 */
const loadComposeBox = () => import('./ComposeBox');
const ComposeBox = lazy(() => loadComposeBox().then((m) => ({ default: m.ComposeBox })));

/**
 * The light row's field. It is its own component for its cleanup: when the full composer replaces the row, this
 * records where the caret was and whether the field had focus, while the element is still in the document, and the
 * full composer's field picks both up (`ComposeBox`, `fieldHandoff`).
 */
function LightField({
  value,
  onChange,
  onSubmit,
  handoff,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  handoff: RefObject<ComposerFieldHandoff | null>;
}) {
  const { t } = useTranslation('feed');
  const ref = useRef<HTMLTextAreaElement>(null);
  useComposerFieldGrow(ref, value);
  useLayoutEffect(() => {
    const el = ref.current;
    return () => {
      if (!el) return;
      handoff.current = {
        focused: document.activeElement === el,
        start: el.selectionStart,
        end: el.selectionEnd,
      };
    };
  }, [handoff]);
  return (
    <textarea
      ref={ref}
      id={HOME_COMPOSER_INPUT_ID}
      value={value}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit();
      }}
      placeholder={t('compose-placeholder', { defaultValue: "What's on your mind?" })}
      aria-label={t('compose-placeholder', { defaultValue: "What's on your mind?" })}
      autoComplete="off"
      className={COMPOSER_FIELD_CLASS}
    />
  );
}

/**
 * The home feed's composer (Steel section 10, Home): avatar, a borderless field that grows with its text, a row of
 * quick actions (picture, GIF, poll, AI, three dots) and the page's one primary button, Post. It is the first item on
 * the spine and has no dot (P3: a form hangs dotless).
 *
 * It keeps one look (owner, 2026-11-13: "I don't like how the three buttons menu changes the look of the compose
 * box"). What renders first is a light row: a plain field and buttons, sending through the same submit path as the
 * full composer (`useComposeSubmit`), so a line of text posts without fetching anything. A quick action needs the full
 * composer, which is `ComposeBox` in its `row` variant: the same parts (`compose/ComposerRow`) with the pickers and
 * menus behind them. The swap happens in a transition, so the light row stays on screen until the chunk is ready, and
 * the text, the caret and the focus are handed over; nothing moves, and the popover or editor that was asked for
 * opens. From then on the full composer stays, so there is no swap back.
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
  // Set once a quick action has asked for the full composer: what to open as it mounts, or the pictures to upload.
  const [expanded, setExpanded] = useState<{ open?: ComposerOpen; files?: File[] } | null>(null);
  const expand = (what: { open?: ComposerOpen; files?: File[] }) => {
    void loadComposeBox();
    startTransition(() => setExpanded(what));
  };
  // An unsent draft is offered back from the start, not the first time a quick action happens to mount the full
  // composer (owner, 2026-11-14: "i dont like how opening the three dots menu suddenly shows recent drafts, always
  // have the drafts be shown there"). The full composer owns the offer and the restore, so a waiting draft mounts it.
  const signedIn = !!session;
  useEffect(() => {
    if (!signedIn || !readComposeDraft()) return;
    void loadComposeBox();
    startTransition(() => setExpanded((current) => current ?? {}));
  }, [signedIn]);
  const fileRef = useRef<HTMLInputElement>(null);
  const handoff = useRef<ComposerFieldHandoff | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const remaining = MAX_RMHARK_LENGTH - content.length;
  const canSubmit = computeCanSubmit({
    hasContent: content.trim().length > 0,
    hasPoll: false,
    hasGif: false,
    hasImages: false,
    hasCodeEmbed: false,
    remaining,
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
      setContent((current) =>
        current.trim() ? prependFailedContent(draft.content, current) : draft.content,
      );
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
    <SpineItem
      dot={false}
      className="home-composer"
      data-slot="home-composer"
      onPointerEnter={() => void loadComposeBox()}
      onFocus={() => void loadComposeBox()}
    >
      <Suspense fallback={null}>
        {expanded ? (
          <ComposeBox
            variant="row"
            initialContent={content}
            fieldHandoff={handoff}
            {...(expanded.open ? { initialOpen: expanded.open } : {})}
            {...(expanded.files ? { initialFiles: expanded.files } : {})}
          />
        ) : (
          <ComposerRow
            image={image}
            name={name}
            field={
              <LightField
                value={content}
                onChange={(next) => {
                  setContent(next);
                  // Past one post's length the full composer takes over: it offers the text as a thread.
                  if (next.length > MAX_RMHARK_LENGTH) expand({});
                }}
                onSubmit={() => void handleSubmit()}
                handoff={handoff}
              />
            }
            tools={
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length) expand({ files });
                  }}
                />
                <ComposerTool
                  icon={ImagePlus}
                  label={t('menu-add-image', { defaultValue: 'Add Image' })}
                  onClick={() => fileRef.current?.click()}
                />
                <ComposerTool
                  icon={ImagePlay}
                  label={t('menu-add-gif', { defaultValue: 'Add GIF' })}
                  aria-haspopup="dialog"
                  aria-expanded={false}
                  onClick={() => expand({ open: 'gif' })}
                />
                <ComposerTool
                  icon={BarChart3}
                  label={t('menu-create-poll', { defaultValue: 'Create Poll' })}
                  onClick={() => expand({ open: 'poll' })}
                />
                <ComposerTool
                  icon={Sparkles}
                  label={t('compose-ai-tools', { defaultValue: 'AI tools' })}
                  aria-haspopup="menu"
                  aria-expanded={false}
                  onClick={() => expand({ open: 'ai' })}
                />
                <ComposerTool
                  icon={MoreHorizontal}
                  label={t('compose-post-options', { defaultValue: 'Post options' })}
                  aria-haspopup="menu"
                  aria-expanded={false}
                  onClick={() => expand({ open: 'menu' })}
                />
              </>
            }
            post={
              <>
                {remaining <= 20 && (
                  <span className={`t-meta me-3 ${counterToneClass(remaining)}`}>{remaining}</span>
                )}
                <Button
                  type="button"
                  variant="primary"
                  disabled={!canSubmit}
                  onClick={() => void handleSubmit()}
                >
                  {t('post-button', { defaultValue: 'Post' })}
                </Button>
              </>
            }
          >
            <PostsPlusChips pp={postsPlus} />
          </ComposerRow>
        )}
      </Suspense>
    </SpineItem>
  );
}
