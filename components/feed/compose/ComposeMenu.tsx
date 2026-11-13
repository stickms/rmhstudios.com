import type { Dispatch, RefObject, SetStateAction } from 'react';
import {
  Plus,
  MoreHorizontal,
  BarChart3,
  ImagePlay,
  ImagePlus,
  Coins,
  Type,
  FileText,
  CalendarClock,
  Check,
  AlertTriangle,
  Smile,
} from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import {
  CodeEmbedMenuItem,
  type useCodeEmbedCompose,
} from '@/components/code-embed/CodeEmbedCompose';
import {
  PostsPlusMenuItems,
  type usePostsPlusCompose,
} from '@/components/posts-plus/PostsPlusCompose';
import { TakeMenuItem } from '../TakeCompose';
import { MAX_IMAGES, type AudienceValue, type ReplyControlValue } from './compose-state';
import { ComposerTool } from './ComposerRow';
import { useAudienceOptions, useReplyOptions } from './compose-options';

const ITEM =
  'flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface-hover transition-colors';

/**
 * The (+) button and its menu: visibility, replies, content warning, take,
 * code embed, posts-plus, image, GIF, poll, unlock price, formatting help,
 * draft and schedule.
 *
 * In the home composer (`variant="row"`) the trigger is the three dots at the end of the quick actions and the menu is
 * a dropdown under them. A picture, a GIF and a poll have their own buttons in that row, so their rows are left out
 * here, and the emoji picker, which has no button there, gets one.
 *
 * The panel is an AnchoredMenu: it portals to <body> (in place it is trapped
 * inside the page frame's stacking context, so the top bar and the floating
 * chrome paint over it) and it opens on whichever side of the composer has
 * room, rather than being shoved back down the screen by a viewport clamp.
 */
