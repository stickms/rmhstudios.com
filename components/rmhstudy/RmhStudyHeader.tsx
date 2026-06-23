/**
 * RmhStudyHeader — Shared header across all RmhStudy pages.
 */
'use client';

import { Link } from '@tanstack/react-router';
import { ArrowLeft, Circle } from 'lucide-react';
import { useTranslation } from "react-i18next";
import { useRmhStudyStore } from '@/lib/rmhstudy/store';

interface RmhStudyHeaderProps {
  backLabel: string;
  backHref?: string;
  onBack?: () => void;
  roomCode?: string;
  onCopyCode?: () => void;
  leftActions?: React.ReactNode;
}

export default function RmhStudyHeader({
  backLabel,
  backHref,
  onBack,
  roomCode,
  onCopyCode,
  leftActions,
}: RmhStudyHeaderProps) {
  const { t } = useTranslation("c-rmhstudy");
  const connectionStatus = useRmhStudyStore((s) => s.connectionStatus);

  const statusColor =
    connectionStatus === 'connected'
      ? 'text-(--rmhstudy-success)'
      : connectionStatus === 'connecting'
        ? 'text-(--rmhstudy-warning)'
        : 'text-(--rmhstudy-danger)';

  return (
    <header className="relative flex h-16 shrink-0 items-center border-b border-(--rmhstudy-border) px-4">
      <div className="flex items-center gap-2 z-10">
        {backHref ? (
          <Link
            to={backHref}
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-medium transition-colors text-(--rmhstudy-text-muted) hover:text-(--rmhstudy-text)"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        ) : (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-medium transition-colors text-(--rmhstudy-text-muted) hover:text-(--rmhstudy-text)"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </button>
        )}
        {leftActions}
      </div>

      <div className="absolute inset-x-0 flex justify-center pointer-events-none">
        <h1 className="text-lg font-bold tracking-tight" style={{ fontFamily: 'var(--rmhstudy-font-display)' }}>
          RMH Study
        </h1>
      </div>

      <div className="ml-auto flex items-center gap-3 z-10">
        {roomCode && (
          <button
            onClick={onCopyCode}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-sm font-bold tracking-widest transition-colors bg-(--rmhstudy-surface) text-(--rmhstudy-text) hover:bg-(--rmhstudy-surface-hover)"
            title={t("copy-room-code", { defaultValue: "Copy room code" })}
          >
            {roomCode}
          </button>
        )}
        <Circle className={`h-3 w-3 fill-current ${statusColor}`} />
      </div>
    </header>
  );
}
