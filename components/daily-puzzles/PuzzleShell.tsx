'use client';

/**
 * PuzzleShell — the one grammar every daily puzzle speaks.
 *
 * Alibi, Spectrum, Outcast, Chainlink, Impostor, Lights Out and GlobeSet used
 * to each hand-roll the same four things — the page column, the back link +
 * title block, the result card and the share row — in seven slightly different
 * sets of radii, paddings and raw palette colours. This file is the single copy:
 *
 *   <PuzzlePage>                       column: max-w, gutter, safe-top, bottom space
 *     <PuzzleBackLink />               "Back to Daily Puzzles"
 *     <PuzzleHeader icon title subtitle>   centred title block (+ optional tagline)
 *     …the puzzle…
 *     <PuzzleResultCard tone title stats> outcome + stat row (L2 pane)
 *     <PuzzleSection icon title>       detail card under the result (L1 fill)
 *     <PuzzleShareRow shareText />     Share (CopyButton) + All Puzzles
 *     <PuzzleFootnote />               "A new … unlocks tomorrow"
 *
 * Colour comes from the semantic site tokens only (success / danger / warning /
 * accent) so every theme works. Surfaces are glass elevation classes by role.
 * The route layout (`app/routes/daily.tsx`) provides the `.app-page` document
 * and the ground; this file provides everything inside it.
 */

import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { cn } from '@/lib/utils';

export type PuzzleTone = 'success' | 'danger' | 'warning' | 'accent' | 'neutral';

/** Ink for a semantic tone (text on the glass, never on a filled surface). */
export const TONE_TEXT: Record<PuzzleTone, string> = {
  success: 'text-site-success',
  danger: 'text-site-danger',
  warning: 'text-site-warning',
  accent: 'text-site-accent',
  neutral: 'text-site-text',
};

/** Translucent tint + hairline for a semantic tone (callouts, picked cards). */
export const TONE_TINT: Record<PuzzleTone, string> = {
  success: 'border-site-success/40 bg-site-success/10',
  danger: 'border-site-danger/40 bg-site-danger/10',
  warning: 'border-site-warning/40 bg-site-warning/10',
  accent: 'border-site-accent/40 bg-site-accent/10',
  neutral: 'border-site-border bg-site-surface',
};

const TONE_RIM: Record<PuzzleTone, string> = {
  success: 'border-site-success/40',
  danger: 'border-site-danger/40',
  warning: 'border-site-warning/40',
  accent: 'border-site-accent/40',
  neutral: 'border-site-border',
};

/* ── Page column ───────────────────────────────────────────────────────────── */

/**
 * The puzzle column. `md` (max-w-2xl) is the reading width every card puzzle
 * shares; `lg` (max-w-5xl) is for boards that want the room (GlobeSet, the hub).
 * Top inset clears the notch (§12.1 rule 1); bottom space is `pb-12` and the
 * `.app-page` parent adds the home-indicator inset after it.
 */