export function ComposeMenu({
  variant,
  anchorRef,
  menuOpen,
  setMenuOpen,
  closeMenu,
  imageInputRef,
  audience,
  replyControl,
  setAudienceOpen,
  setReplyOpen,
  isSensitive,
  setIsSensitive,
  isTake,
  setIsTake,
  codeEmbed,
  postsPlus,
  imageCount,
  onAddGif,
  onAddPoll,
  onAddEmoji,
  setShowPriceModal,
  setShowCheatSheet,
  canSubmit,
  onSaveDraft,
  setShowSchedule,
}: {
  variant: 'box' | 'row';
  /** The trigger, owned by the composer: the GIF and emoji popovers it opens from this menu hang off the same button. */
  anchorRef: RefObject<HTMLButtonElement | null>;
  menuOpen: boolean;
  setMenuOpen: Dispatch<SetStateAction<boolean>>;
  closeMenu: () => void;
  imageInputRef: RefObject<HTMLInputElement | null>;
  audience: AudienceValue;
  replyControl: ReplyControlValue;
  setAudienceOpen: (open: boolean) => void;
  setReplyOpen: (open: boolean) => void;
  isSensitive: boolean;
  setIsSensitive: Dispatch<SetStateAction<boolean>>;
  isTake: boolean;
  setIsTake: Dispatch<SetStateAction<boolean>>;
  codeEmbed: ReturnType<typeof useCodeEmbedCompose>;
  postsPlus: ReturnType<typeof usePostsPlusCompose>;
  imageCount: number;
  onAddGif: () => void;
  onAddPoll: () => void;
  onAddEmoji: () => void;
  setShowPriceModal: (open: boolean) => void;
  setShowCheatSheet: (open: boolean) => void;
  canSubmit: boolean;
  onSaveDraft: () => void;
  setShowSchedule: (show: boolean) => void;
}) {
  const { t } = useTranslation('feed');
  const audienceOptions = useAudienceOptions();
  const replyOptions = useReplyOptions();
  const currentAudience = audienceOptions.find((o) => o.value === audience) ?? audienceOptions[0];
  const CurrentAudienceIcon = currentAudience.icon;
  const currentReply = replyOptions.find((o) => o.value === replyControl) ?? replyOptions[0];
  const CurrentReplyIcon = currentReply.icon;

  return (
    <>
      {variant === 'row' ? (
        <ComposerTool
          ref={anchorRef}
          icon={MoreHorizontal}
          label={t('compose-post-options', { defaultValue: 'Post options' })}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        />
      ) : (
        <button
          ref={anchorRef}
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={t('add-to-post-aria', { defaultValue: 'Add to post' })}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="p-1.5 rounded-full text-site-text-muted hover:text-site-accent hover:bg-site-accent/10 transition-colors"
        >
          <Plus className="w-4.5 h-4.5" />
        </button>
      )}

      <AnchoredMenu
        open={menuOpen}
        onClose={closeMenu}
        anchorRef={anchorRef}
        label={
          variant === 'row'
            ? t('compose-post-options', { defaultValue: 'Post options' })
            : t('add-to-post-aria', { defaultValue: 'Add to post' })
        }
        side={variant === 'row' ? 'bottom' : 'top'}
        align={variant === 'row' ? 'start' : 'end'}
        className="w-56"
      >
        {/* Post visibility (audience) — opens a picker modal */}
        <button
          type="button"
          onClick={() => {
            setAudienceOpen(true);
            setMenuOpen(false);
          }}
          className={ITEM}
        >
          <CurrentAudienceIcon className="w-4 h-4 text-site-text-muted" />
          <span className="flex-1 text-left">
            {t('menu-audience', { defaultValue: 'Visibility' })}
          </span>
          <span className="text-xs text-site-text-muted">{currentAudience.label}</span>
        </button>
        {/* Who can reply — opens a picker modal */}
        <button
          type="button"
          onClick={() => {
            setReplyOpen(true);
            setMenuOpen(false);
          }}
          className={ITEM}
        >
          <CurrentReplyIcon className="w-4 h-4 text-site-text-muted" />
          <span className="flex-1 text-left">
            {t('menu-reply-control', { defaultValue: 'Replies' })}
          </span>
          <span className="text-xs text-site-text-muted">{currentReply.short}</span>
        </button>
        {/* Content-warning toggle — flips in place so the check is
 visible; the active pill above mirrors the state. */}
        <button
          type="button"
          onClick={() => setIsSensitive((v) => !v)}
          aria-pressed={isSensitive}
          className={ITEM}
        >
          <AlertTriangle
            className={`w-4 h-4 ${isSensitive ? 'text-site-warning' : 'text-site-text-muted'}`}
          />
          <span className="flex-1 text-left">
            {t('menu-content-warning', { defaultValue: 'Content warning' })}
          </span>
          {isSensitive && <Check className="w-4 h-4 text-site-warning" />}
        </button>
        <TakeMenuItem active={isTake} onToggle={() => setIsTake((v) => !v)} />
        <CodeEmbedMenuItem ce={codeEmbed} onPick={() => setMenuOpen(false)} />
        <PostsPlusMenuItems pp={postsPlus} onPick={() => setMenuOpen(false)} />
        <div className="my-1 border-t border-site-border" />
        {variant === 'row' ? (
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onAddEmoji();
            }}
            className={ITEM}
          >
            <Smile className="w-4 h-4 text-site-text-muted" />
            {t('emoji-picker-open', { defaultValue: 'Add emoji' })}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={imageCount >= MAX_IMAGES}
              onClick={() => {
                imageInputRef.current?.click();
                setMenuOpen(false);
              }}
              title={
                imageCount >= MAX_IMAGES
                  ? t('max-images-title', { defaultValue: 'Maximum 4 images' })
                  : undefined
              }
              className={`${ITEM} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <ImagePlus className="w-4 h-4 text-site-text-muted" />
              {t('menu-add-image', { defaultValue: 'Add Image' })}
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onAddGif();
              }}
              className={ITEM}
            >
              <ImagePlay className="w-4 h-4 text-site-text-muted" />
              {t('menu-add-gif', { defaultValue: 'Add GIF' })}
            </button>
            <button
              type="button"
              onClick={() => {
                onAddPoll();
                setMenuOpen(false);
              }}
              className={ITEM}
            >
              <BarChart3 className="w-4 h-4 text-site-text-muted" />
              {t('menu-create-poll', { defaultValue: 'Create Poll' })}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => {
            setShowPriceModal(true);
            setMenuOpen(false);
          }}
          className={ITEM}
        >
          <Coins className="w-4 h-4 text-site-text-muted" />
          {t('menu-set-unlock-price', { defaultValue: 'Set unlock price' })}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowCheatSheet(true);
            setMenuOpen(false);
          }}
          className={ITEM}
        >
          <Type className="w-4 h-4 text-site-text-muted" />
          {t('menu-markdown-cheatsheet', { defaultValue: 'Formatting help' })}
        </button>
        <div className="my-1 border-t border-site-border" />
        <button
          onClick={() => {
            onSaveDraft();
            setMenuOpen(false);
          }}
          disabled={!canSubmit}
          className={`${ITEM} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <FileText className="w-4 h-4 text-site-text-muted" />
          {t('menu-save-draft', { defaultValue: 'Save as draft' })}
        </button>
        <button
          onClick={() => {
            setShowSchedule(true);
            setMenuOpen(false);
          }}
          disabled={!canSubmit}
          className={`${ITEM} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <CalendarClock className="w-4 h-4 text-site-text-muted" />
          {t('menu-schedule', { defaultValue: 'Schedule…' })}
        </button>
        <Link
          to="/drafts"
          onClick={() => setMenuOpen(false)}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text-muted hover:bg-site-surface-hover hover:text-site-text transition-colors"
        >
          <FileText className="w-4 h-4 text-site-text-muted" />
          {t('menu-view-drafts', { defaultValue: 'View drafts' })}
        </Link>
      </AnchoredMenu>
    </>
  );
}
