'use client';

import { forwardRef, useRef, type TextareaHTMLAttributes } from 'react';

interface GhostTextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
  /** Greyed-out completion shown after the caret; accepted with Tab / →. */
  suggestion?: string;
  /** Called when the user accepts the suggestion. Parent should append it. */
  onAcceptSuggestion?: () => void;
  /**
   * Box + typography classes shared by BOTH the textarea and the ghost mirror,
   * so they line up exactly. The textarea is rendered with a transparent
   * background on top of the mirror, which carries the surface color + the grey
   * suggestion text.
   */
  className?: string;
}

/**
 * A <textarea> with inline AI ghost-text autocomplete. The suggestion is drawn
 * by an aria-hidden mirror behind a transparent-background textarea (the only
 * reliable way to render styled inline ghost text in a textarea). Tab — or → at
 * the end of the input — accepts it.
 */
export const GhostTextArea = forwardRef<HTMLTextAreaElement, GhostTextAreaProps>(
  function GhostTextArea(
    { value, suggestion = '', onAcceptSuggestion, className = '', onKeyDown, ...props },
    ref
  ) {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);

    function setRefs(el: HTMLTextAreaElement | null) {
      innerRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    }

    function accept() {
      onAcceptSuggestion?.();
      // Keep the caret at the end after the parent appends the suggestion.
      requestAnimationFrame(() => {
        const el = innerRef.current;
        if (el) el.selectionStart = el.selectionEnd = el.value.length;
      });
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
      if (suggestion) {
        const el = e.currentTarget;
        const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
        if (e.key === 'Tab' || (e.key === 'ArrowRight' && atEnd)) {
          e.preventDefault();
          accept();
          return;
        }
      }
      onKeyDown?.(e);
    }

    return (
      <div className="relative flex-1 min-w-0">
        <div
          aria-hidden
          className={`${className} pointer-events-none absolute inset-0 w-full overflow-hidden whitespace-pre-wrap wrap-break-word text-transparent`}
        >
          {value}
          {suggestion && <span className="text-site-text-dim">{suggestion}</span>}
        </div>
        <textarea
          {...props}
          ref={setRefs}
          value={value}
          onKeyDown={handleKeyDown}
          className={`${className} relative w-full`}
          // Inline style beats any bg-* class from `className` (Tailwind
          // precedence is by source order), so the mirror's ghost text always
          // shows through the textarea.
          style={{ ...props.style, backgroundColor: 'transparent' }}
        />
      </div>
    );
  }
);
