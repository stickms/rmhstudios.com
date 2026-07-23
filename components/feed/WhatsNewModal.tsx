'use client';

import { useEffect, useState } from'react';
import { useTranslation } from'react-i18next';
import { Link } from'@tanstack/react-router';
import {
 Sparkles,
 Layers,
 Zap,
 CheckCircle2,
 Maximize2,
 Compass,
} from'lucide-react';
import { useSession } from'@/components/Providers';
import { Button } from'@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from'@/components/ui/dialog';

// Bumped storage key for IPO Edition Ultra Minimalist Website Redesign reveal.
const STORAGE_KEY ='rmh-whatsnew-ipo-v1';
const WELCOME_KEY ='rmh-welcome-seen-v1';

const IPO_FEATURES = [
 {
 step:'01',
 icon: Sparkles,
 titleKey:'ipo-feat-minimalism-title',
 titleDefault:'Ultra Minimalist Aesthetics',
 bodyKey:'ipo-feat-minimalism-body',
 bodyDefault:'Monochromatic palette, warm canvas tones, and clean organic arch geometry designed for focus.',
 to:'/feed',
 },
 {
 step:'02',
 icon: Layers,
 titleKey:'ipo-feat-typography-title',
 titleDefault:'Editorial Typography',
 bodyKey:'ipo-feat-typography-body',
 bodyDefault:'High-contrast serif headings paired with clean geometric body text inspired by classic print.',
 to:'/library',
 },
 {
 step:'03',
 icon: Compass,
 titleKey:'ipo-feat-parallax-title',
 titleDefault:'Parallax & Dynamic Motion',
 bodyKey:'ipo-feat-parallax-body',
 bodyDefault:'Multi-layer scroll parallax and pointer-reactive depth that moves gracefully as you navigate.',
 to:'/explore',
 },
 {
 step:'04',
 icon: Zap,
 titleKey:'ipo-feat-speed-title',
 titleDefault:'Refactored Core Engine',
 bodyKey:'ipo-feat-speed-body',
 bodyDefault:'Zero-clutter architecture rebuilt for ultimate responsiveness, accessibility, and high performance.',
 to:'/settings',
 },
];

/**
 * High-impact"What's New: IPO Edition"modal explaining the ultra minimalist
 * UI redesign and refactor.
 */
export function WhatsNewModal() {
 const { t } = useTranslation('feed');
 const { data: session, isPending } = useSession();
 const [open, setOpen] = useState(false);

 useEffect(() => {
 if (isPending || !session) return;
 try {
 const seenThis = localStorage.getItem(STORAGE_KEY);
 const seenWelcome = localStorage.getItem(WELCOME_KEY);
 // Auto-trigger for signed in users who haven't seen the IPO Redesign announcement
 if (!seenThis || seenWelcome) {
 setOpen(true);
 }
 } catch {
 // ignore storage errors
 }
 }, [session, isPending]);

 const dismiss = () => {
 try {
 localStorage.setItem(STORAGE_KEY,'1');
 } catch {
 // ignore
 }
 setOpen(false);
 };

 return (
 <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
 <DialogContent className="max-w-xl p-0 gap-0 flex flex-col max-h-[85dvh] overflow-hidden rounded-[2rem] border border-site-border bg-site-surface shadow-site">
 <div className="px-8 pt-8 text-center relative bg-site-bg-subtle pb-6 border-b border-site-border/60">
 <div className="mb-4 inline-flex items-center justify-center h-12 w-12 rounded-full bg-site-text text-site-bg shadow-sm font-mono text-sm font-bold mx-auto">
 IPO
 </div>
 <DialogTitle className="text-2xl sm:text-3xl font-serif font-bold text-site-text tracking-tight">
 {t("whatsnew-ipo-title", { defaultValue:"Minimalism Redefined"})}
 </DialogTitle>
 <p className="mx-auto mt-2 max-w-sm text-sm text-site-text-muted">
 {t("whatsnew-ipo-subtitle", { defaultValue:"Ultra-minimalist UI. Crafted for clarity and speed."})}
 </p>
 </div>

 <div className="mt-4 flex-1 space-y-3 overflow-y-auto px-6 sm:px-8 py-2">
 {IPO_FEATURES.map((f) => {
 const Icon = f.icon;
 const inner = (
 <div className="flex items-start gap-4 rounded-2xl border border-site-border bg-site-surface p-4 transition-all duration-300 hover:border-site-text/40 hover:-translate-y-0.5 shadow-sm">
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-site-accent/10 text-site-text font-mono text-xs font-bold">
 {f.step}
 </div>
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-2">
 <p className="text-sm font-semibold text-site-text">{t(f.titleKey, { defaultValue: f.titleDefault })}</p>
 <Icon className="h-3.5 w-3.5 text-site-text-muted ml-auto"/>
 </div>
 <p className="mt-1 text-xs leading-relaxed text-site-text-muted">{t(f.bodyKey, { defaultValue: f.bodyDefault })}</p>
 </div>
 </div>
 );
 return f.to ? (
 <Link key={f.titleKey} to={f.to as string} onClick={dismiss} className="block">
 {inner}
 </Link>
 ) : (
 <div key={f.titleKey}>{inner}</div>
 );
 })}
 </div>

 <div className="flex items-center justify-between border-t border-site-border px-8 py-4 bg-site-bg-subtle">
 <span className="text-xs font-mono uppercase tracking-widest text-site-text-muted flex items-center gap-1.5">
 <CheckCircle2 className="h-4 w-4 text-site-text"/> RMH Studios IPO Release
 </span>
 <Button variant="accent"size="default"onClick={dismiss} className="rounded-full px-6">
 {t("explore-new-ui", { defaultValue:"Explore New UI"})}
 </Button>
 </div>
 </DialogContent>
 </Dialog>
 );
}
