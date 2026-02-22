/**
 * RoomCodeDisplay — Displays the room code in large monospace text with a copy button.
 *
 * Props:
 *   code: string — The room code to display
 */
'use client';

import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';

interface RoomCodeDisplayProps {
  code: string;
}

export default function RoomCodeDisplay({ code }: RoomCodeDisplayProps) {
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
    <div className="flex items-center gap-3 rounded-xl bg-[var(--rmhbox-surface)] border border-[var(--rmhbox-border)] px-6 py-4">
      <span
        className="font-mono text-4xl font-bold tracking-[0.3em] text-[var(--rmhbox-text)] select-all"
        aria-label={`Room code: ${code.split('').join(' ')}`}
      >
        {code}
      </span>
      <button
        onClick={handleCopy}
        className="ml-2 rounded-lg p-2 text-[var(--rmhbox-text-muted)] transition-colors hover:bg-[var(--rmhbox-surface-hover)] hover:text-[var(--rmhbox-accent)]"
        aria-label={copied ? 'Copied' : 'Copy room code'}
      >
        {copied ? <Check className="h-5 w-5 text-[var(--rmhbox-success)]" /> : <Copy className="h-5 w-5" />}
      </button>
    </div>
  );
}
