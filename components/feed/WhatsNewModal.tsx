'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import {
  Sparkles,
  Zap,
  Swords,
  Bot,
  Users,
  TrendingUp,
  Music,
  BookOpen,
  Store,
  Command,
  Fingerprint,
  BellRing,
  Gift,
  MessageSquareQuote,
  Trophy,
  SlidersHorizontal,
  History,
  ChevronLeft,
  type LucideIcon,
} from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { openCommandPalette } from '@/components/site/CommandPalette';

interface ReleaseFeature {
  icon: LucideIcon;
  titleKey: string;
  titleDefault: string;
  bodyKey: string;
  bodyDefault: string;
  /** Internal route to jump to when clicked. */
  to?: string;
  /** Special client action instead of navigation. */
  action?: 'command-palette';
}

interface Release {
  /** Storage-key suffix. Add a new release at the front with a fresh version
   *  to re-show the modal to everyone. */
  version: string;
  dateKey: string;
  dateDefault: string;
  headlineKey: string;
  headlineDefault: string;
  features: ReleaseFeature[];
}

// Newest first. RELEASES[0] is what the modal shows by default; the rest are
// reachable via the "Version history" view. Bump by prepending a new release.
const RELEASES: Release[] = [
  {
    version: 'v3',
    dateKey: 'release-v3-date',
    dateDefault: 'July 2026',
    headlineKey: 'release-v3-headline',
    headlineDefault: 'A more modern RMH Studios',
    features: [
      { icon: Command, titleKey: 'feat-palette-title', titleDefault: 'Command palette', bodyKey: 'feat-palette-body', bodyDefault: 'Press ⌘K (Ctrl+K) to jump to any page, game, app, theme, or action.', action: 'command-palette' },
      { icon: Fingerprint, titleKey: 'feat-passkey-title', titleDefault: 'Passkey sign-in', bodyKey: 'feat-passkey-body', bodyDefault: 'Sign in without a password using Face ID, Touch ID, Windows Hello, or a security key.', to: '/settings/security' },
      { icon: BellRing, titleKey: 'feat-push-title', titleDefault: 'Push notifications & install', bodyKey: 'feat-push-body', bodyDefault: 'Get notified even when the tab is closed, and install RMH as an app.', to: '/notifications' },
      { icon: Gift, titleKey: 'feat-referral-title', titleDefault: 'Invite friends', bodyKey: 'feat-referral-body', bodyDefault: 'Share your invite link — you both earn coins when they get started.', to: '/wallet' },
      { icon: MessageSquareQuote, titleKey: 'feat-quote-title', titleDefault: 'Quote reposts', bodyKey: 'feat-quote-body', bodyDefault: 'Repost with your own take added on top of the original.', to: '/' },
      { icon: Trophy, titleKey: 'feat-badges-title', titleDefault: 'Achievements on profiles', bodyKey: 'feat-badges-body', bodyDefault: 'Your unlocked badges now show off on your profile.', to: '/achievements' },
      { icon: SlidersHorizontal, titleKey: 'feat-notif-title', titleDefault: 'Notification controls', bodyKey: 'feat-notif-body', bodyDefault: 'Similar alerts are grouped, with per-type on/off switches.', to: '/notifications' },
    ],
  },
  {
    version: 'v2',
    dateKey: 'release-v2-date',
    dateDefault: 'Earlier release',
    headlineKey: 'release-v2-headline',
    headlineDefault: 'Progression, ranked play & creator tools',
    features: [
      { icon: Zap, titleKey: 'feature-progression-title', titleDefault: 'Progression & rewards', bodyKey: 'feature-progression-body', bodyDefault: 'Earn XP, level up, complete daily/weekly quests, climb the battle pass, spin the daily wheel, and stake coins.', to: '/progress' },
      { icon: Swords, titleKey: 'feature-ranked-title', titleDefault: 'Ranked play', bodyKey: 'feature-ranked-body', bodyDefault: 'ELO ratings and challenge ladders across our games.', to: '/ranked' },
      { icon: Bot, titleKey: 'feature-personas-title', titleDefault: 'AI personas', bodyKey: 'feature-personas-body', bodyDefault: 'Create and chat with custom AI characters.', to: '/personas' },
      { icon: Users, titleKey: 'feature-groups-title', titleDefault: 'Group chats', bodyKey: 'feature-groups-body', bodyDefault: 'Message multiple friends in real time.', to: '/groups' },
      { icon: BookOpen, titleKey: 'feature-study-title', titleDefault: 'Flashcards + AI tutor', bodyKey: 'feature-study-body', bodyDefault: 'Study with spaced repetition and AI-generated cards.', to: '/study' },
      { icon: TrendingUp, titleKey: 'feature-predictions-title', titleDefault: 'Prediction markets', bodyKey: 'feature-predictions-body', bodyDefault: 'Create predictions and bet coins on what happens next.', to: '/predictions' },
      { icon: Music, titleKey: 'feature-music-title', titleDefault: 'Guess the Song', bodyKey: 'feature-music-body', bodyDefault: 'Create and solve music puzzles for coins.', to: '/music-trivia' },
      { icon: Store, titleKey: 'feature-creator-title', titleDefault: 'Creator economy', bodyKey: 'feature-creator-body', bodyDefault: 'Storefronts, the build marketplace, gift memberships, and more.', to: '/shop' },
    ],
  },
];

