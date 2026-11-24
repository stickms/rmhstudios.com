import { useRefusalText } from '@/components/errors/useRefusalText';
import { api } from '@/lib/contract/client';
import { editPostApi } from '@/lib/feed/compose-assist.contract';
import { useId, useRef, useState } from'react';
import { useTranslation } from'react-i18next';
import { X } from'lucide-react';
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogFooter,
} from'@/components/ui/dialog';
import { Button } from'@/components/ui/button';
import { Textarea } from'@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { QUIZ_EXPLANATION_MAX } from '@/lib/feed/quiz-poll';
import { MAX_CONTENT_WARNING_LENGTH, checkContentWarningInput } from '@/lib/feed/content-warning';
import { toast } from '@/lib/toast';
import { MAX_RMHARK_LENGTH } from'@/lib/rmhark-limits';
import { GifPicker } from './GifPickerLazy';
import { GifEmbed } from'./GifEmbed';
import { GifDescriptionField } from './compose/GifDescriptionField';
import { EmojiPickerButton } from'@/components/shared/EmojiPickerButton';
import { useEmojiInsert } from'@/lib/emoji/use-emoji-insert';

interface EditPostModalProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 postId: string;
 initialContent: string;
 initialGifUrl?: string | null;
 /** The GIF's current description (s06-15). */
 initialGifAlt?: string | null;
 /** The reason for the content warning, if any (s06-16). */
 initialContentWarning?: string | null;
 initialSensitive?: boolean;
 /** s07-19: the post's quiz, for its author: the options, the current answer and explanation, and whether votes have locked it. */
 quiz?: { options: { id: string; text: string }[]; correctOptionId: string; explanation: string; locked: boolean };
 onSaved: (
 content: string,
 gifUrl: string | null,
 gifAlt: string | null,
 warning: { isSensitive: boolean; contentWarning: string | null },
 quiz?: { correctOptionId: string; explanation: string },
 ) => void;
}

