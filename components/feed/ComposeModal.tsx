'use client';

import { useState, useRef, useEffect } from'react';
import { useTranslation } from'react-i18next';
import { X, Plus, BarChart3, ImagePlus } from'lucide-react';
import { GifEmbed } from'./GifEmbed';
import { GifPicker } from'./GifPicker';
import { AIGenerateButton } from'./AIGenerateButton';
import { MentionTextarea } from'./MentionTextarea';
import { EmojiPickerButton } from'@/components/shared/EmojiPickerButton';
import { useEmojiInsert } from'@/lib/emoji/use-emoji-insert';
import { useResolvedUser, useSession } from'@/components/Providers';
import { buildOptimizedUrl } from'@/components/ui/OptimizedImage';
import { Button } from'@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { MenuItem } from '@/components/ui/menu';
import { usePopPresence } from '@/hooks/usePopPresence';
import { useFeedStore } from'@/stores/feedStore';
import {
 MAX_RMHARK_LENGTH,
 MAX_POLL_QUESTION_LENGTH,
 MAX_POLL_OPTION_LENGTH,
 MIN_POLL_OPTIONS,
 MAX_POLL_OPTIONS,
 MAX_IMAGE_ALT_LENGTH,
} from'@/lib/rmhark-limits';
import { clearComposeDraft, useComposeDraftAutosave } from'@/hooks/useComposeDraft';

const MAX_IMAGES = 4;

type Attachment ='poll'|'gif'| null;

interface PollDraft {
 question: string;
 options: string[];
 multiSelect: boolean;
}

interface ComposeModalProps {
 open: boolean;
 onClose: () => void;
 /** When quoting, the post being quoted (renders a preview + sends originalId). */
 quoteItem?: {
 id: string;
 content?: string;
 user?: { name?: string | null; handle?: string | null };
 } | null;
 /** Seed the composer with text (e.g. content shared into the PWA via share_target). */
 initialContent?: string;
}

