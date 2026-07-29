/**
 * ConnectionStatus — what a player sees when the wire is unhappy.
 *
 * Two surfaces, deliberately different weights:
 *
 * - `<ConnectionBanner>` is a slim strip. It reports *our* connection: first
 *   connect, a drop we're recovering from, or a dead end. It never blocks
 *   input, because during a two-second blip the right thing is to let someone
 *   keep reading the screen.
 * - `<PeerWaitOverlay>` is a takeover. It reports *someone else's* connection,
 *   and it blocks — the game is paused, so pretending it isn't would let
 *   people act on a frozen board. It counts down to the moment the server
 *   stops waiting, which is the one number that answers "how long is this?".
 *
 * Both paint with `--app-*` tokens and fall back to sensible literals, so they
 * work inside an `.app-theme` app and equally inside a game that has its own
 * palette and no app chrome.
 */
'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, WifiOff, AlertTriangle, RefreshCw } from 'lucide-react';
import {
  PEER_GRACE_MS,
  type RealtimeStatus,
  type PeerWaitState,
} from '@/lib/shared/realtime/types';

/* ─── Shared ticking clock ──────────────────────────────────────────────── */

/** Whole seconds remaining until `deadline`, floored at 0. */
function useCountdown(deadline: number | null): number {
  const [remaining, setRemaining] = useState(() =>
    deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 0,
  );

  useEffect(() => {
    if (!deadline) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    // Recomputed from the deadline rather than decremented, so a throttled
    // background tab resumes with the right number instead of a stale one.
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [deadline]);

  return remaining;
}

/* ─── Our connection ────────────────────────────────────────────────────── */

export interface ConnectionBannerProps {
  status: RealtimeStatus;
  /** Offer a manual retry — wire to `client.reconnectNow()`. */
  onRetry?: () => void;
  className?: string;
}

export function ConnectionBanner({ status, onRetry, className }: ConnectionBannerProps) {
  const { t } = useTranslation('shared');

  // A healthy connection has nothing to say, and neither does a deliberate
  // disconnect — the app that closed the socket is already showing its own UI.
  if (status === 'connected' || status === 'idle' || status === 'disconnected') return null;

  const tone =
    status === 'error'
      ? 'var(--app-danger, #d98a8a)'
      : status === 'reconnecting'
        ? 'var(--app-warning, #d9c36e)'
        : 'var(--app-info, #7cacd4)';

  const label =
    status === 'error'
      ? t('connection-lost', { defaultValue: 'Connection lost' })
      : status === 'reconnecting'
        ? t('reconnecting', { defaultValue: 'Reconnecting…' })
        : t('connecting', { defaultValue: 'Connecting…' });

  const Icon = status === 'error' ? WifiOff : Loader2;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium ${className ?? ''}`}
      style={{
        color: tone,
        // `color-mix` on `currentColor` keeps the strip tinted with whatever
        // tone we just picked, with a flat fallback where it isn't supported.
        backgroundColor: 'color-mix(in srgb, currentColor 12%, transparent)',
        borderBottom: '1px solid color-mix(in srgb, currentColor 28%, transparent)',
      }}
    >
      <Icon
        className={`h-3.5 w-3.5 shrink-0 ${status === 'error' ? '' : 'app-spin'}`}
        aria-hidden
      />
      <span>{label}</span>
      {status === 'error' && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ms-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 underline underline-offset-2"
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          {t('try-again', { defaultValue: 'Try Again' })}
        </button>
      )}
    </div>
  );
}

/* ─── Someone else's connection ─────────────────────────────────────────── */

/**
 * "Ana", "Ana and Bo", "Ana, Bo, and Cy" — in the reader's own language.
 *
 * `Intl.ListFormat` gets the conjunction and the separators right for all 16
 * locales without a translated string per list length (and without dragging
 * plural categories into the catalogs, which is what a `{{count}} others`
 * phrasing would do). Engines without it fall back to comma-joining, which is
 * plain but never wrong.
 */
function formatNameList(names: string[], locale: string): string {
  if (names.length <= 1) return names[0] ?? '';
  try {
    return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(names);
  } catch {
    return names.join(', ');
  }
}

export interface PeerWaitOverlayProps {
  /** `null` when nobody is being waited on — the overlay unmounts itself. */
  waiting: PeerWaitState | null;
  /**
   * Let a host skip the remaining wait. Optional: without it the overlay is
   * purely informational and the server's timer is the only way out.
   */
  onSkip?: () => void;
  skipLabel?: string;
}

export function PeerWaitOverlay({ waiting, onSkip, skipLabel }: PeerWaitOverlayProps) {
  const { t, i18n } = useTranslation('shared');
  const remaining = useCountdown(waiting?.kickAt ?? null);

  if (!waiting || waiting.peers.length === 0) return null;

  const who = formatNameList(
    waiting.peers.map((p) => p.userName),
    i18n.language,
  );

  return (
    <div
      // `alertdialog` rather than `dialog`: this appeared on its own to
      // interrupt, and there is nothing to fill in.
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="peer-wait-title"
      className="app-overlay fixed inset-0 z-90 flex items-center justify-center p-6"
      style={{ background: 'var(--app-scrim, rgb(0 0 0 / 0.72))' }}
    >
      <div
        className="app-modal flex w-full max-w-sm flex-col items-center gap-4 p-6 text-center"
        style={{
          background: 'var(--app-surface, #27282c)',
          color: 'var(--app-text, #e8e8ec)',
          border: '1px solid var(--app-border, #3a3b42)',
          borderRadius: 'var(--app-radius, 12px)',
          boxShadow: 'var(--app-shadow, 0 4px 24px rgb(0 0 0 / 0.3))',
        }}
      >
        <WifiOff className="h-8 w-8" style={{ color: 'var(--app-warning, #d9c36e)' }} aria-hidden />

        <div className="space-y-1">
          <h2 id="peer-wait-title" className="text-base font-semibold">
            {t('game-paused', { defaultValue: 'Game paused' })}
          </h2>
          <p className="text-sm" style={{ color: 'var(--app-text-muted, #9a9ba4)' }}>
            {t('waiting-for-peer', {
              name: who,
              defaultValue: 'Waiting for {{name}} to reconnect…',
            })}
          </p>
        </div>

        {/* The countdown is the honest answer to "how long is this?" — it is
            the server's own timer, so it ends exactly when the wait does. */}
        <div className="flex w-full flex-col items-center gap-2">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: 'var(--app-surface-active, #3a3b42)' }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-250 ease-linear motion-reduce:transition-none"
              style={{
                width: `${Math.min(100, (remaining / (PEER_GRACE_MS / 1000)) * 100)}%`,
                background: 'var(--app-warning, #d9c36e)',
              }}
            />
          </div>
          <p className="text-xs tabular-nums" style={{ color: 'var(--app-text-dim, #6a6b74)' }}>
            {remaining > 0
              ? t('resuming-in', {
                  // `seconds`, not `count` — a `count` interpolation makes
                  // i18next mint a key per plural category, and every locale
                  // with a `_many` form then reads as an orphan against the
                  // English catalog.
                  seconds: remaining,
                  defaultValue: 'Continuing without them in {{seconds}}s',
                })
              : t('resuming-now', { defaultValue: 'Continuing…' })}
          </p>
        </div>

        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="w-full rounded-(--app-radius-sm) px-4 py-2 text-sm font-medium"
            style={{
              background: 'var(--app-surface-hover, #313238)',
              color: 'var(--app-text, #e8e8ec)',
            }}
          >
            {skipLabel ?? t('continue-without-them', { defaultValue: 'Continue without them' })}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Loading ───────────────────────────────────────────────────────────── */

export interface RealtimeLoadingProps {
  status: RealtimeStatus;
  /** Shown under the spinner, e.g. "Joining room…". */
  label?: string;
  onRetry?: () => void;
}

/**
 * Full-panel loading state for a room that has no content yet. Distinct from
 * the banner: there is nothing behind this to keep reading.
 */
export function RealtimeLoading({ status, label, onRetry }: RealtimeLoadingProps) {
  const { t } = useTranslation('shared');
  const failed = status === 'error';

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center"
      role="status"
      aria-live="polite"
    >
      {failed ? (
        <AlertTriangle
          className="h-8 w-8"
          style={{ color: 'var(--app-danger, #d98a8a)' }}
          aria-hidden
        />
      ) : (
        <Loader2
          className="app-spin h-8 w-8"
          style={{ color: 'var(--app-accent, #6ea8d9)' }}
          aria-hidden
        />
      )}
      <p className="text-sm" style={{ color: 'var(--app-text-muted, #9a9ba4)' }}>
        {failed
          ? t('connection-lost', { defaultValue: 'Connection lost' })
          : (label ??
            (status === 'reconnecting'
              ? t('reconnecting', { defaultValue: 'Reconnecting…' })
              : t('connecting', { defaultValue: 'Connecting…' })))}
      </p>
      {failed && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-(--app-radius-sm) px-4 py-2 text-sm font-medium"
          style={{
            background: 'var(--app-accent, #6ea8d9)',
            color: 'var(--app-accent-fg, #06121c)',
          }}
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          {t('try-again', { defaultValue: 'Try Again' })}
        </button>
      )}
    </div>
  );
}