/** Edit your own post's text. Prior versions are preserved server-side. */
export function EditPostModal({
 open,
 onOpenChange,
 postId,
 initialContent,
 initialGifUrl,
 initialGifAlt,
 initialContentWarning,
 initialSensitive,
 quiz,
 onSaved,
}: EditPostModalProps) {
 const { t } = useTranslation(['feed', 'content-warnings', 'quiz-polls']);
 const refusalText = useRefusalText();
 const quizName = useId();
 const [quizAnswer, setQuizAnswer] = useState<string>(quiz?.correctOptionId ??'');
 const [quizWhy, setQuizWhy] = useState<string>(quiz?.explanation ??'');
 const warningId = useId();
 const [content, setContent] = useState(initialContent);
 const [gifUrl, setGifUrl] = useState<string>(initialGifUrl ??'');
 // Choosing a different GIF restarts the description from that GIF's provider text; it stays editable.
 const [gifAlt, setGifAlt] = useState<string>(initialGifAlt ??'');
 const [showGifPicker, setShowGifPicker] = useState(false);
 // The reason is the only warning control here: a warning with a reason covers the text too (s06-16).
 const [warning, setWarning] = useState<string>(initialContentWarning ??'');
 const [saving, setSaving] = useState(false);
 const textareaRef = useRef<HTMLTextAreaElement>(null);
 const insertEmoji = useEmojiInsert(textareaRef, content, setContent);
 const remaining = MAX_RMHARK_LENGTH - content.length;
 const warningCheck = checkContentWarningInput(warning);
 // Clearing a reason removes the whole warning; a warning that never had a reason is left as it was.
 const hadReason = !!initialContentWarning?.trim();
 const nextWarning = (): { isSensitive: boolean; contentWarning: string | null } => {
 const reason = warningCheck.reason;
 if (reason) return { isSensitive: true, contentWarning: reason };
 return hadReason ? { isSensitive: false, contentWarning: null } : { isSensitive: !!initialSensitive, contentWarning: null };
 };

 const save = async () => {
 const trimmed = content.trim();
 if ((!trimmed && !gifUrl.trim()) || trimmed.length > MAX_RMHARK_LENGTH || !warningCheck.ok) return;
 const next = nextWarning();
 // The answer and explanation go only when they changed and the quiz is not locked by votes.
 const quizChanged = !!quiz && !quiz.locked && (quizAnswer !== quiz.correctOptionId || quizWhy.trim() !== quiz.explanation);
 setSaving(true);
 try {
 await api(editPostApi, {
 params: { id: postId },
 body: {
 content: trimmed,
 gifUrl: gifUrl.trim() || null,
 // Always sent with the GIF, so the server stores what this field shows (null when there is no GIF).
 gifAlt: gifUrl.trim() ? gifAlt.trim() || null : null,
 isSensitive: next.isSensitive,
 contentWarning: next.contentWarning,
 ...(quizChanged ? { quizCorrectOptionId: quizAnswer, quizExplanation: quizWhy.trim() || null } : {}),
 },
 });
 onSaved(
 trimmed,
 gifUrl.trim() || null,
 gifUrl.trim() ? gifAlt.trim() || null : null,
 next,
 quizChanged ? { correctOptionId: quizAnswer, explanation: quizWhy.trim() } : undefined,
 );
 onOpenChange(false);
 toast.success(t('post-updated', { defaultValue:'Post updated'}));
 } catch (e) {
 toast.error(refusalText.maybe(e) || t('could-not-update-post', { defaultValue:'Could not update post'}));
 } finally {
 setSaving(false);
 }
 };

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent mobileFullscreen className="sm:max-w-lg">
 <DialogHeader>
 <DialogTitle>{t('edit-post-title', { defaultValue:'Edit post'})}</DialogTitle>
 </DialogHeader>
 <Textarea
 ref={textareaRef}
 autoFocus
 aria-label={t('edit-post-content-label', { defaultValue:'Edit post content'})}
 value={content}
 onChange={(e) => setContent(e.target.value)}
 rows={5}
 className="resize-none"
 />
 <div className="mt-3">
 <label className="t-label mb-1 block" htmlFor={warningId}>
 {t('warning-field-label', { ns: 'content-warnings', defaultValue:'Content warning'})}
 </label>
 <Input
 id={warningId}
 value={warning}
 onChange={(e) => setWarning(e.target.value)}
 maxLength={MAX_CONTENT_WARNING_LENGTH}
 placeholder={t('warning-field-placeholder', { ns: 'content-warnings', defaultValue:'What is it for? Optional'})}
 aria-invalid={!warningCheck.ok}
 />
 <p className="t-meta mt-1">
 {t('warning-field-hint', { ns: 'content-warnings', defaultValue:'A reason covers the post, text and media, until a reader chooses to show it.'})}
 </p>
 </div>
 {quiz && (
 <fieldset className="mt-3" disabled={quiz.locked}>
 <legend className="t-label mb-1">{t('quiz-edit-heading', { ns: 'quiz-polls', defaultValue:'Quiz answer'})}</legend>
 {quiz.locked && (
 <p className="t-meta mb-1">
 {t('quiz-locked', { ns: 'quiz-polls', defaultValue:'Somebody has answered, so the answer and explanation are locked.'})}
 </p>
 )}
 {quiz.options.map((o) => (
 <label key={o.id} className="t-body flex min-h-9 items-center gap-2">
 <input
 type="radio"
 name={`${quizName}-answer`}
 checked={quizAnswer === o.id}
 onChange={() => setQuizAnswer(o.id)}
 className="size-4 shrink-0 accent-[var(--site-text)]"
 />
 {o.text}
 </label>
 ))}
 <label className="t-label mt-2 block" htmlFor={`${quizName}-why`}>
 {t('quiz-explanation-label', { ns: 'quiz-polls', defaultValue:'Explanation'})}
 </label>
 <Input id={`${quizName}-why`} value={quizWhy} onChange={(e) => setQuizWhy(e.target.value)} maxLength={QUIZ_EXPLANATION_MAX} />
 </fieldset>
 )}
 {/* GIF section */}
 <div className="mt-3 relative py-3">
 <div className="flex items-center justify-between mb-2">
 <span className="text-xs font-semibold text-site-text-muted">
 {t('gif-heading', { defaultValue:'GIF'})}
 </span>
 {gifUrl.trim() && (
 <button
 type="button"
 onClick={() => {
 setGifUrl('');
 setGifAlt('');
 setShowGifPicker(false);
 }}
 className="p-2 rounded-full text-site-text-muted hover:text-site-text hover:bg-site-surface-hover transition-colors"
 aria-label={t('remove-gif-aria', { defaultValue:'Remove GIF'})}
 >
 <X className="w-3.5 h-3.5"/>
 </button>
 )}
 </div>

 {gifUrl.trim() ? (
 <div className="relative">
 <GifEmbed url={gifUrl.trim()} gifAlt={gifAlt} />
 <button
 type="button"
 onClick={() => {
 setGifUrl('');
 setGifAlt('');
 setShowGifPicker(true);
 }}
 aria-label={t('swap-gif-aria', { defaultValue:'Swap GIF'})}
 className="absolute top-2 right-2 rounded-full bg-site-media-scrim-strong px-3 py-1 text-xs text-site-media-ink hover:bg-site-media-scrim-hover transition-colors"
 >
 {t('swap', { defaultValue:'Swap'})}
 </button>
 <GifDescriptionField value={gifAlt} onChange={setGifAlt} className="mt-2" />
 </div>
 ) : showGifPicker ? (
 <GifPicker
 onSelect={({ url, description }) => {
 setGifUrl(url);
 setGifAlt(description);
 setShowGifPicker(false);
 }}
 />
 ) : (
 <button
 type="button"
 onClick={() => setShowGifPicker(true)}
 className="text-xs text-site-accent hover:underline"
 >
 {t('add-gif', { defaultValue:'Add GIF'})}
 </button>
 )}
 </div>

 <div className="flex items-center justify-between">
 <span className={`text-xs ${remaining < 0 ?'text-site-danger':'text-site-text-muted'}`}>
 {remaining}
 </span>
 </div>
 <DialogFooter>
 <EmojiPickerButton direction="up"onSelect={insertEmoji} className="mr-auto"/>
 <Button variant="ghost"onClick={() => onOpenChange(false)} disabled={saving}>
 {t('cancel', { defaultValue:'Cancel'})}
 </Button>
 <Button
 variant="default"
 onClick={save}
 disabled={saving || (!content.trim() && !gifUrl.trim()) || remaining < 0 || !warningCheck.ok}
 >
 {saving
 ? t('saving', { defaultValue:'Saving…'})
 : t('save', { defaultValue:'Save'})}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}
