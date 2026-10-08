'use client';

import { useEffect, useRef, useState, useCallback, type KeyboardEvent } from'react';
import { useTranslation } from'react-i18next';
import { BadgeCheck } from'lucide-react';
import { AnchoredMenu } from '@/components/ui/anchored-menu';

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
 const t = value.replace(/^\s*@?/,'');
 return { token: t, start: 0 };
 }
 const lastComma = value.lastIndexOf(',');
 const rawStart = lastComma + 1;
 const tail = value.slice(rawStart);
 const leading = tail.length - tail.replace(/^\s*@?/,'').length;
 return { token: tail.replace(/^\s*@?/,''), start: rawStart + leading };
}

function highlight(text: string | null | undefined, query: string) {
 const value = text ??'';
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
 * (backed by /api/feed/mention-search). Use `multiple`for comma-separated
 * fields like group-chat members.
 */
export function HandleInput({ value, onChange, multiple = false, placeholder, className, id, onKeyDown, ...rest }: HandleInputProps) {
 const inputRef = useRef<HTMLInputElement>(null);
 const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
 const [open, setOpen] = useState(false);
 const [activeIndex, setActiveIndex] = useState(0);
 const [loading, setLoading] = useState(false);
 const requestSeq = useRef(0);
 // The wrapper is the anchor AnchoredMenu measures against and the element an
 // outside press is tested inside, so a press on the field itself never closes
 // the panel. AnchoredMenu owns the enter/exit animation and the presence hold.
 const boxRef = useRef<HTMLDivElement>(null);
 const popOpen = open && (loading || suggestions.length > 0);

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
 const res = await fetch(`/api/feed/mention-search?q=${encodeURIComponent(token)}`, { credentials:'include'});
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
 const handle = user.handle ?? user.username ??'';
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
 if (e.key ==='ArrowDown') {
 e.preventDefault();
 setActiveIndex((i) => (i + 1) % suggestions.length);
 return;
 }
 if (e.key ==='ArrowUp') {
 e.preventDefault();
 setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
 return;
 }
 if (e.key ==='Enter'|| e.key ==='Tab') {
 e.preventDefault();
 apply(suggestions[activeIndex]);
 return;
 }
 if (e.key ==='Escape') {
 e.preventDefault();
 close();
 return;
 }
 }
 onKeyDown?.(e);
 };

 return (
 <div className="relative"ref={boxRef}>
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

 {/* PORTALLED. In place this was `absolute … z-50`, and z-50 is not what it
 looks like here: `RankedColumn` puts `LIFT_CARD` (a `hover:-translate-y-0.5`)
 on the section that holds this field, so WHILE THE POINTER IS OVER IT — which
 it is, because you just clicked the field — that section is a stacking context
 and its whole subtree paints before the block below. You saw the first row or
 two and the rest went under the challenge cards; move the pointer away and it
 popped into view, so it read as intermittent, and on touch it never reproduced
 at all. No z-index inside a transformed ancestor can fix that. Dropping the
 hover lift would only leave the trap for the next card that gains one.
 `focusOnOpen={false}`: this is a combobox and focus must stay in the input. */}
 <AnchoredMenu
 open={popOpen}
 onClose={close}
 anchorRef={boxRef}
 role="listbox"
 align="start"
 focusOnOpen={false}
 label={t("searching", { defaultValue:"Searching…"})}
 className="w-[var(--anchored-menu-anchor-w)] max-h-60"
 >
 {loading && suggestions.length === 0 ? (
 <div className="px-3 py-2 text-xs text-site-text-dim">{t("searching", { defaultValue:"Searching…"})}</div>
 ) : (
 suggestions.map((u, i) => (
 <button
 key={u.id}
 type="button"
 className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
 i === activeIndex ?'bg-site-surface-active':'hover:bg-site-surface-hover'
 }`}
 onMouseEnter={() => setActiveIndex(i)}
 // Keeps the input focused: the field's `onBlur` closes the list, so
 // without this the press would dismiss the panel before its own
 // click landed. It lived on the panel wrapper before this file
 // portalled; a bare div carrying a pointer handler is a static
 // interactive element, and the rows are already buttons.
 onMouseDown={(e) => e.preventDefault()}
 onClick={() => apply(u)}
 >
 <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-xs font-bold text-site-text">
 {u.image ? (
 <img
 src={u.image}
 alt=""
 className="h-full w-full object-cover"
 onError={(e) => {
 (e.target as HTMLImageElement).src ='/images/social/default_avatar.png';
 }}
 />
 ) : (
 (u.name?.[0] || u.handle?.[0] ||'U').toUpperCase()
 )}
 </span>
 <span className="min-w-0 flex-1">
 <span className="flex items-center gap-1 truncate text-sm text-site-text">
 {highlight(u.name || u.handle, token)}
 {u.isVerified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-site-accent"/>}
 </span>
 <span className="block truncate text-xs text-site-text-dim">@{highlight(u.handle ?? u.username, token)}</span>
 </span>
 </button>
 ))
 )}
 </AnchoredMenu>
 </div>
 );
}
