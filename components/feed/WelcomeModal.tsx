'use client';

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Sparkles, Gamepad2, Search, UserCircle, X } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'rmh-welcome-seen-v1';

const STEPS = [
  { icon: Sparkles, title: 'Welcome to RMH Studios', body: 'Games, apps, and a social feed — all in one place. Here are a few things to try.' },
  { icon: Gamepad2, title: 'Play something', body: 'Jump into RMHBox party games, daily puzzles, or any of our original titles — right in your browser.', to: '/games', cta: 'Browse games' },
  { icon: Search, title: 'Find your people', body: 'Search posts, builds, and people, then follow creators to fill your feed.', to: '/search', cta: 'Open search' },
  { icon: UserCircle, title: 'Make it yours', body: 'Set a display name, avatar, and bio so others can recognise you.', to: '/profile', cta: 'Edit profile' },
];

/**
 * First-run onboarding. Shown once to signed-in users who haven't seen it
 * (tracked in localStorage). Design-system styled; respects the dialog feel of
 * the rest of the app without depending on any route data.
 */
export function WelcomeModal() {
  const { data: session, isPending } = useSession();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (isPending || !session) return;
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      // ignore storage errors (private mode, etc.)
    }
  }, [session, isPending]);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // ignore
    }
    setOpen(false);
  };

  if (!open) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-site-border bg-site-surface p-6 shadow-2xl">
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md p-1 text-site-text-muted hover:bg-site-surface-hover hover:text-site-text"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-4 flex justify-center">
          <div className="rounded-2xl border border-site-accent/30 bg-site-accent-dim p-3">
            <Icon className="h-7 w-7 text-site-accent" />
          </div>
        </div>

        <h2 id="welcome-title" className="text-center text-xl font-bold text-site-text">
          {current.title}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-center text-sm text-site-text-muted">{current.body}</p>

        {/* Step dots */}
        <div className="mt-5 flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-site-accent' : 'w-1.5 bg-site-border'}`}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Skip
          </Button>
          <div className="flex items-center gap-2">
            {current.to && (
              <Link to={current.to as string} onClick={dismiss}>
                <Button variant="accent-outline" size="sm">
                  {current.cta}
                </Button>
              </Link>
            )}
            <Button
              variant="accent"
              size="sm"
              onClick={() => (isLast ? dismiss() : setStep((s) => s + 1))}
            >
              {isLast ? 'Get started' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
