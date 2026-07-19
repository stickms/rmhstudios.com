'use client';

/**
 * Onboarding v2 (§12) — the "First Week" card.
 *
 * A dismissible, pinned-atop-the-feed card that walks a new account through the
 * platform's pillars over seven days. Presentational + interactive: it takes the
 * server-verified `status` (from GET /api/onboarding/first-week) and renders the
 * steps with per-step deep links, a progress bar, and a graduation CTA. No modal
 * takeover — it fights the full-screen game routes and tests terribly.
 *
 * The integrator mounts this atop the feed for accounts younger than 14 days and
 * hidden once graduated/dismissed (see integration notes).
 */

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CheckCircle2, Circle, GraduationCap, Lock, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { useCelebration } from '@/hooks/useCelebration';

/** Mirrors the server `FirstWeekStatus` shape (kept local — server module is
 *  stubbed out of the client bundle, so it can't be imported here). */
export interface FirstWeekStepView {
  id: string;
  day: number;
  title: string;
  description: string;
  coins: number;
  href: string;
  done: boolean;
  available: boolean;
}
export interface FirstWeekStatusView {
  steps: FirstWeekStepView[];
  graduated: boolean;
  allDone: boolean;
  accountCreatedAt: string;
  graduationReward: number;
}

interface FirstWeekCardProps {
  status: FirstWeekStatusView;
  /** Called after a dismiss or a successful graduation so the parent can hide it. */
  onDismiss?: () => void;
  className?: string;
}

export function FirstWeekCard({ status, onDismiss, className }: FirstWeekCardProps) {
  const { t } = useTranslation('site');
  const celebrate = useCelebration();
  const [graduated, setGraduated] = useState(status.graduated);
  const [claiming, setClaiming] = useState(false);

  if (graduated) return null;

  const doneCount = status.steps.filter((s) => s.done).length;
  const total = status.steps.length;

  const graduate = async () => {
    setClaiming(true);
    try {
      const res = await fetch('/api/onboarding/first-week', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.graduated) {
        void celebrate({ kind: 'confetti' });
        toast.success(
          t('first-week-graduated', {
            defaultValue: '🎓 First Week complete! +{{reward}} coins and a starter cosmetic pack.',
            reward: data.reward,
          }),
        );
        setGraduated(true);
        onDismiss?.();
      } else {
        toast.error(
          data.error || t('first-week-graduate-error', { defaultValue: 'Could not claim yet' }),
        );
      }
    } finally {
      setClaiming(false);
    }
  };

  return (
    <section
      className={`rounded-site border border-site-border bg-site-accent-dim/20 p-4 ${className ?? ''}`}
      aria-label={t('first-week-title', { defaultValue: 'Your first week' })}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-site-text">
          <Sparkles className="h-5 w-5 text-site-accent" aria-hidden />
          {t('first-week-title', { defaultValue: 'Your first week' })}
        </h2>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('first-week-dismiss', { defaultValue: 'Dismiss for now' })}
          className="rounded-site-sm p-1 text-site-text-dim transition-colors hover:bg-site-surface-hover hover:text-site-text"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <p className="mb-3 text-sm text-site-text-muted">
        {t('first-week-blurb', {
          defaultValue:
            'One step a day across the platform. Finish them all to graduate — coins and a starter cosmetic pack.',
        })}
      </p>

      <ul className="mb-3 space-y-1.5">
        {status.steps.map((step) => {
          const locked = !step.available && !step.done;
          const row = (
            <span className="flex items-start gap-2.5 py-0.5 text-sm">
              {step.done ? (
                <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-site-success" aria-hidden />
              ) : locked ? (
                <Lock className="mt-0.5 h-4.5 w-4.5 shrink-0 text-site-text-dim" aria-hidden />
              ) : (
                <Circle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-site-text-dim" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span
                  className={
                    step.done ? 'text-site-text-dim line-through' : 'font-medium text-site-text'
                  }
                >
                  {step.title}
                </span>
                {!step.done && (
                  <span className="block text-xs text-site-text-muted">{step.description}</span>
                )}
              </span>
              <span className="ml-2 inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-site-accent">
                <CoinIcon className="h-3 w-3" /> {step.coins}
              </span>
            </span>
          );
          return (
            <li key={step.id}>
              {!step.done && step.available ? (
                <Link
                  to={step.href}
                  className="block rounded-site-sm px-1 hover:bg-site-surface-hover"
                >
                  {row}
                </Link>
              ) : (
                <span className={`block px-1 ${locked ? 'opacity-60' : ''}`}>{row}</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-site-surface">
          <div
            className="h-full rounded-full bg-site-accent transition-all"
            style={{ width: `${(doneCount / total) * 100}%` }}
          />
        </div>
        <span className="shrink-0 text-xs text-site-text-muted">
          {doneCount}/{total}
        </span>
        <Button
          size="sm"
          variant="accent"
          onClick={graduate}
          disabled={!status.allDone || claiming}
        >
          <GraduationCap className="h-4 w-4" aria-hidden />
          <span className="ml-1.5">
            {status.allDone
              ? t('first-week-graduate', {
                  defaultValue: 'Graduate +{{reward}}',
                  reward: status.graduationReward,
                })
              : t('first-week-in-progress', { defaultValue: 'In progress' })}
          </span>
        </Button>
      </div>
    </section>
  );
}
