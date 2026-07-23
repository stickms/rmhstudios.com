'use client';

import { useState } from'react';
import { Lock, Loader2 } from'lucide-react';
import { Button } from'@/components/ui/button';
import { CoinIcon } from'@/components/rmhcoins/CoinIcon';
import { toast } from'sonner';
import { useTranslation } from'react-i18next';

/** Paywall card shown in place of a locked post's content. */
export function PostLockedCard({
 postId,
 price,
 onUnlocked,
}: {
 postId: string;
 price: number;
 onUnlocked: (content: string) => void;
}) {
 const { t } = useTranslation('feed');
 const [loading, setLoading] = useState(false);

 const unlock = async () => {
 setLoading(true);
 try {
 const res = await fetch(`/api/rmharks/${postId}/unlock`, { method:'POST', credentials:'include'});
 const data = await res.json().catch(() => ({}));
 if (res.ok) {
 onUnlocked(data.content ??'');
 toast.success(t('unlocked', { defaultValue:'Unlocked!'}));
 } else if (res.status === 401) {
 toast.error(t('sign-in-to-unlock', { defaultValue:'Sign in to unlock this post.'}));
 } else {
 toast.error(data.error || t('could-not-unlock', { defaultValue:'Could not unlock'}));
 }
 } finally {
 setLoading(false);
 }
 };

 return (
 <div className="mt-2 flex flex-col items-center gap-2 rounded-site border border-dashed border-site-border bg-site-surface/40 px-4 py-6 text-center">
 <div className="rounded-full border border-site-border bg-site-bg p-2">
 <Lock className="h-5 w-5 text-site-accent"/>
 </div>
 <p className="text-sm font-medium text-site-text">{t('post-locked', { defaultValue:'This post is locked'})}</p>
 <Button
 variant="accent"
 size="sm"
 disabled={loading}
 onClick={(e) => {
 e.stopPropagation();
 unlock();
 }}
 >
 {loading ? (
 <Loader2 className="h-4 w-4 animate-spin"/>
 ) : (
 <span className="inline-flex items-center gap-1">{t('unlock-for', { defaultValue:'Unlock for'})} <CoinIcon className="h-4 w-4"/> {price.toLocaleString()}</span>
 )}
 </Button>
 </div>
 );
}
