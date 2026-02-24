/**
 * RoomCodeDisplay — Displays the room code in large monospace text with a copy button
 * and an optional leave button.
 *
 * Props:
 *   code: string — The room code to display
 *   onLeave?: () => void — Callback when leave button is clicked
 */
'use client';

import { useState, useCallback } from 'react';
import { Copy, Check, LogOut } from 'lucide-react';

interface RoomCodeDisplayProps {
  code: string;
  onLeave?: () => void;
}

export default function RoomCodeDisplay({ code, onLeave }: RoomCodeDisplayProps) {
  const [copied, setCopied] = useState(false);

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
    <div className="flex items-center gap-3 rounded-xl bg-(--rmhbox-surface) border border-(--rmhbox-border) px-6 py-4">
      {/* Leave button — left side, icon flipped to point left */}
      {onLeave && (
        <button
          onClick={onLeave}
          className="mr-2 rounded-lg p-2 text-(--rmhbox-danger) transition-colors hover:bg-(--rmhbox-danger)/15 hover:text-(--rmhbox-danger)"
          aria-label="Leave lobby"
          title="Leave lobby"
        >
          <LogOut className="h-5 w-5 -scale-x-100" />
        </button>
      )}

      <span
        className="font-mono text-4xl font-bold tracking-[0.3em] text-(--rmhbox-text) select-all"
        aria-label={`Room code: ${code.split('').join(' ')}`}
      >
        {code}
      </span>
      <button
        onClick={handleCopy}
        className="ml-2 rounded-lg p-2 text-(--rmhbox-text-muted) transition-colors hover:bg-(--rmhbox-surface-hover) hover:text-(--rmhbox-accent)"
        aria-label={copied ? 'Copied' : 'Copy room code'}
      >
        {copied ? <Check className="h-5 w-5 text-(--rmhbox-success)" /> : <Copy className="h-5 w-5" />}
      </button>
    </div>
  );
}
