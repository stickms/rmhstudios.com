/**
 * ThinkingStream — a scrollable panel that shows the model's streamed
 * chain-of-thought, auto-scrolling to the latest text as it arrives.
 */

import { useEffect, useRef } from 'react';

export function ThinkingStream({ text, className = '' }: { text: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  if (!text) return null;

  return (
    <div ref={ref} className={`vibe-think ${className}`.trim()} aria-live="polite">
      {text}
    </div>
  );
}
