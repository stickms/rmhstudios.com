'use client';

/**
 * First-run onboarding checklist, shown at the top of the home feed for
 * young accounts until the reward is claimed (or the card is dismissed).
 * Steps are verified server-side by /api/onboarding; completing them all
 * unlocks a one-time coin reward with a confetti send-off.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Circle,
  Flame,
  Palette,
  PenSquare,
  Sparkles,
  UserPlus,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/Providers';
import { useCelebration } from '@/hooks/useCelebration';
import { useIdleReady } from '@/hooks/useIdleReady';
import { useThemeStore } from '@/stores/themeStore';
import { AsyncReveal } from '@/components/motion';

const DISMISS_KEY = 'rmh-onboarding-dismissed';
/** Only pitch the checklist to accounts younger than this. */
const MAX_ACCOUNT_AGE_MS = 14 * 24 * 60 * 60 * 1000;

interface Status {
  claimed: boolean;
  accountCreatedAt: string;
  reward: number;
  steps: { posted: boolean; follows: number; followTarget: number; checkedIn: boolean };
}

export function OnboardingChecklist() {
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const celebrate = useCelebration();
  const idle = useIdleReady();
  const themeStyle = useThemeStore((s) => s.style);
  const [status, setStatus] = useState<Status | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/onboarding', { credentials: 'include' });
      if (res.ok) setStatus(await res.json());
    } catch {
      // silent — the card just won't render
    }
  }, []);

  // Defer the initial status fetch until idle — the checklist is supplementary,
  // so it shouldn't compete for the network during hydration.
  useEffect(() => {
    if (!session?.user || dismissed || !idle) return;
    void refresh();
  }, [session?.user, dismissed, idle, refresh]);

  // Refresh progress when the tab regains focus (user followed people /
  // checked in on another screen and came back).
  useEffect(() => {
    if (!session?.user || dismissed) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [session?.user, dismissed, refresh]);

  if (!session?.user || dismissed || !status || status.claimed) {
    return <AsyncReveal show={false} />;
  }
  if (Date.now() - new Date(status.accountCreatedAt).getTime() > MAX_ACCOUNT_AGE_MS) {
    return <AsyncReveal show={false} />;
  }

  const themeCustomized = themeStyle !== 'default';
  const steps = [
    {
      key: 'post',
      done: status.steps.posted,
      icon: PenSquare,
      label: t('onboarding-step-post', { defaultValue: 'Make your first post' }),
      href: undefined as string | undefined,
    },
    {
      key: 'follow',
      done: status.steps.follows >= status.steps.followTarget,
      icon: UserPlus,
      label: t('onboarding-step-follow', {
        count: status.steps.followTarget,
        current: status.steps.follows,
        defaultValue: 'Follow {{count}} creators ({{current}}/{{count}})',
      }),
      href: '/explore',
    },
    {
      key: 'checkin',
      done: status.steps.checkedIn,
      icon: Flame,
      label: t('onboarding-step-checkin', { defaultValue: 'Do your first daily check-in' }),
      href: '/achievements',
    },
    {
      key: 'theme',
      done: themeCustomized,
      icon: Palette,
      label: t('onboarding-step-theme', { defaultValue: 'Pick a theme you like (⌘K → "theme")' }),
      href: undefined,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const claim = async () => {
    setClaiming(true);
    try {
      const res = await fetch('/api/onboarding', { method: 'POST', credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.claimed) {
        void celebrate({ kind: 'confetti' });
        toast.success(
          t('onboarding-claimed', {
            reward: data.reward,
            defaultValue: '+{{reward}} coins — welcome aboard! 🎉',
          }),
        );
        setStatus((s) => (s ? { ...s, claimed: true } : s));
      } else {
        await refresh();
      }
    } finally {
      setClaiming(false);
    }
  };

  return (
    <AsyncReveal
      show
      as="section"
      className="border-b border-site-border bg-site-accent-dim/20 px-4 py-4"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-site-text">
          <Sparkles className="h-5 w-5 text-site-accent" aria-hidden />
          {t('onboarding-title', { defaultValue: 'Get started on RMH Studios' })}
        </h2>
        <button
          onClick={dismiss}
          aria-label={t('onboarding-dismiss', { defaultValue: 'Dismiss checklist' })}
          className="rounded-site-sm p-1 text-site-text-dim transition-colors hover:bg-site-surface-hover hover:text-site-text"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <p className="mb-3 text-sm text-site-text-muted">
        {t('onboarding-blurb', {
          reward: status.reward,
          defaultValue: 'Finish these four steps and earn {{reward}} coins.',
        })}
      </p>

      <ul className="mb-3 space-y-1.5">
        {steps.map((step) => {
          const Icon = step.icon;
          const row = (
            <span className="flex items-center gap-2.5 text-sm">
              {step.done ? (
                <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-site-success" aria-hidden />
              ) : (
                <Circle className="h-4.5 w-4.5 shrink-0 text-site-text-dim" aria-hidden />
              )}
              <Icon className="h-4 w-4 shrink-0 text-site-text-dim" aria-hidden />
              <span className={step.done ? 'text-site-text-dim line-through' : 'text-site-text'}>
                {step.label}
              </span>
            </span>
          );
          return (
            <li key={step.key}>
              {step.href && !step.done ? (
                <Link
                  to={step.href}
                  className="block rounded-site-sm px-1 py-0.5 hover:bg-site-surface-hover"
                >
                  {row}
                </Link>
              ) : (
                <span className="block px-1 py-0.5">{row}</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-site-surface">
          <div
            className="h-full rounded-full bg-site-accent transition-[width] duration-300"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>
        <Button size="sm" onClick={claim} disabled={!allDone || claiming}>
          {t('onboarding-claim', {
            reward: status.reward,
            defaultValue: 'Claim {{reward}} coins',
          })}
        </Button>
      </div>
    </AsyncReveal>
  );
}