export function PuzzlePage({
  children,
  width = 'md',
  className,
}: {
  children: ReactNode;
  width?: 'md' | 'lg';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 pt-[calc(1rem+var(--safe-top))] pb-12',
        width === 'lg' ? 'max-w-5xl' : 'max-w-2xl',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ── Header ────────────────────────────────────────────────────────────────── */

export function PuzzleBackLink({ className }: { className?: string }) {
  const { t } = useTranslation('c-daily-puzzles');
  return (
    <Button asChild variant="ghost" size="sm" className={cn('-ml-2 mb-3 text-site-text-muted', className)}>
      <Link to="/daily">
        <ArrowLeft aria-hidden />
        {t('back-to-daily-puzzles', { defaultValue: 'Back to Daily Puzzles' })}
      </Link>
    </Button>
  );
}

/**
 * Back link + centred title block. `icon` is decorative (a lucide icon or an
 * emoji); the h1 is the puzzle's name. `children` is the optional instruction
 * callout that sits under the subtitle (see `PuzzleNotice`).
 */
export function PuzzleHeader({
  icon,
  title,
  subtitle,
  children,
  hideBackLink = false,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  hideBackLink?: boolean;
}) {
  return (
    <>
      {!hideBackLink && <PuzzleBackLink />}
      <header className="mb-6 flex flex-col items-center gap-2 text-center">
        <h1 className="flex items-center justify-center gap-2 text-3xl font-bold tracking-tight text-site-text sm:text-4xl">
          {icon ? (
            <span aria-hidden className="inline-flex shrink-0 items-center text-site-accent [&_svg]:size-7 sm:[&_svg]:size-8">
              {icon}
            </span>
          ) : null}
          {title}
        </h1>
        {subtitle ? <p className="text-sm text-site-text-muted">{subtitle}</p> : null}
        {children}
      </header>
    </>
  );
}

/** The instruction / status callout under a header or above the board. */
export function PuzzleNotice({
  tone = 'accent',
  title,
  children,
  className,
}: {
  tone?: PuzzleTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="note"
      className={cn(
        'rounded-site-sm border px-4 py-3 text-center',
        TONE_TINT[tone],
        className,
      )}
    >
      {title ? <p className={cn('text-sm font-semibold', TONE_TEXT[tone])}>{title}</p> : null}
      {children ? (
        <div className={cn('text-xs text-site-text-muted', title && 'mt-1')}>{children}</div>
      ) : null}
    </div>
  );
}

/* ── Result ────────────────────────────────────────────────────────────────── */

export type PuzzleStatItem = {
  key: string;
  icon?: ReactNode;
  value: ReactNode;
  label: ReactNode;
  tone?: PuzzleTone;
};

/**
 * The result card: outcome title + one-line description, then a stat row.
 * One singular panel per page, so it takes the L2 pane. `tone` colours the
 * title and the hairline; the stats always sit on the same three-up grid.
 */
export function PuzzleResultCard({
  tone = 'success',
  emoji,
  title,
  description,
  stats,
  children,
}: {
  tone?: PuzzleTone;
  emoji?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  stats?: PuzzleStatItem[];
  children?: ReactNode;
}) {
  return (
    <section
      className={cn(
        'glass-pane flex flex-col items-center gap-4 rounded-site border px-4 py-5 text-center sm:px-6',
        TONE_RIM[tone],
      )}
    >
      <div className="flex flex-col items-center gap-1">
        {emoji ? (
          <div aria-hidden className="text-3xl">
            {emoji}
          </div>
        ) : null}
        <h2 className={cn('text-2xl font-bold', TONE_TEXT[tone])}>{title}</h2>
        {description ? <p className="text-sm text-site-text-muted">{description}</p> : null}
      </div>
      {stats && stats.length > 0 ? (
        <dl className="flex w-full flex-wrap items-start justify-center gap-x-8 gap-y-4 border-t border-site-border pt-4">
          {stats.map((s) => (
            <div key={s.key} className="flex min-w-16 flex-col items-center gap-1">
              {s.icon ? (
                <span aria-hidden className="text-site-text-muted [&_svg]:size-5">
                  {s.icon}
                </span>
              ) : null}
              <dd className={cn('order-2 text-2xl font-bold tabular-nums', TONE_TEXT[s.tone ?? 'neutral'])}>
                {s.value}
              </dd>
              <dt className="order-3 text-xs text-site-text-muted">{s.label}</dt>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </section>
  );
}

/** A detail card under the result (explanations, example chain, fun fact…). */
export function PuzzleSection({
  icon,
  title,
  children,
  className,
}: {
  icon?: ReactNode;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('glass-fill flex flex-col gap-3 rounded-site px-4 py-4', className)}>
      {title ? (
        <h3 className="site-section-label flex items-center gap-2">
          {icon ? (
            <span aria-hidden className="inline-flex text-site-text-muted [&_svg]:size-4">
              {icon}
            </span>
          ) : null}
          {title}
        </h3>
      ) : null}
      {children}
    </section>
  );
}

/** A stack of result pieces — the rhythm between result card, sections and share row. */
export function PuzzleResultStack({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-col gap-3">{children}</div>;
}

/* ── Share row ─────────────────────────────────────────────────────────────── */

/**
 * Share + back-to-hub. `shareText` is the already-built share string; the
 * shared `CopyButton` owns the clipboard, the copied state and the announcement.
 */
export function PuzzleShareRow({
  shareText,
  shareLabel,
  disabled,
}: {
  shareText: string;
  shareLabel?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation('c-daily-puzzles');
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <CopyButton
        value={shareText}
        icon={Share2}
        variant="accent"
        toastOnCopy={false}
        disabled={disabled}
      >
        {shareLabel ?? t('share-result', { defaultValue: 'Share Result' })}
      </CopyButton>
      <Button asChild variant="secondary">
        <Link to="/daily">
          <ArrowLeft aria-hidden />
          {t('all-puzzles', { defaultValue: 'All Puzzles' })}
        </Link>
      </Button>
    </div>
  );
}

export function PuzzleFootnote({ children }: { children: ReactNode }) {
  return <p className="text-center text-xs text-site-text-muted">{children}</p>;
}
