'use client';

import { useState } from'react';
import { Wand2, Loader2, Sparkles, Lock } from'lucide-react';
import { useTranslation } from'react-i18next';
import { Link } from'@tanstack/react-router';
import { Button } from'@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from'@/components/ui/dialog';

interface AIImageButtonProps {
 /** Current composer text — used to theme the generated image. */
 draft: string;
 /** Receives the generated image URL so the composer can append it. */
 onGenerated: (url: string) => void;
 /** Disable (e.g. when the image slots are full). */
 disabled?: boolean;
 /**
 * Render the button greyed out and, on click, surface an upgrade prompt
 * instead of generating. Used when the user's tier can't access the feature.
 */
 locked?: boolean;
 title?: string;
}

/**
 * A wand button that asks xAI to generate an image for the post and hands the
 * resulting feed URL back to the composer. HARD-R+ only — the composer passes
 * `locked`for lower tiers so they see the feature (greyed out) and an upgrade
 * nudge; the server re-checks the tier regardless.
 */
export function AIImageButton({
 draft,
 onGenerated,
 disabled = false,
 locked = false,
 title,
}: AIImageButtonProps) {
 const { t } = useTranslation('feed');
 const resolvedTitle = locked
 ? t('ai-image-locked-title', { defaultValue:'Generate images with AI — upgrade to unlock'})
 : title ?? t('ai-image-generate', { defaultValue:'Generate an image with AI'});
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [showUpgrade, setShowUpgrade] = useState(false);

 const handleClick = async () => {
 if (locked) {
 setShowUpgrade(true);
 return;
 }
 if (loading || disabled) return;
 setLoading(true);
 setError(null);
 try {
 const res = await fetch('/api/rmharks/ai-image', {
 method:'POST',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({ draft }),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok) {
 setError(data?.error || t('ai-image-failed', { defaultValue:'Failed to generate image'}));
 return;
 }
 if (typeof data?.url ==='string'&& data.url) {
 onGenerated(data.url);
 }
 } catch {
 setError(t('ai-image-failed', { defaultValue:'Failed to generate image'}));
 } finally {
 setLoading(false);
 }
 };

 return (
 <>
 <button
 type="button"
 onClick={handleClick}
 // When locked the button stays clickable (to open the upgrade modal),
 // so we only honour `disabled`for the unlocked, generate path.
 disabled={!locked && (loading || disabled)}
 title={error || resolvedTitle}
 aria-label={resolvedTitle}
 className={`relative p-1.5 rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
 locked
 ?'text-site-text-dim/50 hover:text-site-text-dim hover:bg-site-surface-hover'
 : error
 ?'text-site-danger hover:bg-site-danger/10'
 :'text-site-text-dim hover:text-site-accent hover:bg-site-accent/10'
 }`}
 >
 {loading ? (
 <Loader2 className="w-4.5 h-4.5 animate-spin"/>
 ) : (
 <Wand2 className="w-4.5 h-4.5"/>
 )}
 {locked && (
 <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-site-surface p-0.5 ring-1 ring-site-border">
 <Lock className="h-2.5 w-2.5 text-site-text-muted"/>
 </span>
 )}
 </button>

 {locked && showUpgrade && (
 <Dialog open onOpenChange={(o) => !o && setShowUpgrade(false)}>
 <DialogContent className="w-full max-w-sm gap-0 p-0 text-center sm:p-0">
{/* Decorative gradient header */}
 <div className="relative bg-linear-to-br from-site-accent/30 via-site-accent/10 to-transparent px-6 pb-6 pt-8">
  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-site border border-site-accent/30 bg-site-accent-dim">
 <Wand2 className="h-7 w-7 text-site-accent"/>
 </div>
 </div>

 <div className="px-6 pb-6">
 <DialogTitle className="inline-flex items-center gap-2 text-xl font-bold text-site-text">
 <Sparkles className="h-5 w-5 text-site-accent"/>
 {t('ai-image-upgrade-title', { defaultValue:'Unlock AI image generation'})}
 </DialogTitle>
 <DialogDescription className="mx-auto mt-2 max-w-xs">
 {t('ai-image-upgrade-body', {
 defaultValue:
'Turn your posts into eye-catching art. Generate custom AI images straight from the composer — available on HARD-R and above.',
 })}
 </DialogDescription>
 <div className="mt-6 flex flex-col gap-2">
 <Link
              to="/store"
              search={{ tab: 'membership' }}
              onClick={() => setShowUpgrade(false)}
            >
 <Button variant="accent"className="w-full">
 <Sparkles className="h-4 w-4"/>
 {t('ai-image-upgrade-cta', { defaultValue:'Upgrade to unlock'})}
 </Button>
 </Link>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => setShowUpgrade(false)}
 className="w-full text-site-text-muted"
 >
 {t('maybe-later', { defaultValue:'Maybe later'})}
 </Button>
 </div>
 </div>
 </DialogContent>
 </Dialog>
 )}
 </>
 );
}