const LATEST = RELEASES[0];
// Bumping the latest release's `version` above re-shows the modal to everyone.
const STORAGE_KEY = `rmh-whatsnew-seen-${LATEST.version}`;
// The welcome key the WelcomeModal sets. We only show "What's new" to people who
// got past onboarding so a brand-new user never sees both at once.
const WELCOME_KEY = 'rmh-welcome-seen-v1';

/**
 * One-time "what's new" announcement for the latest release, with a
 * "Version history" view listing older feature releases. Shown once to
 * signed-in users who've completed first-run onboarding; tracked in
 * localStorage (see STORAGE_KEY).
 */
export function WhatsNewModal() {
  const { t } = useTranslation('feed');
  const { data: session, isPending } = useSession();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'current' | 'history'>('current');

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
    setView('current');
    setOpen(false);
  };

  const renderFeature = (f: ReleaseFeature) => {
    const Icon = f.icon;
    const inner = (
      <div className="flex items-start gap-3 rounded-site border border-site-border bg-site-bg p-3 text-left transition-colors hover:border-site-accent/60">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-site-sm bg-site-accent/12 text-site-accent">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-site-text">{t(f.titleKey, { defaultValue: f.titleDefault })}</p>
          <p className="text-xs text-site-text-muted">{t(f.bodyKey, { defaultValue: f.bodyDefault })}</p>
        </div>
      </div>
    );
    if (f.action === 'command-palette') {
      return (
        <button
          key={f.titleKey}
          type="button"
          onClick={() => { dismiss(); openCommandPalette(); }}
          className="block w-full"
        >
          {inner}
        </button>
      );
    }
    return f.to ? (
      <Link key={f.titleKey} to={f.to as string} onClick={dismiss} className="block">
        {inner}
      </Link>
    ) : (
      <div key={f.titleKey}>{inner}</div>
    );
  };

  const isHistory = view === 'history';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className="max-w-lg p-0 gap-0 flex flex-col max-h-[85dvh] overflow-hidden">
        <div className="px-6 pt-6 text-center">
          <div className="mb-3 flex justify-center">
            <div className="rounded-site border border-site-accent/30 bg-site-accent-dim p-3">
              {isHistory ? <History className="h-7 w-7 text-site-accent" /> : <Sparkles className="h-7 w-7 text-site-accent" />}
            </div>
          </div>
          <DialogTitle className="text-xl font-bold text-site-text">
            {isHistory
              ? t('whatsnew-history-title', { defaultValue: 'Version history' })
              : t('whatsnew-title', { defaultValue: 'A big update just landed' })}
          </DialogTitle>
          <p className="mx-auto mt-2 max-w-sm text-sm text-site-text-muted">
            {isHistory
              ? t('whatsnew-history-subtitle', { defaultValue: 'Every feature release, newest first.' })
              : t('whatsnew-subtitle', { defaultValue: 'We shipped a wave of new features. Here’s a quick tour — tap any to jump in.' })}
          </p>
        </div>

        <div className="mt-4 flex-1 space-y-2 overflow-y-auto px-6 pb-2">
          {isHistory ? (
            RELEASES.map((release) => (
              <div key={release.version} className="pb-2">
                <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-site-border pb-1">
                  <p className="text-sm font-bold text-site-text">
                    {t(release.headlineKey, { defaultValue: release.headlineDefault })}
                  </p>
                  <span className="shrink-0 text-xs text-site-text-dim">
                    {t(release.dateKey, { defaultValue: release.dateDefault })}
                  </span>
                </div>
                <div className="space-y-2">
                  {release.features.map(renderFeature)}
                </div>
              </div>
            ))
          ) : (
            LATEST.features.map(renderFeature)
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-site-border px-6 py-4">
          {isHistory ? (
            <Button variant="ghost" size="sm" onClick={() => setView('current')}>
              <ChevronLeft className="h-4 w-4" />
              {t('back', { defaultValue: 'Back' })}
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setView('history')}>
              <History className="h-4 w-4" />
              {t('whatsnew-version-history', { defaultValue: 'Version history' })}
            </Button>
          )}
          <Button variant="accent" size="sm" onClick={dismiss}>
            {t('got-it', { defaultValue: 'Got it' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
