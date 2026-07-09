'use client';

import { useCallback, useEffect, useState, type ReactNode, type RefObject } from 'react';
import { loadShortcodes, getShortcodesSync } from './shortcodes';
import {
  findShortcodeTrigger,
  searchShortcodes,
  replaceCompletedShortcode,
  type ShortcodeTrigger,
} from './shortcode-matcher';

type TextField = HTMLTextAreaElement | HTMLInputElement;

interface UseEmojiShortcodesOptions {
  ref: RefObject<TextField | null>;
  value: string;
  onChange: (next: string) => void;
}

/**
 * Shortcode autocomplete for inputs that don't use MentionTextarea.
 * Call `onValueChange` from the input's change handler (instead of setting
 * state directly), route `onKeyDown` first, and render `menu` inside a
 * position:relative wrapper around the input (it opens above the field).
 */
export function useEmojiShortcodes({ ref, value, onChange }: UseEmojiShortcodesOptions) {
  const [trigger, setTrigger] = useState<ShortcodeTrigger | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{ name: string; emoji: string }>>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const dismiss = useCallback(() => {
    setTrigger(null);
    setSuggestions([]);
    setActiveIndex(0);
  }, []);

  const onValueChange = useCallback(
    (next: string) => {
      const el = ref.current;
      const caret = el?.selectionStart ?? next.length;
      const map = getShortcodesSync();
      const converted = map ? replaceCompletedShortcode(next, caret, map) : null;
      if (converted) {
        onChange(converted.next);
        dismiss();
        requestAnimationFrame(() => {
          el?.focus();
          el?.setSelectionRange(converted.caret, converted.caret);
        });
        return;
      }
      onChange(next);
      const nextTrigger = findShortcodeTrigger(next, caret);
      setTrigger(nextTrigger);
      if (nextTrigger) void loadShortcodes();
    },
    [ref, onChange, dismiss],
  );

  // Warm the shortcode dataset on mount so instant `:name:` conversion works
  // from the first keystroke, even for fast typists or pastes.
  useEffect(() => {
    void loadShortcodes();
  }, []);

  useEffect(() => {
    if (!trigger) return;
    let cancelled = false;
    loadShortcodes().then((map) => {
      if (cancelled) return;
      setSuggestions(searchShortcodes(trigger.query, map));
      setActiveIndex(0);
    });
    return () => {
      cancelled = true;
    };
  }, [trigger]);

  const apply = useCallback(
    (choice: { name: string; emoji: string }) => {
      const el = ref.current;
      if (!trigger) return;
      const caret = el?.selectionStart ?? value.length;
      const next = `${value.slice(0, trigger.start)}${choice.emoji} ${value.slice(caret)}`;
      onChange(next);
      dismiss();
      const nextCaret = trigger.start + choice.emoji.length + 1;
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(nextCaret, nextCaret);
      });
    },
    [ref, trigger, value, onChange, dismiss],
  );

  const isOpen = trigger !== null && suggestions.length > 0;

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!isOpen) return false;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        apply(suggestions[activeIndex]);
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss();
        return true;
      }
      return false;
    },
    [isOpen, suggestions, activeIndex, apply, dismiss],
  );

  const menu: ReactNode = isOpen ? (
    <div
      className="absolute bottom-full left-0 z-50 mb-1 w-64 max-h-64 overflow-y-auto bg-site-bg border border-site-border rounded-site shadow-xl py-1"
      onMouseDown={(e) => e.preventDefault()}
    >
      {suggestions.map((s, i) => (
        <button
          key={s.name}
          type="button"
          className={`flex items-center gap-2 w-full px-3 py-2 text-left transition-colors ${
            i === activeIndex ? 'bg-site-surface' : 'hover:bg-site-surface/60'
          }`}
          onMouseEnter={() => setActiveIndex(i)}
          onClick={() => apply(s)}
        >
          <span className="w-7 h-7 shrink-0 flex items-center justify-center text-lg">{s.emoji}</span>
          <span className="text-sm text-site-text truncate">:{s.name}:</span>
        </button>
      ))}
    </div>
  ) : null;

  return { onValueChange, onKeyDown, menu, dismiss };
}
