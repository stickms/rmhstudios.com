'use client';

import { useEffect, useState } from 'react';
import { Gift, Check, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

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
  const { t } = useTranslation("feed");
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

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) snooze(); }}>
      <DialogContent className="max-w-sm gap-0 text-center">
        <div className="mb-3 flex justify-center">
          <div className="rounded-site border border-site-accent/30 bg-site-accent-dim p-3">
            {claimed ? <Check className="h-7 w-7 text-site-success" /> : <Gift className="h-7 w-7 text-site-accent" />}
          </div>
        </div>

        {claimed ? (
          <>
            <DialogTitle className="text-xl font-bold text-site-text">{t("claimed-title", { defaultValue: "You’re on Pro! 🎉" })}</DialogTitle>
            <p className="mx-auto mt-2 max-w-xs text-sm text-site-text-muted">
              {t("claimed-body", { defaultValue: "Your free month of Pro is active. Enjoy the perks — including the developer API." })}
            </p>
            <Button variant="accent" className="mt-5 w-full" onClick={() => setOpen(false)}>
              {t("lets-go", { defaultValue: "Let’s go" })}
            </Button>
          </>
        ) : (
          <>
            <DialogTitle className="inline-flex items-center gap-1.5 text-xl font-bold text-site-text">
              <Sparkles className="h-5 w-5 text-site-accent" /> {t("offer-title", { defaultValue: "A month of Pro, on us" })}
            </DialogTitle>
            <p className="mx-auto mt-2 max-w-xs text-sm text-site-text-muted">
              {t("offer-body", { defaultValue: "Try RMH Pro free for one month — no payment, no card. Unlock the developer API, the profile badge, and more." })}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Button variant="accent" loading={claiming} onClick={claim} className="w-full gap-1.5">
                {!claiming && <Gift className="h-4 w-4" />}
                {t("claim-free-month", { defaultValue: "Claim free month" })}
              </Button>
              <Button variant="ghost" size="sm" onClick={snooze} className="w-full text-site-text-muted">
                {t("maybe-later", { defaultValue: "Maybe later" })}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
