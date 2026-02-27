/**
 * RoomCodeDisplay — Large monospace room code with copy-to-clipboard.
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
    const shareUrl = `${window.location.origin}/rmhtube/${code}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: copy just the code
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  return (
    <div className="flex items-center gap-3">
      <span
        className="text-2xl font-bold tracking-[0.3em] font-mono"
        style={{ fontFamily: 'var(--rmhtube-font-mono)' }}
      >
        {code}
      </span>
      <button
        onClick={handleCopy}
        className="rounded-md p-2 transition-colors bg-(--rmhtube-surface-hover) text-(--rmhtube-text-muted) hover:text-(--rmhtube-text)"
        title={copied ? 'Copied!' : 'Copy invite link'}
      >
        {copied ? <Check className="h-4 w-4 text-(--rmhtube-success)" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
