/**
 * ThinkingStream — a scrollable panel that shows the model's streamed
 * chain-of-thought, auto-scrolling to the latest text as it arrives.
 */

import { useStickToBottom } from '@/hooks/useStickToBottom';

export function ThinkingStream({ text, className = '' }: { text: string; className?: string }) {
  // `useStickToBottom`, not `scrollTop = scrollHeight` in an effect. The old form
  // had two faults: reading `scrollHeight` FORCES a synchronous layout, here on
  // every streamed token, and it re-pinned unconditionally — so a reader who
  // scrolled up to re-read something was yanked back down by the next token.
  // The hook records the pin decision on `scroll` (before the content grows) and
  // re-pins from a ResizeObserver. See docs/performance-audit-2026-08-12.md §1.5.
  const { containerRef, contentRef } = useStickToBottom<HTMLDivElement, HTMLDivElement>();

  if (!text) return null;

  return (
    <div ref={containerRef} className={`vibe-think ${className}`.trim()} aria-live="polite">
      <div ref={contentRef}>{text}</div>
    </div>
  );
}
