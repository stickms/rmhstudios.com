/**
 * RmhTypeHeader — Shared header across all RmhType pages.
 */
'use client';

import Link from 'next/link';
import { ArrowLeft, Circle } from 'lucide-react';
import { useRmhTypeStore } from '@/lib/rmhtype/store';

interface RmhTypeHeaderProps {
  backLabel: string;
  backHref?: string;
  onBack?: () => void;
  roomCode?: string;
  onCopyCode?: () => void;
}

export default function RmhTypeHeader({
  backLabel,
  backHref,
  onBack,
  roomCode,
  onCopyCode,
}: RmhTypeHeaderProps) {
  const connectionStatus = useRmhTypeStore((s) => s.connectionStatus);

  const statusColor =
    connectionStatus === 'connected'
      ? 'text-(--rmhtype-success)'
      : connectionStatus === 'connecting'
        ? 'text-(--rmhtype-warning)'
        : 'text-(--rmhtype-danger)';

  return (
    <header className="relative flex h-16 shrink-0 items-center border-b border-(--rmhtype-border) px-4">
      <div className="flex items-center gap-2 z-10">
        {backHref ? (
          <Link
            href={backHref}
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-medium transition-colors text-(--rmhtype-text-muted) hover:text-(--rmhtype-text)"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        ) : (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-medium transition-colors text-(--rmhtype-text-muted) hover:text-(--rmhtype-text)"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </button>
        )}
      </div>

      <div className="absolute inset-x-0 flex justify-center pointer-events-none">
        <h1 className="text-lg font-bold tracking-tight" style={{ fontFamily: 'var(--rmhtype-font-display)' }}>
          RMH Type
        </h1>
      </div>

      <div className="ml-auto flex items-center gap-3 z-10">
        {roomCode && (
          <button
            onClick={onCopyCode}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-sm font-bold tracking-widest transition-colors bg-(--rmhtype-surface) text-(--rmhtype-text) hover:bg-(--rmhtype-surface-hover)"
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
