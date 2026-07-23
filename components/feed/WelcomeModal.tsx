'use client';

import { useEffect, useState } from'react';
import { Link } from'@tanstack/react-router';
import { Sparkles, Gamepad2, Search, UserCircle } from'lucide-react';
import { useSession } from'@/components/Providers';
import { Button } from'@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from'@/components/ui/dialog';
import { useTranslation } from'react-i18next';

const STORAGE_KEY ='rmh-welcome-seen-v1';
// Set once the first-run language chooser has been dismissed (see
// LanguageFirstRunModal). We wait for it so the two modals don't stack.
const LANG_PICKED_KEY ='rmh-lang-picked-v1';
const LANG_PICKED_EVENT ='rmh:lang-picked';

const STEP_ICONS = [Sparkles, Gamepad2, Search, UserCircle];
const STEP_TOS = [undefined,'/games','/search','/profile'];

/**
 * First-run onboarding. Shown once to signed-in users who haven't seen it
 * (tracked in localStorage). Design-system styled; respects the dialog feel of
 * the rest of the app without depending on any route data.
 */
export function WelcomeModal() {
 const { t } = useTranslation('feed');
 const { data: session, isPending } = useSession();
 const [open, setOpen] = useState(false);
 const [step, setStep] = useState(0);

 const STEPS = [
 { icon: STEP_ICONS[0], title: t('welcome-title', { defaultValue:'Welcome to RMH Studios'}), body: t('welcome-body', { defaultValue:'Games, apps, and a social feed — all in one place. Here are a few things to try.'}), to: STEP_TOS[0] },
 { icon: STEP_ICONS[1], title: t('play-title', { defaultValue:'Play something'}), body: t('play-body', { defaultValue:'Jump into RMHBox party games, daily puzzles, or any of our original titles — right in your browser.'}), to: STEP_TOS[1], cta: t('play-cta', { defaultValue:'Browse games'}) },
 { icon: STEP_ICONS[2], title: t('search-title', { defaultValue:'Find your people'}), body: t('search-body', { defaultValue:'Search posts, builds, and people, then follow creators to fill your feed.'}), to: STEP_TOS[2], cta: t('search-cta', { defaultValue:'Open search'}) },
 { icon: STEP_ICONS[3], title: t('profile-title', { defaultValue:'Make it yours'}), body: t('profile-body', { defaultValue:'Set a display name, avatar, and bio so others can recognise you.'}), to: STEP_TOS[3], cta: t('profile-cta', { defaultValue:'Edit profile'}) },
 ];

 useEffect(() => {
 if (isPending || !session) return;
 const check = () => {
 try {
 // Hold until the first-run language chooser is done so we don't stack
 // two dialogs; it fires `rmh:lang-picked`when dismissed.
 if (!localStorage.getItem(STORAGE_KEY) && localStorage.getItem(LANG_PICKED_KEY)) {
 setOpen(true);
 }
 } catch {
 // ignore storage errors (private mode, etc.)
 }
 };
 check();
 window.addEventListener(LANG_PICKED_EVENT, check);
 return () => window.removeEventListener(LANG_PICKED_EVENT, check);
 }, [session, isPending]);

 const dismiss = () => {
 try {
 localStorage.setItem(STORAGE_KEY,'1');
 } catch {
 // ignore
 }
 setOpen(false);
 };

 const current = STEPS[step];
 const Icon = current.icon;
 const isLast = step === STEPS.length - 1;

 return (
 <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
 <DialogContent className="max-w-md gap-0">
 <div className="mb-4 flex justify-center">
 <div className="rounded-site border border-site-accent/30 bg-site-accent-dim p-3">
 <Icon className="h-7 w-7 text-site-accent"/>
 </div>
 </div>

 <DialogTitle className="text-center text-xl font-bold text-site-text">
 {current.title}
 </DialogTitle>
 <p className="mx-auto mt-2 max-w-sm text-center text-sm text-site-text-muted">{current.body}</p>

 {/* Step dots */}
 <div className="mt-5 flex justify-center gap-1.5">
 {STEPS.map((_, i) => (
 <span
 key={i}
 className={`h-1.5 rounded-full transition-all ${i === step ?'w-5 bg-site-accent':'w-1.5 bg-site-border'}`}
 />
 ))}
 </div>

 <div className="mt-6 flex items-center justify-between gap-3">
 <Button variant="ghost"size="sm"onClick={dismiss}>
 {t('skip', { defaultValue:'Skip'})}
 </Button>
 <div className="flex items-center gap-2">
 {current.to && (
 <Link to={current.to as string} onClick={dismiss}>
 <Button variant="accent-outline"size="sm">
 {current.cta}
 </Button>
 </Link>
 )}
 <Button
 variant="accent"
 size="sm"
 onClick={() => (isLast ? dismiss() : setStep((s) => s + 1))}
 >
 {isLast ? t('get-started', { defaultValue:'Get started'}) : t('next', { defaultValue:'Next'})}
 </Button>
 </div>
 </div>
 </DialogContent>
 </Dialog>
 );
}
