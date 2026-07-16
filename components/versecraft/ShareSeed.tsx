'use client';

import { useState, useCallback } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';

/**
 * Copy-the-seed control. A "version" is fully defined by its seed, so sharing
 * the code lets anyone replay the exact same world. Mobile-friendly tap target
 * with a transient "copied" toast; falls back to a select-and-prompt if the
 * clipboard API is unavailable.
 */
export function ShareSeed({ seed, compact = false }: { seed: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = seed;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-secure contexts.
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt('Copy this seed to share your version:', text);
    }
  }, [seed]);

  return (
    <button
      onClick={copy}
      className="relative inline-flex items-center gap-1.5 rounded transition-all active:scale-95"
      style={{
        backgroundColor: 'rgba(196,163,90,0.12)',
        border: '1px solid rgba(196,163,90,0.3)',
        color: '#e8e0d0',
        padding: compact ? '4px 8px' : '8px 14px',
        fontSize: compact ? 11 : 14,
        minHeight: compact ? undefined : 40,
      }}
      title="Copy seed to share this version"
    >
      <span aria-hidden style={{ color: '#c4a35a' }}>⧉</span>
      <span className="font-mono tracking-tight">{seed}</span>
      <AnimatePresence>
        {copied && (
          <motion.span
            className="absolute left-1/2 -translate-x-1/2 -top-7 px-2 py-1 rounded text-xs whitespace-nowrap"
            style={{ backgroundColor: '#2a2233', border: '1px solid rgba(196,163,90,0.4)', color: '#e8e0d0' }}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          >
            copied ✓
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