export function ComposeModal({ open, onClose, quoteItem, initialContent =''}: ComposeModalProps) {
 const { t } = useTranslation('feed');
 // Both `.glass-scrim` backdrops here are viewport-covering `backdrop-filter`
 // layers, and nothing may animate above one — Chromium re-blurs the whole
 // layer every frame that anything does.
 const [content, setContent] = useState(initialContent);
 const [submitting, setSubmitting] = useState(false);
 const [attachment, setAttachment] = useState<Attachment>(null);
 const [menuOpen, setMenuOpen] = useState(false);
 const [poll, setPoll] = useState<PollDraft>({
 question:'',
 options: ['',''],
 multiSelect: false,
 });
 const [gifUrl, setGifUrl] = useState('');
 const [imageUrls, setImageUrls] = useState<string[]>([]);
 // Per-image alt text (accessibility), aligned by index with imageUrls.
 const [imageAlts, setImageAlts] = useState<string[]>([]);
 const [altEditIndex, setAltEditIndex] = useState<number | null>(null);
 const [imageError, setImageError] = useState<string | null>(null);
 // The portal target only exists on the client; render nothing until mounted.
 const [mounted, setMounted] = useState(false);
 const imageInputRef = useRef<HTMLInputElement>(null);
 const menuRef = useRef<HTMLDivElement>(null);
 const menuPopRef = useRef<HTMLDivElement>(null);
 const menuBtnRef = useRef<HTMLButtonElement>(null);
 // The shared bloom (globals.css §7.1) — held mounted for its close.
 const { present: menuPresent, state: menuState } = usePopPresence(menuOpen);
 const textareaRef = useRef<HTMLTextAreaElement>(null);
 const insertEmoji = useEmojiInsert(textareaRef, content, setContent);
 const { prependItem } = useFeedStore();
 const { data: session } = useSession();
 const { resolved: resolvedUser } = useResolvedUser();

 const remaining = MAX_RMHARK_LENGTH - content.length;

 // Autosave plain drafts (not quotes/seeded shares — those would overwrite a
 // draft typed elsewhere). Restore is offered by the feed ComposeBox.
 useComposeDraftAutosave(content, gifUrl, open && !quoteItem && !initialContent);

 useEffect(() => setMounted(true), []);

 // Escape: Radix owns it (top layer only). The menu is not a layer, so it is
 // backed out first via onEscapeKeyDown below; the alt-text editor is its own
 // Dialog and takes Escape before the composer does.


 // Close menu on outside click
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

 const hasPoll =
 attachment ==='poll'&&
 poll.question.trim() &&
 poll.options.filter((o) => o.trim()).length >= MIN_POLL_OPTIONS;
 const hasGif = attachment ==='gif'&& gifUrl.trim().length > 0;
 const hasImages = imageUrls.length > 0;
 const hasContent = content.trim().length > 0;
 const canSubmit =
 (hasContent || hasPoll || hasGif || hasImages || !!quoteItem) && remaining >= 0 && !submitting;

 const handleImageFiles = async (files: FileList | null) => {
 if (!files || files.length === 0) return;
 setImageError(null);
 const remainingSlots = MAX_IMAGES - imageUrls.length;
 const form = new FormData();
 Array.from(files)
 .slice(0, remainingSlots)
 .forEach((f) => form.append('images', f));
 try {
 const res = await fetch('/api/rmharks/image', { method:'POST', body: form });
 if (!res.ok) {
 const { error } = await res.json().catch(() => ({ error:'Upload failed'}));
 setImageError(error ??'Upload failed');
 return;
 }
 const { urls } = await res.json();
 setImageUrls((prev) => [...prev, ...urls].slice(0, MAX_IMAGES));
 } catch {
 setImageError('Upload failed');
 }
 };

 const handleSubmit = async () => {
 if (!canSubmit) return;

 setSubmitting(true);
 try {
 const body: Record<string, unknown> = {};
 if (content.trim()) body.content = content.trim();
 if (hasPoll) {
 body.poll = {
 question: poll.question.trim(),
 options: poll.options.filter((o) => o.trim()).map((o) => o.trim()),
 multiSelect: poll.multiSelect,
 };
 }
 if (hasGif) body.gifUrl = gifUrl.trim();
 if (hasImages) {
 body.imageUrls = imageUrls;
 if (imageAlts.some((a) => a?.trim())) {
 body.imageAlts = imageUrls.map((_, i) => imageAlts[i]?.trim() ??'');
 }
 }
 if (quoteItem) body.originalId = quoteItem.id;

 const res = await fetch('/api/rmharks', {
 method:'POST',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify(body),
 });

 if (!res.ok) {
 const data = await res.json();
 console.error('Post error:', data.error);
 return;
 }

 const item = await res.json();
 prependItem(item);
 if (!quoteItem && !initialContent) clearComposeDraft();
 setContent('');
 setAttachment(null);
 setPoll({ question:'', options: ['',''], multiSelect: false });
 setGifUrl('');
 setImageUrls([]);
 setImageAlts([]);
 setAltEditIndex(null);
 setImageError(null);
 onClose();
 } catch (error) {
 console.error('Post error:', error);
 } finally {
 setSubmitting(false);
 }
 };

 if (!open || !session || !mounted) return null;

 return (
 <>
 <Dialog
 open
 onOpenChange={(o) => {
 if (!o) onClose();
 }}
 >
 <DialogContent
 mobileFullscreen
 aria-describedby={undefined}
 data-motion="rise"
 onInteractOutside={(e) => {
 // Menus and pickers portal to <body> outside this Radix layer; a press on one is not "outside".
 if ((e.target as HTMLElement | null)?.closest?.('[data-slot="anchored-menu"]')) e.preventDefault();
 }}
 onEscapeKeyDown={(e) => {
 if (menuOpen) {
 e.preventDefault();
 setMenuOpen(false);
 }
 }}
 className="gap-0 overflow-y-auto overscroll-contain p-0 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-site-text sm:top-[10vh] sm:max-h-[80dvh] sm:translate-y-0 sm:p-0"
 >
 {/* Header */}
 <div className="flex items-center justify-between border-b border-site-border py-3 pl-4 pr-14">
 <DialogTitle className="text-sm font-semibold">
 {t('palette-new-post', { defaultValue:'New post'})}
 </DialogTitle>
 <div className="flex items-center gap-2">
 {/* AI draft button */}
 <AIGenerateButton
 request={{ mode:'post', draft: content }}
 onGenerated={(text) => setContent(text)}
 title={t('generate-post-ai', { defaultValue:'Generate a post with AI'})}
 />

 {/* Image upload button */}
 <button
 type="button"
 disabled={imageUrls.length >= MAX_IMAGES}
 onClick={() => imageInputRef.current?.click()}
 title={
 imageUrls.length >= MAX_IMAGES
 ? t('max-images', { defaultValue:'Maximum 4 images'})
 : t('attach-images', { defaultValue:'Attach images'})
 }
 className="p-1.5 rounded-full text-site-text-dim hover:text-site-accent hover:bg-site-accent/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
 >
 <ImagePlus className="w-4.5 h-4.5"/>
 </button>

 {/* GIF button */}
 <button
 type="button"
 onClick={() => {
 setAttachment((a) => (a ==='gif'? null :'gif'));
 setPoll({ question:'', options: ['',''], multiSelect: false });
 }}
 aria-pressed={attachment ==='gif'}
 title={t('attach-gif-title', { defaultValue:'Add a GIF'})}
 className={`px-1.5 py-1 rounded-full text-xs font-bold leading-none border transition-colors ${
 attachment ==='gif'
 ?'border-site-accent text-site-accent bg-site-accent/10'
 :'border-site-border text-site-text-dim hover:text-site-accent hover:bg-site-accent/10'
 }`}
 >
 {t('gif-heading', { defaultValue:'GIF'})}
 </button>

 {/* Emoji picker */}
 <EmojiPickerButton direction="down"onSelect={insertEmoji} />

 {/* Plus button */}
 <div className="relative"ref={menuRef}>
 <button
 ref={menuBtnRef}
 onClick={() => setMenuOpen((v) => !v)}
 aria-label={t('add-to-post-aria', { defaultValue:'Add to post'})}
 aria-haspopup="menu"
 aria-expanded={menuOpen}
 className="p-1.5 rounded-full text-site-text-dim hover:text-site-accent hover:bg-site-accent/10 transition-colors"
 >
 <Plus className="w-4.5 h-4.5"/>
 </button>

 {/* The ROW is the shared `MenuItem` primitive; the PANEL deliberately
 stays in place rather than moving onto AnchoredMenu. AnchoredMenu
 portals to <body> to clear the SHELL chrome (inside a dialog it lifts
 to `--z-menu-in-dialog`, see components/ui/anchored-menu.css).
 In here there is no shell chrome to clear and nothing clips the
 panel, so the reason to portal does not apply. Outside-click,
 Escape and the close animation therefore stay local, above. */}
 {menuPresent && (
 <div
 ref={menuPopRef}
 data-motion="pop"
 data-state={menuState}
 role="menu"
 aria-label={t('add-to-post-aria', { defaultValue:'Add to post'})}
 className="absolute top-full right-0 mt-1 w-52 origin-top-right glass-overlay p-2 z-50"
 >
 <MenuItem
 icon={BarChart3}
 onSelect={() => {
 setAttachment('poll');
 setGifUrl('');
 setMenuOpen(false);
 }}
 >
 {t('create-poll', { defaultValue:'Create Poll'})}
 </MenuItem>
 </div>
 )}
 </div>

 <Button variant="accent"size="sm"disabled={!canSubmit} onClick={handleSubmit}>
 {submitting
 ? t('posting', { defaultValue:'Posting…'})
 : t('post', { defaultValue:'Post'})}
 </Button>
 </div>
 </div>

 {/* Compose area */}
 <div className="px-4 py-3">
 <div className="flex gap-3">
 {/* Avatar */}
 <div className="w-10 h-10 rounded-full bg-linear-to-tr from-site-accent to-site-accent-hover flex items-center justify-center text-site-bg font-bold text-sm ring-2 ring-site-bg shrink-0">
 {resolvedUser?.image || session.user.image ? (
 // Optimized at ~2x the 40px display size (avoids the raw CDN original).
 <img
 src={buildOptimizedUrl(resolvedUser?.image || session.user.image!, 80, 80)}
 alt={
 resolvedUser?.name ||
 session.user.name ||
 t('user-alt', { defaultValue:'User'})
 }
 loading="lazy"
 decoding="async"
 width={40}
 height={40}
 className="w-full h-full rounded-full object-cover"
 onError={(e) => {
 (e.target as HTMLImageElement).src ='/images/social/default_avatar.png';
 }}
 />
 ) : (
 ((resolvedUser?.name || session.user.name)?.[0] ||'U').toUpperCase()
 )}
 </div>

 <div className="flex-1 min-w-0">
 <MentionTextarea
 ref={textareaRef}
 autoFocus
 value={content}
 onChange={setContent}
 placeholder={t('compose-placeholder', { defaultValue:"What's on your mind?"})}
 rows={4}
 maxLength={MAX_RMHARK_LENGTH}
 className="w-full bg-transparent text-site-text placeholder:text-site-text-dim text-base resize-none border-none outline-none"
 onKeyDown={(e) => {
 if (e.key ==='Enter'&& (e.metaKey || e.ctrlKey)) {
 handleSubmit();
 }
 }}
 />

 {/* Quoted post preview */}
 {quoteItem && (
 <div className="glass-fill mt-2 rounded-site px-4 py-3">
 <p className="text-xs font-semibold text-site-text">
 {quoteItem.user?.name || quoteItem.user?.handle ||'Someone'}
 </p>
 <p className="mt-0.5 line-clamp-3 text-sm text-site-text-muted">
 {quoteItem.content}
 </p>
 </div>
 )}

 {/* Poll creator */}
 {attachment ==='poll'&& (
 <div className="glass-fill mt-2 rounded-site px-4 py-3">
 <div className="flex items-center justify-between mb-2">
 <span className="text-xs font-semibold text-site-text-dim uppercase tracking-wide">
 Poll
 </span>
 <button
 onClick={() => {
 setAttachment(null);
 setPoll({ question:'', options: ['',''], multiSelect: false });
 }}
 className="p-1 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface-hover transition-colors"
 >
 <X className="w-3.5 h-3.5"/>
 </button>
 </div>

 <input
 type="text"
 value={poll.question}
 onChange={(e) => setPoll((p) => ({ ...p, question: e.target.value }))}
 placeholder={t('poll-question-placeholder', {
 defaultValue:'Ask a question…',
 })}
 maxLength={MAX_POLL_QUESTION_LENGTH}
 className="w-full glass-inset text-site-text placeholder:text-site-text-dim text-sm rounded-site-sm px-3 py-2 outline-none focus:border-site-accent transition-colors mb-2"
 />

 <div className="space-y-2">
 {poll.options.map((opt, i) => (
 <div key={i} className="flex items-center gap-2">
 <input
 type="text"
 value={opt}
 onChange={(e) => {
 const newOptions = [...poll.options];
 newOptions[i] = e.target.value;
 setPoll((p) => ({ ...p, options: newOptions }));
 }}
 placeholder={t('poll-option-placeholder', {
 index: i + 1,
 defaultValue:'Option {{index}}',
 })}
 maxLength={MAX_POLL_OPTION_LENGTH}
 className="flex-1 glass-inset text-site-text placeholder:text-site-text-dim text-sm rounded-site-sm px-3 py-2 outline-none focus:border-site-accent transition-colors"
 />
 {poll.options.length > MIN_POLL_OPTIONS && (
 <button
 onClick={() => {
 const newOptions = poll.options.filter((_, j) => j !== i);
 setPoll((p) => ({ ...p, options: newOptions }));
 }}
 className="p-1 rounded-full text-site-text-dim hover:text-site-danger hover:bg-site-danger/10 transition-colors"
 >
 <X className="w-3.5 h-3.5"/>
 </button>
 )}
 </div>
 ))}
 </div>

 {poll.options.length < MAX_POLL_OPTIONS && (
 <button
 onClick={() => setPoll((p) => ({ ...p, options: [...p.options,''] }))}
 className="mt-2 text-xs text-site-accent hover:text-site-accent-hover transition-colors"
 >
 {t('add-poll-option', { defaultValue:'+ Add option'})}
 </button>
 )}

 <label className="flex items-center gap-2 mt-3 cursor-pointer">
 <input
 type="checkbox"
 checked={poll.multiSelect}
 onChange={(e) => setPoll((p) => ({ ...p, multiSelect: e.target.checked }))}
 className="rounded border-site-border text-site-accent focus:ring-site-accent"
 />
 <span className="text-xs text-site-text-dim">
 {t('allow-multiple-selections', {
 defaultValue:'Allow multiple selections',
 })}
 </span>
 </label>
 </div>
 )}

 {/* GIF picker */}
 {attachment ==='gif'&& (
 <div className="glass-fill mt-2 rounded-site px-4 py-3">
 <div className="flex items-center justify-between mb-2">
 <span className="text-xs font-semibold text-site-text-dim uppercase tracking-wide">
 {t('gif-heading', { defaultValue:'GIF'})}
 </span>
 <button
 type="button"
 onClick={() => {
 setAttachment(null);
 setGifUrl('');
 }}
 className="p-1 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface-hover transition-colors"
 >
 <X className="w-3.5 h-3.5"/>
 </button>
 </div>

 {gifUrl.trim() ? (
 <div className="relative">
 <GifEmbed url={gifUrl.trim()} />
 <button
 type="button"
 onClick={() => setGifUrl('')}
 aria-label={t('remove-gif-aria', { defaultValue:'Remove GIF'})}
 className="absolute top-1 right-1 p-1 rounded-full bg-site-media-scrim-strong text-site-media-ink hover:bg-site-media-scrim-hover transition-colors"
 >
 <X className="w-3.5 h-3.5"/>
 </button>
 </div>
 ) : (
 <GifPicker onSelect={(u) => setGifUrl(u)} />
 )}
 </div>
 )}

 {/* Uploaded image preview strip */}
 {imageUrls.length > 0 && (
 <div
 className={`mt-2 grid gap-1 ${imageUrls.length === 1 ?'grid-cols-1':'grid-cols-2'}`}
 >
 {imageUrls.map((url, i) => {
 const hasAlt = !!imageAlts[i]?.trim();
 return (
 <div key={url} className="relative group">
 <img
 src={url}
 alt={imageAlts[i]?.trim() ||''}
 loading="lazy"
 className="w-full rounded-site-sm object-cover max-h-48"
 />
 <button
 type="button"
 onClick={() => setAltEditIndex(i)}
 aria-label={
 hasAlt
 ? t('edit-alt-text-aria', { defaultValue:'Edit image description'})
 : t('add-alt-text-aria', { defaultValue:'Add image description'})
 }
 title={
 imageAlts[i]?.trim() ||
 t('alt-text-title', {
 defaultValue:'Describe this image for screen readers',
 })
 }
 className={`absolute bottom-1 left-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide transition-colors ${
 hasAlt
 ?'bg-site-accent text-site-accent-fg'
 :'bg-site-media-scrim-strong text-site-media-ink/90 hover:bg-site-media-scrim-hover'
 }`}
 >
 {t('alt-badge', { defaultValue:'Alt'})}
 </button>
 <button
 type="button"
 aria-label={t('remove-image', { defaultValue:'Remove image'})}
 onClick={() => {
 setImageUrls((prev) => prev.filter((_, j) => j !== i));
 setImageAlts((prev) => prev.filter((_, j) => j !== i));
 }}
 className="absolute top-1 right-1 flex size-11 items-center justify-center rounded-full bg-site-media-scrim-strong text-site-media-ink transition-opacity sm:size-auto sm:p-0.5 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
 >
 <X className="w-3.5 h-3.5"/>
 </button>
 </div>
 );
 })}
 </div>
 )}
 {imageError && <p className="text-xs text-site-danger mt-1">{imageError}</p>}

 {/* Hidden file input */}
 <input
 ref={imageInputRef}
 type="file"
 accept="image/png,image/jpeg,image/gif,image/webp"
 multiple
 className="hidden"
 onChange={(e) => handleImageFiles(e.target.files)}
 />
 </div>
 </div>
 </div>

 {/* Footer */}
 <div className="px-4 py-3 border-t border-site-border flex items-center justify-end">
 <span
 className={`text-xs font-mono ${
 remaining <= 0
 ?'text-site-danger'
 : remaining <= 20
 ?'text-site-warning'
 :'text-site-text-dim'
 }`}
 >
 {remaining}
 </span>
 </div>
  </DialogContent>
 </Dialog>

 {/* Image alt-text editor — opened from the ALT pill on a preview image */}
 <Dialog open={altEditIndex !== null && !!imageUrls[altEditIndex]} onOpenChange={(o) => !o && setAltEditIndex(null)}>
 {altEditIndex !== null && imageUrls[altEditIndex] && (
 <DialogContent aria-describedby="compose-alt-help" className="max-w-md gap-0 p-4 sm:p-4">
 <DialogTitle className="mb-2 pr-11 font-sans text-sm font-semibold text-site-text">
 {t('alt-text-heading', { defaultValue:'Describe this image'})}
 </DialogTitle>
 <p id="compose-alt-help" className="mb-3 text-xs text-site-text-muted">
 {t('alt-text-help', {
 defaultValue:
"Alt text lets people who use screen readers understand your image. Describe what's in it.",
 })}
 </p>
 <img
 src={imageUrls[altEditIndex]}
 alt={imageAlts[altEditIndex]?.trim() ||''}
 className="mb-3 max-h-40 w-full rounded-site-sm object-contain bg-site-surface"
 />
 <label htmlFor="compose-modal-alt-input"className="sr-only">
 {t('alt-text-heading', { defaultValue:'Describe this image'})}
 </label>
 <textarea
 id="compose-modal-alt-input"
 autoFocus
 rows={3}
 maxLength={MAX_IMAGE_ALT_LENGTH}
 value={imageAlts[altEditIndex] ??''}
 onChange={(e) => {
 const value = e.target.value;
 setImageAlts((prev) => {
 const next = [...prev];
 while (next.length <= altEditIndex) next.push('');
 next[altEditIndex] = value;
 return next;
 });
 }}
 placeholder={t('alt-text-placeholder', {
 defaultValue:'e.g. A golden retriever running on a beach at sunset',
 })}
 className="w-full resize-none rounded-site-sm glass-inset px-3 py-2 text-sm text-site-text placeholder:text-site-text-dim outline-none focus:border-site-accent transition-colors"
 />
 <div className="mt-3 flex items-center justify-between">
 <span className="text-xs font-mono text-site-text-dim">
 {MAX_IMAGE_ALT_LENGTH - (imageAlts[altEditIndex]?.length ?? 0)}
 </span>
 <Button variant="accent"size="sm"onClick={() => setAltEditIndex(null)}>
 {t('done', { defaultValue:'Done'})}
 </Button>
 </div>
 </DialogContent>
 )}
 </Dialog>
 </>
 );
}
