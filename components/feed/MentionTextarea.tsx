'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from 'react';
import { BadgeCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getCaretCoordinates } from '@/lib/feed/caret-coordinates';

interface UserSuggestion {
  id: string;
  name: string | null;
  image: string | null;
  handle: string | null;
  username: string | null;
  isVerified?: boolean;
}

interface TagSuggestion {
  tag: string;
  count: number;
}

type Trigger = {
  type: '@' | '#';
  query: string;
  /** Index of the trigger char ('@' or '#') in the value. */
  start: number;
};

type Suggestion =
  | { kind: 'user'; user: UserSuggestion }
  | { kind: 'tag'; tag: TagSuggestion };

// Match a trigger token immediately before the caret: an `@` or `#` that starts
// the string or follows whitespace, followed by word characters being typed.
const TRIGGER_REGEX = /(?:^|\s)([@#])(\w*)$/;

/**
 * Render `text` with the first case-insensitive occurrence of `query` bolded,
 * so the part the user has typed so far stands out in each suggestion row.
 */
function highlightMatch(text: string | null | undefined, query: string) {
  const value = text ?? '';
  if (!query) return value;
  const idx = value.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return value;
  return (
    <>
      {value.slice(0, idx)}
      <span className="font-semibold text-site-text">{value.slice(idx, idx + query.length)}</span>
      {value.slice(idx + query.length)}
    </>
  );
}

interface MentionTextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (next: string) => void;
}

export const MentionTextarea = forwardRef<HTMLTextAreaElement, MentionTextareaProps>(
  function MentionTextarea({ value, onChange, onKeyDown, ...props }, forwardedRef) {
    const { t: tl } = useTranslation('feed');
    const innerRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(forwardedRef, () => innerRef.current as HTMLTextAreaElement, []);

    const [trigger, setTrigger] = useState<Trigger | null>(null);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
    const [loading, setLoading] = useState(false);

    // Ignore stale fetches and re-open the menu only for fresh input.
    const requestSeq = useRef(0);

    const close = useCallback(() => {
      setTrigger(null);
      setSuggestions([]);
      setActiveIndex(0);
      setPosition(null);
    }, []);

    // Detect the active trigger token from the caret position.
    const syncTrigger = useCallback((el: HTMLTextAreaElement) => {
      const caret = el.selectionStart ?? 0;
      const before = el.value.slice(0, caret);
      const match = before.match(TRIGGER_REGEX);
      if (!match) {
        close();
        return;
      }
      const [, type, query] = match;
      const start = caret - query.length - 1;
      setTrigger({ type: type as '@' | '#', query, start });

      const caretCoords = getCaretCoordinates(el, start);
      setPosition({
        top: caretCoords.top + caretCoords.height + 2,
        left: caretCoords.left,
      });
    }, [close]);

    // Fetch suggestions whenever the trigger/query changes (debounced).
    useEffect(() => {
      if (!trigger) return;
      const seq = ++requestSeq.current;
      setLoading(true);
      const timer = setTimeout(async () => {
        try {
          const endpoint =
            trigger.type === '@'
              ? `/api/feed/mention-search?q=${encodeURIComponent(trigger.query)}`
              : `/api/feed/hashtag-search?q=${encodeURIComponent(trigger.query)}`;
          const res = await fetch(endpoint);
          if (seq !== requestSeq.current) return;
          const data = await res.json();
          const next: Suggestion[] =
            trigger.type === '@'
              ? (data.users ?? []).map((user: UserSuggestion) => ({ kind: 'user', user }))
              : (data.tags ?? []).map((tag: TagSuggestion) => ({ kind: 'tag', tag }));
          setSuggestions(next);
          setActiveIndex(0);
        } catch {
          if (seq === requestSeq.current) setSuggestions([]);
        } finally {
          if (seq === requestSeq.current) setLoading(false);
        }
      }, 120);
      return () => clearTimeout(timer);
    }, [trigger]);

    const applySuggestion = useCallback(
      (suggestion: Suggestion) => {
        const el = innerRef.current;
        if (!el || !trigger) return;
        const caret = el.selectionStart ?? value.length;
        const insertion =
          suggestion.kind === 'user'
            ? `@${suggestion.user.handle ?? suggestion.user.username ?? ''}`
            : `#${suggestion.tag.tag}`;
        const next = `${value.slice(0, trigger.start)}${insertion} ${value.slice(caret)}`;
        onChange(next);
        close();
        // Restore the caret just past the inserted token + trailing space.
        const nextCaret = trigger.start + insertion.length + 1;
        requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(nextCaret, nextCaret);
        });
      },
      [trigger, value, onChange, close],
    );

    const isOpen = trigger !== null && (loading || suggestions.length > 0);
    const query = trigger?.query ?? '';

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (isOpen && suggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveIndex((i) => (i + 1) % suggestions.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          applySuggestion(suggestions[activeIndex]);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
          return;
        }
      }
      onKeyDown?.(e);
    };

    return (
      <div className="relative">
        <textarea
          // We surface our own @/# typing indicators, so suppress the browser's
          // native autocomplete/suggestion "select box" that would overlap them.
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          {...props}
          ref={innerRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            syncTrigger(e.target);
          }}
          onKeyDown={handleKeyDown}
          onClick={(e) => syncTrigger(e.currentTarget)}
          onBlur={(e) => {
            props.onBlur?.(e);
            // Delay so a click on a suggestion lands before we tear down.
            setTimeout(close, 120);
          }}
        />

        {isOpen && position && (
          <div
            className="absolute z-50 w-64 max-h-64 overflow-y-auto bg-site-bg border border-site-border rounded-xl shadow-xl py-1"
            style={{ top: position.top, left: Math.max(0, position.left) }}
            // Keep focus in the textarea when clicking a row.
            onMouseDown={(e) => e.preventDefault()}
          >
            {loading && suggestions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-site-text-dim">{tl("searching", { defaultValue: "Searching…" })}</div>
            ) : (
              suggestions.map((suggestion, i) => {
                const active = i === activeIndex;
                const rowClass = `flex items-center gap-2 w-full px-3 py-2 text-left transition-colors ${
                  active ? 'bg-site-surface' : 'hover:bg-site-surface/60'
                }`;
                if (suggestion.kind === 'user') {
                  const u = suggestion.user;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      className={rowClass}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => applySuggestion(suggestion)}
                    >
                      <span className="w-7 h-7 rounded-full bg-white/10 shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold text-site-text">
                        {u.image ? (
                          <img
                            src={u.image}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/images/social/default_avatar.png';
                            }}
                          />
                        ) : (
                          (u.name?.[0] || u.handle?.[0] || 'U').toUpperCase()
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1 text-sm text-site-text truncate">
                          {highlightMatch(u.name || u.handle, query)}
                          {u.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-site-accent shrink-0" />}
                        </span>
                        <span className="block text-xs text-site-text-dim truncate">
                          @{highlightMatch(u.handle ?? u.username, query)}
                        </span>
                      </span>
                    </button>
                  );
                }
                const t = suggestion.tag;
                return (
                  <button
                    key={t.tag}
                    type="button"
                    className={rowClass}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => applySuggestion(suggestion)}
                  >
                    <span className="w-7 h-7 rounded-full bg-sky-400/15 text-sky-400 shrink-0 flex items-center justify-center text-sm font-bold">
                      #
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-site-text truncate">
                        #{highlightMatch(t.tag, query)}
                      </span>
                      <span className="block text-xs text-site-text-dim">
                        {tl("tag-post-count", { count: t.count, defaultValue: "{{count}} posts" })}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    );
  },
);
