'use client';

import { useEffect, useRef, useState, useCallback, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck } from 'lucide-react';

interface UserSuggestion {
  id: string;
  name: string | null;
  image: string | null;
  handle: string | null;
  username: string | null;
  isVerified?: boolean;
}

interface HandleInputProps {
  value: string;
  onChange: (next: string) => void;
  /** Allow several handles (comma-separated); otherwise a single handle. */
  multiple?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  'aria-label'?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}

/** The handle fragment currently being typed (after the last comma in multi mode). */
function currentToken(value: string, multiple: boolean): { token: string; start: number } {
  if (!multiple) {
    const t = value.replace(/^\s*@?/, '');
    return { token: t, start: 0 };
  }
  const lastComma = value.lastIndexOf(',');
  const rawStart = lastComma + 1;
  const tail = value.slice(rawStart);
  const leading = tail.length - tail.replace(/^\s*@?/, '').length;
  return { token: tail.replace(/^\s*@?/, ''), start: rawStart + leading };
}

function highlight(text: string | null | undefined, query: string) {
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

/**
 * Single-line input with the same @handle autocomplete the feed composer uses
 * (backed by /api/feed/mention-search). Use `multiple` for comma-separated
 * fields like group-chat members.
 */
export function HandleInput({ value, onChange, multiple = false, placeholder, className, id, onKeyDown, ...rest }: HandleInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const requestSeq = useRef(0);

  const { t } = useTranslation('feed');
  const { token, start } = currentToken(value, multiple);

  const close = useCallback(() => {
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    if (token.trim().length < 1) {
      close();
      return;
    }
    const seq = ++requestSeq.current;
    setLoading(true);
    setOpen(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/feed/mention-search?q=${encodeURIComponent(token)}`, { credentials: 'include' });
        if (seq !== requestSeq.current) return;
        const data = await res.json();
        setSuggestions(data.users ?? []);
        setActiveIndex(0);
      } catch {
        if (seq === requestSeq.current) setSuggestions([]);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [token, close]);

  const apply = useCallback(
    (user: UserSuggestion) => {
      const handle = user.handle ?? user.username ?? '';
      if (!handle) return;
      if (!multiple) {
        onChange(handle);
      } else {
        const before = value.slice(0, start);
        onChange(`${before}${handle}, `);
      }
      close();
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [multiple, onChange, value, start, close],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (open && suggestions.length > 0) {
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
        apply(suggestions[activeIndex]);
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
      <input
        {...rest}
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        className={className}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(close, 120)}
        autoComplete="off"
      />

      {open && (loading || suggestions.length > 0) && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto glass-overlay py-1"
          onMouseDown={(e) => e.preventDefault()}
        >
          {loading && suggestions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-site-text-dim">{t("searching", { defaultValue: "Searching…" })}</div>
          ) : (
            suggestions.map((u, i) => (
              <button
                key={u.id}
                type="button"
                className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                  i === activeIndex ? 'bg-site-surface' : 'hover:bg-site-surface/60'
                }`}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => apply(u)}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-xs font-bold text-site-text">
                  {u.image ? (
                    <img
                      src={u.image}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/images/social/default_avatar.png';
                      }}
                    />
                  ) : (
                    (u.name?.[0] || u.handle?.[0] || 'U').toUpperCase()
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 truncate text-sm text-site-text">
                    {highlight(u.name || u.handle, token)}
                    {u.isVerified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-site-accent" />}
                  </span>
                  <span className="block truncate text-xs text-site-text-dim">@{highlight(u.handle ?? u.username, token)}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
