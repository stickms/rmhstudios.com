'use client';

import { useState } from'react';
import { useTranslation } from'react-i18next';
import { toast } from'sonner';
import { Plus, X, MessagesSquare } from'lucide-react';
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
 DialogTrigger,
 DialogFooter,
} from'@/components/ui/dialog';
import { Button } from'@/components/ui/button';
import { Textarea } from'@/components/ui/textarea';
import { useFeedStore } from'@/stores/feedStore';
import type { FeedItem } from'@/lib/feed-types';

const MAX_LEN = 280;
const MAX_SEGMENTS = 25;

/**
 * Authored-thread composer: chain several of your own posts. Renders a trigger
 * button + a modal of text segments (add/remove). On success the root is
 * optimistically prepended to the feed via the store.
 */
export function ThreadComposer() {
 const { t } = useTranslation('feed');
 const prependItem = useFeedStore((s) => s.prependItem);
 const [open, setOpen] = useState(false);
 const [segments, setSegments] = useState<string[]>(['','']);
 const [busy, setBusy] = useState(false);

 const setSeg = (i: number, v: string) =>
 setSegments((s) => s.map((x, idx) => (idx === i ? v.slice(0, MAX_LEN) : x)));
 const addSeg = () => setSegments((s) => (s.length < MAX_SEGMENTS ? [...s,''] : s));
 const removeSeg = (i: number) =>
 setSegments((s) => (s.length > 2 ? s.filter((_, idx) => idx !== i) : s));

 const filledCount = segments.filter((s) => s.trim()).length;
 const canPost = filledCount >= 2 && !segments.some((s) => s.length > MAX_LEN);

 const reset = () => setSegments(['','']);

 const post = async () => {
 if (!canPost || busy) return;
 setBusy(true);
 try {
 const res = await fetch('/api/rmharks/thread', {
 method:'POST',
 credentials:'include',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({ segments: segments.map((s) => s.trim()).filter(Boolean) }),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok) {
 toast.error(data.error ?? t('thread-failed', { defaultValue:'Could not post thread.'}));
 return;
 }
 prependItem(data as FeedItem);
 toast.success(t('thread-posted', { defaultValue:'Thread posted!'}));
 reset();
 setOpen(false);
 } catch {
 toast.error(t('thread-failed', { defaultValue:'Could not post thread.'}));
 } finally {
 setBusy(false);
 }
 };

 return (
 <Dialog open={open} onOpenChange={setOpen}>
 <div className="flex items-center border-b border-site-border px-4 py-2">
 <DialogTrigger asChild>
 <button
 type="button"
 className="inline-flex items-center gap-1.5 rounded-site-sm px-2.5 py-1.5 text-sm font-medium text-site-text-muted transition-colors hover:bg-site-surface hover:text-site-text"
 >
 <MessagesSquare className="h-4 w-4"aria-hidden />
 {t('start-thread', { defaultValue:'Start a thread'})}
 </button>
 </DialogTrigger>
 </div>

 <DialogContent mobileFullscreen>
 <DialogHeader>
 <DialogTitle>{t('new-thread', { defaultValue:'New thread'})}</DialogTitle>
 </DialogHeader>

 <div className="max-h-[55dvh] space-y-3 overflow-y-auto pr-1">
 {segments.map((seg, i) => (
 <div
 key={i}
 className="relative rounded-site border border-site-border bg-site-surface/40 p-2"
 >
 <div className="flex items-start gap-2">
 <span className="mt-2 text-xs font-bold text-site-text-dim">{i + 1}</span>
 <Textarea
 value={seg}
 onChange={(e) => setSeg(i, e.target.value)}
 rows={3}
 aria-label={t('thread-segment-label', {
 defaultValue:'Thread post {{n}}',
 n: i + 1,
 })}
 placeholder={
 i === 0
 ? t('thread-first-placeholder', { defaultValue:'Start your thread…'})
 : t('thread-next-placeholder', { defaultValue:'Add another post…'})
 }
 className="flex-1 resize-none"
 />
 </div>
 <div className="mt-1 flex items-center justify-end gap-3 pl-6">
 <span
 className={`text-xs ${seg.length >= MAX_LEN ?'text-site-danger':'text-site-text-dim'}`}
 >
 {MAX_LEN - seg.length}
 </span>
 {segments.length > 2 && (
 <button
 type="button"
 onClick={() => removeSeg(i)}
 aria-label={t('thread-remove-post', {
 defaultValue:'Remove post {{n}}',
 n: i + 1,
 })}
 className="text-site-text-dim hover:text-site-danger"
 >
 <X className="h-4 w-4"aria-hidden />
 </button>
 )}
 </div>
 </div>
 ))}
 </div>

 <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
 <Button
 variant="outline"
 size="sm"
 onClick={addSeg}
 disabled={segments.length >= MAX_SEGMENTS}
 className="gap-1"
 >
 <Plus className="h-4 w-4"aria-hidden />{''}
 {t('thread-add-post', { defaultValue:'Add post'})}
 </Button>
 <Button variant="accent"size="sm"onClick={post} disabled={!canPost} loading={busy}>
 {t('post-thread', { defaultValue:'Post thread'})}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}
