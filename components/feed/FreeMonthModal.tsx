'use client';

import { useEffect, useState } from 'react';
import { Gift, Check, Loader2, X, Sparkles } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';

const COOLDOWN_KEY = 'rmh-freemonth-snooze';
const COOLDOWN_MS = 4 * 24 * 60 * 60 * 1000; // re-offer roughly every few days
// Sequence behind first-run onboarding + the "what's new" modal so they never
// stack on screen at once.
const WELCOME_KEY = 'rmh-welcome-seen-v1';
const WHATSNEW_KEY = 'rmh-whatsnew-seen-v2';

/**
 * Occasionally offers eligible (free-tier, never-claimed) users a free month of
 * Pro. Eligibility is authoritative server-side; this component only decides
 * when to surface the offer (gated by a localStorage snooze so it appears
 * occasionally rather than on every visit).
 */
export function FreeMonthModal() {
  const { data: session, isPending } = useSession();
  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    if (isPending || !session) return;
    let cancelled = false;
    (async () => {
      try {
        if (!localStorage.getItem(WELCOME_KEY) || !localStorage.getItem(WHATSNEW_KEY)) return;
        const snooze = Number(localStorage.getItem(COOLDOWN_KEY) || '0');
        if (snooze && Date.now() < snooze) return;

        const res = await fetch('/api/promo/free-month', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.eligible) setOpen(true);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, isPending]);

  const snooze = () => {
    try {
      localStorage.setItem(COOLDOWN_KEY, String(Date.now() + COOLDOWN_MS));
    } catch {
      // ignore
    }
    setOpen(false);
  };

  const claim = async () => {
    setClaiming(true);
    try {
      const res = await fetch('/api/promo/free-month', { method: 'POST', credentials: 'include' });
      if (res.ok) {
        setClaimed(true);
        try {
          // Never offer again once claimed.
          localStorage.setItem(COOLDOWN_KEY, String(Date.now() + 365 * 24 * 60 * 60 * 1000));
        } catch {
          // ignore
        }
      } else {
        snooze();
      }
    } finally {
      setClaiming(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[88] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="freemonth-title"
    >
      <div className="relative w-full max-w-sm rounded-2xl border border-site-border bg-site-surface p-6 text-center shadow-2xl">
        <button onClick={snooze} aria-label="Close" className="absolute right-3 top-3 rounded-md p-1 text-site-text-muted hover:bg-site-surface-hover hover:text-site-text">
          <X className="h-4 w-4" />
        </button>

        <div className="mb-3 flex justify-center">
          <div className="rounded-2xl border border-site-accent/30 bg-site-accent-dim p-3">
            {claimed ? <Check className="h-7 w-7 text-emerald-400" /> : <Gift className="h-7 w-7 text-site-accent" />}
          </div>
        </div>

        {claimed ? (
          <>
            <h2 id="freemonth-title" className="text-xl font-bold text-site-text">You’re on Pro! 🎉</h2>
            <p className="mx-auto mt-2 max-w-xs text-sm text-site-text-muted">
              Your free month of Pro is active. Enjoy the perks — including the developer API.
            </p>
            <Button variant="accent" className="mt-5 w-full" onClick={() => setOpen(false)}>
              Let’s go
            </Button>
          </>
        ) : (
          <>
            <h2 id="freemonth-title" className="inline-flex items-center gap-1.5 text-xl font-bold text-site-text">
              <Sparkles className="h-5 w-5 text-site-accent" /> A month of Pro, on us
            </h2>
            <p className="mx-auto mt-2 max-w-xs text-sm text-site-text-muted">
              Try RMH Pro free for one month — no payment, no card. Unlock the developer API, the profile badge, and more.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Button variant="accent" disabled={claiming} onClick={claim} className="w-full gap-1.5">
                {claiming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
                Claim free month
              </Button>
              <Button variant="ghost" size="sm" onClick={snooze} className="w-full text-site-text-muted">
                Maybe later
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
