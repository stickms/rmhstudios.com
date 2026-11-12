import { useRef } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import {
  Plus,
  BarChart3,
  ImagePlay,
  ImagePlus,
  Coins,
  Type,
  FileText,
  CalendarClock,
  Check,
  AlertTriangle,
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
import {
  MAX_IMAGES,
  emptyPoll,
  type Attachment,
  type AudienceValue,
  type PollDraft,
  type ReplyControlValue,
} from './compose-state';
import { useAudienceOptions, useReplyOptions } from './compose-options';

const ITEM =
  'flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface-hover transition-colors';

/**
 * The (+) button and its menu: visibility, replies, content warning, take,
 * code embed, posts-plus, image, GIF, poll, unlock price, formatting help,
 * draft and schedule.
 *
 * The panel is an AnchoredMenu: it portals to <body> (in place it is trapped
 * inside the page frame's stacking context, so the top bar and the floating
 * chrome paint over it) and it opens on whichever side of the composer has
 * room, rather than being shoved back down the screen by a viewport clamp.
 */
export function ComposeMenu({
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
  attachment,
  setAttachment,
  setGifUrl,
  setPoll,
  setShowPriceModal,
  setShowCheatSheet,
  canSubmit,
  onSaveDraft,
  setShowSchedule,
}: {
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
  attachment: Attachment;
  setAttachment: Dispatch<SetStateAction<Attachment>>;
  setGifUrl: (url: string) => void;
  setPoll: Dispatch<SetStateAction<PollDraft>>;
  setShowPriceModal: (open: boolean) => void;
  setShowCheatSheet: (open: boolean) => void;
  canSubmit: boolean;
  onSaveDraft: () => void;
  setShowSchedule: (show: boolean) => void;
}) {
  const { t } = useTranslation('feed');
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const audienceOptions = useAudienceOptions();
  const replyOptions = useReplyOptions();
  const currentAudience = audienceOptions.find((o) => o.value === audience) ?? audienceOptions[0];
  const CurrentAudienceIcon = currentAudience.icon;
  const currentReply = replyOptions.find((o) => o.value === replyControl) ?? replyOptions[0];
  const CurrentReplyIcon = currentReply.icon;

  return (
    <>
      <button
        ref={menuBtnRef}
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-label={t('add-to-post-aria', { defaultValue: 'Add to post' })}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="p-1.5 rounded-full text-site-text-muted hover:text-site-accent hover:bg-site-accent/10 transition-colors"
      >
        <Plus className="w-4.5 h-4.5" />
      </button>

      <AnchoredMenu
        open={menuOpen}
        onClose={closeMenu}
        anchorRef={menuBtnRef}
        label={t('add-to-post-aria', { defaultValue: 'Add to post' })}
        side="top"
        align="end"
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
          onClick={() => {
            if (attachment === 'gif') setGifUrl('');
            setAttachment((a) => (a === 'gif' ? null : 'gif'));
            setPoll(emptyPoll());
            setMenuOpen(false);
          }}
          aria-pressed={attachment === 'gif'}
          className={ITEM}
        >
          <ImagePlay className="w-4 h-4 text-site-text-muted" />
          {t('menu-add-gif', { defaultValue: 'Add GIF' })}
        </button>
        <button
          onClick={() => {
            setAttachment('poll');
            setGifUrl('');
            setMenuOpen(false);
          }}
          className={ITEM}
        >
          <BarChart3 className="w-4 h-4 text-site-text-muted" />
          {t('menu-create-poll', { defaultValue: 'Create Poll' })}
        </button>
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
