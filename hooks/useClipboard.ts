'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Copy text to the clipboard with a self-resetting `copied` flag.
 *
 * Replaces the many ad-hoc `navigator.clipboard.writeText` + `useState` +
 * `setTimeout` blocks scattered across the app with one consistent hook.
 * Falls back to a hidden `<textarea>` + `execCommand('copy')` when the async
 * Clipboard API is unavailable (older browsers, insecure/non-HTTPS contexts).
 *
 * ```tsx
 * const { copied, copy } = useClipboard();
 * <button onClick={() => copy(roomCode)}>{copied ? 'Copied' : 'Copy'}</button>
 * ```
 */
export function useClipboard({ resetMs = 2000 }: { resetMs?: number } = {}) {
  const [copied, setCopied] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeout.current) clearTimeout(timeout.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      let ok = false;
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          ok = true;
        } else {
          // Fallback for insecure contexts / older browsers.
          const el = document.createElement('textarea');
          el.value = text;
          el.setAttribute('readonly', '');
          el.style.position = 'fixed';
          el.style.opacity = '0';
          document.body.appendChild(el);
          el.select();
          ok = document.execCommand('copy');
          document.body.removeChild(el);
        }
      } catch {
        ok = false;
      }

      if (ok) {
        setCopied(true);
        if (timeout.current) clearTimeout(timeout.current);
        timeout.current = setTimeout(() => setCopied(false), resetMs);
      }
      return ok;
    },
    [resetMs],
  );

  return { copied, copy };
}
