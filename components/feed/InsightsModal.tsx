import { useEffect, useState } from'react';
import { useTranslation } from'react-i18next';
import { Eye, Heart, MessageCircle, Repeat, Bookmark, TrendingUp, Unlock } from'lucide-react';
import { Spinner } from'@/components/ui/spinner';
import { Dialog, DialogContent, DialogTitle } from'@/components/ui/dialog';
import { CoinIcon } from'@/components/rmhcoins/CoinIcon';
import { postInsightsApi } from '@/lib/feed/rmhark-actions.contract';
import { api } from '@/lib/contract/client';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

interface Insights {
 createdAt: string;
 views: number;
 likes: number;
 comments: number;
 reposts: number;
 bookmarks: number;
 engagementRate: number;
 isPaid: boolean;
 unlockPrice: number | null;
 unlocks: number;
 coinsEarned: number;
 likeTrend: { date: string; count: number }[];
}

interface InsightsModalProps {
 open: boolean;
 onClose: () => void;
 postId: string;
}

const fmt = (n: number) => n.toLocaleString();

export function InsightsModal({ open, onClose, postId }: InsightsModalProps) {
 const { t } = useTranslation('feed');
 const [data, setData] = useState<Insights | null>(null);
 // Mounted open: loading from the first render, so "Could not load" never flashes before the fetch starts.
 const [loading, setLoading] = useState(open);
 // Steel M9: the numbers (or the error) replace the spinner.
 const arrival = useArrival(!loading);

 useEffect(() => {
 if (!open) return;
 setLoading(true);
 setData(null);
 api(postInsightsApi, { params: { id: postId } })
 .then(setData)
 .catch(() => setData(null))
 .catch(console.error)
 .finally(() => setLoading(false));
 }, [open, postId]);

 const stats = data
 ? [
 { label: t('impressions', { defaultValue:'Impressions'}), value: data.views, icon: Eye },
 { label: t('likes', { defaultValue:'Likes'}), value: data.likes, icon: Heart },
 { label: t('comments', { defaultValue:'Comments'}), value: data.comments, icon: MessageCircle },
 { label: t('reposts', { defaultValue:'Reposts'}), value: data.reposts, icon: Repeat },
 { label: t('bookmarks', { defaultValue:'Bookmarks'}), value: data.bookmarks, icon: Bookmark },
 ]
 : [];

 const maxTrend = data ? Math.max(1, ...data.likeTrend.map((d) => d.count)) : 1;

 return (
 <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
 <DialogContent className="max-w-md p-0 gap-0 flex flex-col max-h-[80dvh] overflow-hidden">
 <div className="flex shrink-0 items-center justify-between border-b border-site-border px-5 py-4">
 <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-site-text">
 <TrendingUp className="h-5 w-5 text-site-accent"/>
 {t('post-insights', { defaultValue:'Post insights'})}
 </DialogTitle>
 </div>

 <div className="flex-1 overflow-y-auto p-5">
 {loading && (
 <div className="flex justify-center py-12">
 <Spinner />
 </div>
 )}

 {!loading && !data && (
 <p className={cn('py-12 text-center text-sm text-site-text-muted', arrival)}>{t('could-not-load-insights', { defaultValue:'Could not load insights.'})}</p>
 )}

 {data && (
 <div className={arrival}>
 <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
 {stats.map((s) => (
 <div key={s.label} className="rounded-site p-4">
 <s.icon className="h-4 w-4 text-site-text-muted"/>
 <p className="mt-1 text-lg font-semibold text-site-text">{fmt(s.value)}</p>
 <p className="text-xs text-site-text-muted">{s.label}</p>
 </div>
 ))}
 <div className="rounded-site p-4">
 <TrendingUp className="h-4 w-4 text-site-text-muted"/>
 <p className="mt-1 text-lg font-semibold text-site-text">
 {(data.engagementRate * 100).toFixed(1)}%
 </p>
 <p className="text-xs text-site-text-muted">{t('engagement-rate', { defaultValue:'Engagement rate'})}</p>
 </div>
 </div>

 {data.isPaid && (
 <div className="mt-3 flex items-center justify-between rounded-site p-4">
 <div className="flex items-center gap-2">
 <Unlock className="h-4 w-4 text-site-accent"/>
 <div>
 <p className="text-sm font-semibold text-site-text">{t('unlocks-count', { count: fmt(data.unlocks), defaultValue:'{{count}} unlocks'})}</p>
 <p className="text-xs text-site-text-muted">{t('unlock-price-each', { price: data.unlockPrice, defaultValue:'at {{price}} each'})}</p>
 </div>
 </div>
 <span className="inline-flex items-center gap-1 text-sm font-semibold text-site-text">
 <CoinIcon className="h-4 w-4"/> {fmt(data.coinsEarned)}
 </span>
 </div>
 )}

 <div className="mt-4">
 <p className="mb-2 site-section-label">
 {t('likes-last-7-days', { defaultValue:'Likes · last 7 days'})}
 </p>
 <div className="flex h-24 items-end gap-1.5">
 {data.likeTrend.map((d) => (
 <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
 <div className="flex w-full flex-1 items-end">
 {/* `scaleY` from the baseline rather than `height` — a column chart animating
 height relayouts the whole row of bars each frame. */}
 <div
 className="w-full origin-bottom rounded-t bg-site-accent/70 transition-transform duration-site-slow"
 style={{
 height: '100%',
 transform: `scaleY(${maxTrend > 0 ? d.count / maxTrend : 0})`,
 minHeight: d.count > 0 ? 4 : 0,
 }}
 title={t('bar-likes-count', { count: d.count, defaultValue:'{{count}} likes'})}
 />
 </div>
 <span className="text-tiny text-site-text-muted">
 {new Date(d.date).toLocaleDateString(undefined, { weekday:'narrow'})}
 </span>
 </div>
 ))}
 </div>
 </div>

 <p className="mt-4 text-center text-xs text-site-text-muted">
 {t('posted-date', { date: new Date(data.createdAt).toLocaleString(), defaultValue:'Posted {{date}}'})}
 </p>
 </div>
 )}
 </div>
 </DialogContent>
 </Dialog>
 );
}
