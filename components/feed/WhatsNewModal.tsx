'use client';

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Sparkles,
  Zap,
  Shield,
  Swords,
  Bot,
  Users,
  Clapperboard,
  Music,
  BookOpen,
  Store,
  X,
} from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';

// Bump this key when the next big update ships to show the modal again.
const STORAGE_KEY = 'rmh-whatsnew-seen-v2';
// Existing users have already seen onboarding; this is the welcome key the
// WelcomeModal sets. We only show "What's new" to people who got past it, so a
// brand-new user never sees both at once.
const WELCOME_KEY = 'rmh-welcome-seen-v1';

interface Feature {
  icon: typeof Sparkles;
  title: string;
  body: string;
  to?: string;
}

const FEATURES: Feature[] = [
  { icon: Zap, title: 'Progression & rewards', body: 'Earn XP, level up, complete daily/weekly quests, climb the battle pass, spin the daily wheel, and stake coins.', to: '/progress' },
  { icon: Shield, title: 'Clans', body: 'Form a team — your XP fuels the clan leaderboard.', to: '/clans' },
  { icon: Swords, title: 'Ranked play', body: 'ELO ratings and challenge ladders across our games.', to: '/ranked' },
  { icon: Bot, title: 'AI personas', body: 'Create and chat with custom AI characters.', to: '/personas' },
  { icon: Users, title: 'Group chats', body: 'Message multiple friends in real time.', to: '/groups' },
  { icon: BookOpen, title: 'Flashcards + AI tutor', body: 'Study with spaced repetition and AI-generated cards.', to: '/study' },
  { icon: Clapperboard, title: 'Clips', body: 'Save and share timestamped video moments.', to: '/clips' },
  { icon: Music, title: 'Guess the Song', body: 'Create and solve music puzzles for coins.', to: '/music-trivia' },
  { icon: Store, title: 'Creator economy', body: 'Storefronts, the build marketplace, gift memberships, and more.', to: '/shop' },
];

/**
 * One-time "what's new" announcement for the big features update. Shown once to
 * signed-in users who've already completed first-run onboarding (so new users
 * aren't shown both this and the welcome modal). Tracked in localStorage; bump
 * STORAGE_KEY for the next major update.
 */
export function WhatsNewModal() {
  const { data: session, isPending } = useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isPending || !session) return;
    try {
      const seenThis = localStorage.getItem(STORAGE_KEY);
      const seenWelcome = localStorage.getItem(WELCOME_KEY);
      // Only existing users (past onboarding) who haven't seen this update.
      if (!seenThis && seenWelcome) setOpen(true);
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

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whatsnew-title"
    >
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-site-border bg-site-surface shadow-2xl">
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md p-1 text-site-text-muted hover:bg-site-surface-hover hover:text-site-text"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-6 pt-6 text-center">
          <div className="mb-3 flex justify-center">
            <div className="rounded-2xl border border-site-accent/30 bg-site-accent-dim p-3">
              <Sparkles className="h-7 w-7 text-site-accent" />
            </div>
          </div>
          <h2 id="whatsnew-title" className="text-xl font-bold text-site-text">
            A big update just landed
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-site-text-muted">
            We shipped a wave of new features. Here’s a quick tour — tap any to jump in.
          </p>
        </div>

        <div className="mt-4 flex-1 space-y-2 overflow-y-auto px-6 pb-2">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            const inner = (
              <div className="flex items-start gap-3 rounded-xl border border-site-border bg-site-bg p-3 transition-colors hover:border-site-accent/60">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-site-accent/12 text-site-accent">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-site-text">{f.title}</p>
                  <p className="text-xs text-site-text-muted">{f.body}</p>
                </div>
              </div>
            );
            return f.to ? (
              <Link key={f.title} to={f.to as string} onClick={dismiss} className="block">
                {inner}
              </Link>
            ) : (
              <div key={f.title}>{inner}</div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 border-t border-site-border px-6 py-4">
          <Button variant="accent" size="sm" onClick={dismiss}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
