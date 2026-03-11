/**
 * RmhTubeHeader — Shared header across all RmhTube pages.
 *
 * Adapts content based on context:
 * - Landing: "← Games" back link, "RmhTube" title, connection status
 * - Room: "← Leave" back link, "RmhTube" title, room code + connection status
 */
'use client';

import { Link } from '@tanstack/react-router';
import { ArrowLeft, Circle } from 'lucide-react';
import { useRmhTubeStore } from '@/lib/rmhtube/store';

interface RmhTubeHeaderProps {
  backLabel: string;
  backHref?: string;
  onBack?: () => void;
  roomCode?: string;
  onCopyCode?: () => void;
}

export default function RmhTubeHeader({
  backLabel,
  backHref,
  onBack,
  roomCode,
  onCopyCode,
}: RmhTubeHeaderProps) {
  const connectionStatus = useRmhTubeStore((s) => s.connectionStatus);

  const statusColor =
    connectionStatus === 'connected'
      ? 'text-(--rmhtube-success)'
      : connectionStatus === 'connecting'
        ? 'text-(--rmhtube-warning)'
        : 'text-(--rmhtube-danger)';

  return (
    <header className="relative flex h-16 shrink-0 items-center px-4">
      {/* Left: Back link */}
      <div className="flex items-center gap-2 z-10">
        {backHref ? (
          <Link
            to={backHref}
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-medium transition-colors text-(--rmhtube-text-muted) hover:text-(--rmhtube-text)"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        ) : (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-medium transition-colors text-(--rmhtube-text-muted) hover:text-(--rmhtube-text)"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </button>
        )}
      </div>

      {/* Center: Title (absolutely centered) */}
      <div className="absolute inset-x-0 flex justify-center pointer-events-none">
        <h1
          className="text-lg font-bold tracking-tight"
          style={{ fontFamily: 'var(--rmhtube-font-display)' }}
        >
          RmhTube
        </h1>
      </div>

      {/* Right: Room code + Connection status */}
      <div className="ml-auto flex items-center gap-3 z-10">
        {roomCode && (
          <button
            onClick={onCopyCode}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-sm font-bold tracking-widest transition-colors bg-(--rmhtube-surface) text-(--rmhtube-text) hover:bg-(--rmhtube-surface-hover)"
            title="Copy room code"
          >
            {roomCode}
          </button>
        )}
        <Circle className={`h-3 w-3 fill-current ${statusColor}`} />
      </div>
    </header>
  );
}
