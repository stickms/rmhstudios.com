/**
 * AppHeader — the bar across the top of a full-screen app.
 *
 * RMHType, RMHStudy and RMHTube each shipped their own copy of this: same
 * back link, same absolutely-centred title, same room-code chip, same
 * connection dot. Same bug, too — the centred title was positioned
 * `absolute inset-x-0`, so on a narrow screen it ran straight through the back
 * link on one side and the room code on the other.
 *
 * The layout here is a three-column grid instead: the title is genuinely
 * centred, it truncates rather than overlapping, and it steps aside entirely
 * on the narrowest screens where the controls need the room.
 */
'use client';

import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Circle, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RealtimeStatus } from '@/lib/shared/realtime/types';

export interface AppHeaderProps {
  /** The app's name, centred. */
  title: string;
  backLabel: string;
  /** Router destination. Omit to make the control a button and use `onBack`. */
  backHref?: string;
  onBack?: () => void;
  /** Room/lobby code, shown as a copy-to-clipboard chip. */
  roomCode?: string;
  onCopyCode?: () => void;
  /** Connection dot. Omit for pages with no socket. */
  status?: RealtimeStatus;
  /** Extra controls beside the back link. */
  leftActions?: ReactNode;
  /** Extra controls before the status dot. */
  rightActions?: ReactNode;
  /** Draw the hairline under the bar. Off for apps that draw their own. */
  bordered?: boolean;
}

const DOT_TONE: Record<RealtimeStatus, string> = {
  idle: 'text-(--app-text-dim)',
  connecting: 'text-(--app-warning)',
  connected: 'text-(--app-success)',
  reconnecting: 'text-(--app-warning)',
  disconnected: 'text-(--app-text-dim)',
  error: 'text-(--app-danger)',
};

export default function AppHeader({
  title,
  backLabel,
  backHref,
  onBack,
  roomCode,
  onCopyCode,
  status,
  leftActions,
  rightActions,
  bordered = true,
}: AppHeaderProps) {
  const { t } = useTranslation('shared');

  const backClasses =
    'flex items-center gap-1.5 text-sm font-medium text-(--app-text-muted) transition-colors hover:text-(--app-text)';

  const statusLabel: Record<RealtimeStatus, string> = {
    idle: t('not-connected', { defaultValue: 'Not connected' }),
    connecting: t('connecting', { defaultValue: 'Connecting…' }),
    connected: t('connected', { defaultValue: 'Connected' }),
    reconnecting: t('reconnecting', { defaultValue: 'Reconnecting…' }),
    disconnected: t('not-connected', { defaultValue: 'Not connected' }),
    error: t('connection-lost', { defaultValue: 'Connection lost' }),
  };

  return (
    <header
      className={`grid h-16 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 sm:px-4 ${
        bordered ? 'border-b border-(--app-border)' : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {backHref ? (
          <Link to={backHref} onClick={onBack} className={backClasses}>
            <ArrowLeft className="h-4 w-4 shrink-0 rtl-flip" aria-hidden />
            {/* The arrow alone carries the meaning once space is tight. */}
            <span className="hidden truncate xs:inline">{backLabel}</span>
            <span className="sr-only xs:hidden">{backLabel}</span>
          </Link>
        ) : (
          <button type="button" onClick={onBack} className={backClasses}>
            <ArrowLeft className="h-4 w-4 shrink-0 rtl-flip" aria-hidden />
            <span className="hidden truncate xs:inline">{backLabel}</span>
            <span className="sr-only xs:hidden">{backLabel}</span>
          </button>
        )}
        {leftActions}
      </div>

      {/* Centre column. Hidden on the narrowest screens, where the back label
          and the room code both need the width more than the app's own name
          does — it is on the tab already. */}
      <h1
        className="hidden truncate px-2 text-lg font-bold tracking-tight sm:block"
        style={{ fontFamily: 'var(--app-font-display)' }}
      >
        {title}
      </h1>

      <div className="flex min-w-0 items-center justify-end gap-2">
        {rightActions}

        {roomCode && (
          <button
            type="button"
            onClick={onCopyCode}
            className="flex items-center gap-1.5 rounded-(--app-radius-sm) bg-(--app-surface) px-2 py-1 font-mono text-sm font-bold tracking-widest text-(--app-text) transition-colors hover:bg-(--app-surface-hover)"
            title={t('copy-room-code', { defaultValue: 'Copy room code' })}
          >
            <span className="truncate">{roomCode}</span>
            <Copy className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
          </button>
        )}

        {status && (
          // Titled, not bare: a coloured dot with no text alternative tells a
          // screen-reader user nothing at all about the connection.
          <span
            className={`shrink-0 ${DOT_TONE[status]}`}
            title={statusLabel[status]}
            role="img"
            aria-label={statusLabel[status]}
          >
            <Circle className="h-3 w-3 fill-current" aria-hidden />
          </span>
        )}
      </div>
    </header>
  );
}
