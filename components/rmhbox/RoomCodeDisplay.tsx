/**
 * RoomCodeDisplay — Displays the room code in large monospace text with a copy button
 * and an optional leave button.
 *
 * There are two things worth copying here. The code is what you say out loud;
 * the link is `/rmhbox/<code>`, which is this very page — an RMHbox lobby has
 * always been its own route, so the link needs no machinery beyond a button
 * that hands it over.
 *
 * Props:
 *   code: string — The room code to display
 *   onLeave?: () => void — Callback when leave button is clicked
 */
'use client';

import { useState, useCallback } from 'react';
import { Copy, Check, Link2, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLobbyLink } from '@/hooks/useLobbyLink';

interface RoomCodeDisplayProps {
  code: string;
  onLeave?: () => void;
}

export default function RoomCodeDisplay({ code, onLeave }: RoomCodeDisplayProps) {
  const { t } = useTranslation("c-rmhbox");
  const [copied, setCopied] = useState(false);
  const { copied: linkCopied, copyLink } = useLobbyLink({ path: `/rmhbox/${code}` });

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text for manual copy
    }
  }, [code]);

  return (
    <div className="flex items-center gap-3 rounded-xl bg-(--app-surface) border border-(--app-border) px-6 py-4">
      {/* Leave button — left side, icon flipped to point left */}
      {onLeave && (
        <button
          onClick={onLeave}
          className="mr-2 rounded-lg p-2 text-(--app-danger) transition-colors hover:bg-(--app-danger)/15 hover:text-(--app-danger)"
          aria-label={t("leave-lobby", { defaultValue: "Leave lobby" })}
          title={t("leave-lobby", { defaultValue: "Leave lobby" })}
        >
          <LogOut className="h-5 w-5 -scale-x-100" />
        </button>
      )}

      <span
        className="font-mono text-4xl font-bold tracking-[0.3em] text-(--app-text) select-all"
        aria-label={t("room-code-label", { defaultValue: "Room code: {{code}}", code: code.split('').join(' ') })}
      >
        {code}
      </span>
      <button
        onClick={handleCopy}
        className="ml-2 rounded-lg p-2 text-(--app-text-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-accent)"
        aria-label={copied ? t("copied", { defaultValue: "Copied" }) : t("copy-room-code", { defaultValue: "Copy room code" })}
      >
        {copied ? <Check className="h-5 w-5 text-(--app-success)" /> : <Copy className="h-5 w-5" />}
      </button>
      <button
        onClick={() => void copyLink()}
        className="rounded-lg p-2 text-(--app-text-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-accent)"
        aria-label={linkCopied ? t("copied", { defaultValue: "Copied" }) : t("copy-invite-link", { defaultValue: "Copy invite link" })}
        title={t("copy-invite-link", { defaultValue: "Copy invite link" })}
      >
        {linkCopied ? <Check className="h-5 w-5 text-(--app-success)" /> : <Link2 className="h-5 w-5" />}
      </button>
    </div>
  );
}
