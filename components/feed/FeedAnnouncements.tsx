'use client';

import { useEffect, useState } from'react';
import { Megaphone, X } from'lucide-react';
import { useTranslation } from'react-i18next';
import { RMHarkContent } from'./RMHarkContent';
import { GifEmbed } from'./GifEmbed';
import { PostImageGrid } from'./PostImageGrid';
import { PollDisplay } from'./PollDisplay';
import { useIdleReady } from'@/hooks/useIdleReady';
import type { FeedPoll } from'@/lib/feed-types';
import { AsyncReveal } from'@/components/motion';
import { useStableListMotion } from'@/hooks/useStableListMotion';

interface Announcement {
 id: string;
 title: string;
 body: string;
 linkUrl: string | null;
 linkLabel: string | null;
 variant: string;
 createdAt: string;
 imageUrls?: string[];
 gifUrl?: string | null;
 poll?: FeedPoll | null;
}

const VARIANT_STYLES: Record<string, string> = {
 info:'border-site-accent/40 bg-site-accent-dim',
 success:'border-site-success/40 bg-site-success/10',
 warning:'border-site-warning/40 bg-site-warning/10',
 event:'border-site-accent/40 bg-site-accent/10',
};

const DISMISS_KEY ='rmh-dismissed-announcements';

function readDismissed(): string[] {
 try {
 return JSON.parse(localStorage.getItem(DISMISS_KEY) ||'[]');
 } catch {
 return [];
 }
}

/** Admin-authored announcement banners, pinned at the top of the feed. */
export function FeedAnnouncements() {
 const { t } = useTranslation('feed');
 const idle = useIdleReady();
 const [items, setItems] = useState<Announcement[]>([]);
 const [dismissed, setDismissed] = useState<string[]>([]);

 // Read dismissed ids immediately (cheap, needed for render); defer the network
 // fetch until the browser is idle so it doesn't compete during hydration.
 useEffect(() => {
 setDismissed(readDismissed());
 }, []);

 useEffect(() => {
 if (!idle) return;
 fetch('/api/announcements')
 .then((r) => (r.ok ? r.json() : { announcements: [] }))
 .then((d) => setItems(d.announcements ?? []))
 .catch(() => {});
 }, [idle]);

 const dismiss = (id: string) => {
 const next = [...new Set([...dismissed, id])];
 setDismissed(next);
 try {
 localStorage.setItem(DISMISS_KEY, JSON.stringify(next.slice(-50)));
 } catch {
 // ignore
 }
 };

 const updatePoll = (id: string, poll: FeedPoll) => {
 setItems((prev) => prev.map((a) => (a.id === id ? { ...a, poll } : a)));
 };

 const visible = items.filter((a) => !dismissed.includes(a.id));
 const enteringItems = useStableListMotion(
 visible.map((announcement) => announcement.id),
 { skipFirstAddition: true },
 );

 return (
 <AsyncReveal show={visible.length > 0} className="flex flex-col gap-2 px-3 pt-3 pb-4">
 {visible.map((a) => (
 <div
 key={a.id}
 // Floating announcement slab (§8.3): L2 bg-site-surface border border-site-border rounded-2xl shadow-xs carries the border +
 // ring glint; the variant utilities tint it and set the accent rim.
 className={`relative bg-site-surface border border-site-border rounded-2xl shadow-xs rounded-site p-3 pr-9 ${VARIANT_STYLES[a.variant] ?? VARIANT_STYLES.info} ${enteringItems.has(a.id) ?'content-item-enter':''}`}
 >
 <button
 onClick={() => dismiss(a.id)}
 aria-label={t('dismiss-announcement', { defaultValue:'Dismiss announcement'})}
 className="absolute right-2 top-2 rounded-site-sm p-1 text-site-text-muted hover:bg-site-surface-hover hover:text-site-text"
 >
 <X className="h-4 w-4"/>
 </button>
 <div className="flex items-start gap-2">
 <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-site-accent"/>
 <div className="min-w-0 flex-1">
 <p className="text-sm font-semibold text-site-text">{a.title}</p>
 <RMHarkContent
 text={a.body}
 className="mt-0.5 whitespace-pre-line text-sm text-site-text-muted"
 />

 {/* Uploaded images */}
 {a.imageUrls && a.imageUrls.length > 0 && (
 <PostImageGrid urls={a.imageUrls} className="mt-2"/>
 )}

 {/* GIF / linked image */}
 {a.gifUrl && <GifEmbed url={a.gifUrl} className="mt-2"/>}

 {/* Poll */}
 {a.poll && (
 <PollDisplay
 poll={a.poll}
 postId={a.id}
 voteUrl={`/api/announcements/${a.id}/vote`}
 onUpdate={(poll) => updatePoll(a.id, poll)}
 />
 )}

 {a.linkUrl && (
 <a
 href={a.linkUrl}
 className="mt-1 inline-block text-sm font-medium text-site-accent hover:underline"
 target={a.linkUrl.startsWith('http') ?'_blank': undefined}
 rel="noreferrer"
 >
 {a.linkLabel || t('learn-more', { defaultValue:'Learn more'})} →
 </a>
 )}
 </div>
 </div>
 </div>
 ))}
 </AsyncReveal>
 );
}
