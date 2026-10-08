'use client';

/**
 * The shared playing-card kit behind Solitaire and Spider: the card model and
 * deck utilities, the CSS/SVG card face and Aero card back, table sizing (a
 * ResizeObserver turns the felt's width into a card width), fan compression,
 * the pointer-drag helper, slide-in animation bookkeeping, and the bits of
 * chrome both games share (menu bar, status bar, dialogs, win cascade).
 *
 * Layout is numeric: every card has an (x, y) on the table, so moves animate
 * by mounting the card at its new pile with a CSS keyframe that starts from
 * its previous position. Dragging writes `transform` straight to the dragged
 * elements — no React state per pointer move and no animation-frame loop.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { PopupMenu, type MenuItem } from '../Menu';
import { useOs } from '../store';
import { sfx } from '../../sound';

/* ------------------------------------------------------------------ model */

export type Suit = 'S' | 'H' | 'D' | 'C';

export interface Card {
  id: number;
  suit: Suit;
  /** 1 = ace … 13 = king. */
  rank: number;
  up: boolean;
}

export const ALL_SUITS: Suit[] = ['S', 'H', 'D', 'C'];

export const isRed = (s: Suit) => s === 'H' || s === 'D';

export const RANK_SHORT = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function topOf<T>(pile: T[]): T | undefined {
  return pile[pile.length - 1];
}

/** Fisher–Yates; returns a new array. */
export function shuffle<T>(list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** `copies` × (every suit in `suits` × 13 ranks), all face down, ids 0…n-1. */
export function makeDeck(suits: Suit[], copies: number): Card[] {
  const out: Card[] = [];
  let id = 0;
  for (let c = 0; c < copies; c++)
    for (const suit of suits)
      for (let rank = 1; rank <= 13; rank++) out.push({ id: id++, suit, rank, up: false });
  return out;
}

export const faceUp = (c: Card): Card => (c.up ? c : { ...c, up: true });
export const faceDown = (c: Card): Card => (c.up ? { ...c, up: false } : c);

/* ------------------------------------------------------------- text/i18n */

export function useCardText() {
  const { t } = useTranslation('c-dunesday');
  return useMemo(() => {
    const ranks = [
      '',
      t('cards-rank-1', { defaultValue: 'Ace' }),
      t('cards-rank-2', { defaultValue: '2' }),
      t('cards-rank-3', { defaultValue: '3' }),
      t('cards-rank-4', { defaultValue: '4' }),
      t('cards-rank-5', { defaultValue: '5' }),
      t('cards-rank-6', { defaultValue: '6' }),
      t('cards-rank-7', { defaultValue: '7' }),
      t('cards-rank-8', { defaultValue: '8' }),
      t('cards-rank-9', { defaultValue: '9' }),
      t('cards-rank-10', { defaultValue: '10' }),
      t('cards-rank-11', { defaultValue: 'Jack' }),
      t('cards-rank-12', { defaultValue: 'Queen' }),
      t('cards-rank-13', { defaultValue: 'King' }),
    ];
    const suits: Record<Suit, string> = {
      S: t('cards-suit-s', { defaultValue: 'spades' }),
      H: t('cards-suit-h', { defaultValue: 'hearts' }),
      D: t('cards-suit-d', { defaultValue: 'diamonds' }),
      C: t('cards-suit-c', { defaultValue: 'clubs' }),
    };
    const name = (c: Card) =>
      t('cards-name', {
        defaultValue: '{{rank}} of {{suit}}',
        rank: ranks[c.rank],
        suit: suits[c.suit],
      });
    /** What a screen reader hears for one card. */
    const label = (c: Card) =>
      c.up ? name(c) : t('cards-face-down', { defaultValue: 'Face-down card' });
    /** "Tableau 3, 7 of hearts face up, 4 cards". */
    const pile = (pileName: string, cards: Card[]) => {
      const top = topOf(cards);
      const desc = !top
        ? t('cards-empty', { defaultValue: 'empty' })
        : top.up
          ? t('cards-top-up', { defaultValue: '{{card}} face up', card: name(top) })
          : t('cards-top-down', { defaultValue: 'face down' });
      return t('cards-pile-label', {
        defaultValue: '{{pile}}, {{top}}, {{n}} cards',
        pile: pileName,
        top: desc,
        n: cards.length,
      });
    };
    return { name, label, pile };
  }, [t]);
}

/* ----------------------------------------------------------------- visuals */

const SUIT_SHAPES: Record<Suit, ReactNode> = {
  H: (
    <path d="M50 90C22 68 5 51 5 31 5 16 16 6 29 6c9 0 17 6 21 14 4-8 12-14 21-14 13 0 24 10 24 25 0 20-17 37-45 59Z" />
  ),
  D: <path d="M50 4 87 50 50 96 13 50Z" />,
  S: (
    <path d="M50 4C40 22 6 40 6 61c0 13 10 22 22 22 8 0 14-4 17-9-1 10-6 17-14 22h38c-8-5-13-12-14-22 3 5 9 9 17 9 12 0 22-9 22-22C94 40 60 22 50 4Z" />
  ),
  C: (
    <>
      <circle cx="50" cy="28" r="21" />
      <circle cx="27" cy="58" r="21" />
      <circle cx="73" cy="58" r="21" />
      <path d="M45 48c0 20-4 36-14 48h38c-10-12-14-28-14-48Z" />
    </>
  ),
};

export function SuitGlyph({ suit, className }: { suit: Suit; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" focusable="false">
      {SUIT_SHAPES[suit]}
    </svg>
  );
}

type SpanProps = HTMLAttributes<HTMLSpanElement> & {
  [key: `data-${string}`]: string | number | undefined;
};

/** One card, face or back. Positioned by the caller through `style`. */
export function CardView({
  card,
  label,
  className,
  ...rest
}: { card: Card; label: string } & SpanProps) {
  const court = card.rank > 10;
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        'ds-card',
        card.up ? (isRed(card.suit) ? 'ds-card--red' : 'ds-card--black') : 'ds-card--back',
        className,
      )}
      {...rest}
    >
      {card.up && (
        <>
          <span className="ds-card__corner ds-card__corner--tl" aria-hidden="true">
            <span className="ds-card__rank">{RANK_SHORT[card.rank]}</span>
            <SuitGlyph suit={card.suit} className="ds-card__mini" />
          </span>
          <span
            className={cn(
              'ds-card__center',
              court && 'ds-card__center--court',
              card.rank === 1 && 'ds-card__center--ace',
            )}
            aria-hidden="true"
          >
            {court && <span className="ds-card__court">{RANK_SHORT[card.rank]}</span>}
            <SuitGlyph suit={card.suit} className="ds-card__pip" />
          </span>
          <span className="ds-card__corner ds-card__corner--br" aria-hidden="true">
            <span className="ds-card__rank">{RANK_SHORT[card.rank]}</span>
            <SuitGlyph suit={card.suit} className="ds-card__mini" />
          </span>
        </>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ sizing */

/** Measures the felt. Returns [ref, {w, h}] — 0×0 until the first measure. */
export function useTableSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export interface Metrics {
  gap: number;
  cw: number;
  ch: number;
  left: number;
  colX: (i: number) => number;
}

/**
 * Card width from the table: `cols` columns plus gutters must fit the width,
 * and `heightInCards` card heights must fit the height. Aspect stays 5:7.
 */
export function cardMetrics(w: number, h: number, cols: number, heightInCards: number): Metrics {
  const gap = Math.max(3, Math.min(14, Math.round(w * 0.014)));
  const byWidth = Math.floor((w - gap * (cols + 1)) / cols);
  const byHeight = Math.floor((h - gap * 3) / heightInCards / 1.4);
  const cw = Math.max(16, Math.min(byWidth, byHeight, 116));
  const ch = Math.round(cw * 1.4);
  const left = Math.max(gap, Math.round((w - (cols * cw + (cols - 1) * gap)) / 2));
  return { gap, cw, ch, left, colX: (i) => left + i * (cw + gap) };
}

/**
 * Vertical offsets for a fanned column: face-down cards step `downF`×height,
 * face-up `upF`×height; if the column would overflow `avail`, every step is
 * compressed by the same factor so the last card still fits.
 */
export function fanOffsets(
  cards: Card[],
  ch: number,
  avail: number,
  downF: number,
  upF: number,
): number[] {
  const raw = [0];
  let total = 0;
  for (let i = 1; i < cards.length; i++) {
    total += cards[i - 1].up ? ch * upF : ch * downF;
    raw.push(total);
  }
  const k = total > 0 && total + ch > avail ? Math.max(0.04, (avail - ch) / total) : 1;
  return raw.map((y) => Math.round(y * k));
}

/* ------------------------------------------------------------------ motion */

/** True when animations should run: the OS allows them and Dunesday isn't "still". */
export function motionOK(el: Element | null): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return false;
  return !el?.closest('.ds-os--still');
}

/** Where a card sits on the table (relative to the felt) and which pile owns it. */
export interface Pos {
  x: number;
  y: number;
  pile: number;
}

export interface Slide {
  fx: number;
  fy: number;
  i: number;
}

/**
 * Remembers every card's position from the last commit. When `version` (the
 * game state) changes, any card now in a different pile gets a slide from its
 * old spot — or from where it was dropped, if `drops` has it.
 */
export function useSlides(pos: Map<number, Pos>, version: unknown) {
  const prev = useRef<Map<number, Pos>>(new Map());
  const drops = useRef<Map<number, { x: number; y: number }>>(new Map());
  const slides = useMemo(() => {
    const out = new Map<number, Slide>();
    let i = 0;
    for (const [id, p] of pos) {
      const d = drops.current.get(id);
      const q = prev.current.get(id);
      if (d) out.set(id, { fx: d.x - p.x, fy: d.y - p.y, i: 0 });
      else if (q && q.pile !== p.pile && (q.x !== p.x || q.y !== p.y))
        out.set(id, { fx: q.x - p.x, fy: q.y - p.y, i: i++ });
    }
    return out;
    // Recomputed only when the game changes, never on resize or a timer tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  useEffect(() => {
    prev.current = pos;
    drops.current.clear();
  });
  /** Next commit animates every card in from (x, y) — the deal. */
  const dealFrom = useCallback((x: number, y: number) => {
    const all = new Map<number, Pos>();
    for (const [id] of prev.current) all.set(id, { x, y, pile: -1 });
    prev.current = all;
  }, []);
  return { slides, drops, dealFrom };
}

/* ------------------------------------------------------------------- drag */

export interface DragOptions {
  event: React.PointerEvent<HTMLElement>;
  /** The card elements to carry, the grabbed card first. Empty = click only. */
  elements: HTMLElement[];
  onClick: () => void;
  /** Called with the grabbed card's rect; return true if the drop was taken. */
  onDrop: (head: DOMRect, rects: DOMRect[]) => boolean;
  motion: boolean;
}

/**
 * Pointer drag for mouse, touch and pen. Under a 5px threshold it is a click.
 * While dragging, `transform` is written directly to the carried elements.
 * A refused drop eases back (CSS transition class) or snaps without motion.
 */
export function startCardDrag({ event, elements, onClick, onDrop, motion }: DragOptions) {
  if (event.button !== 0) return;
  const sx = event.clientX;
  const sy = event.clientY;
  const pid = event.pointerId;
  const host = event.currentTarget;
  let dragging = false;
  try {
    host.setPointerCapture(pid);
  } catch {
    /* capture is a nicety */
  }
  const reset = (el: HTMLElement) => {
    el.style.transform = '';
    el.style.zIndex = '';
    el.classList.remove('ds-card--dragging', 'ds-card--returning');
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== pid) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (!dragging) {
      if (!elements.length || Math.hypot(dx, dy) < 5) return;
      dragging = true;
      elements.forEach((el, i) => {
        el.classList.add('ds-card--dragging');
        el.style.zIndex = String(1000 + i);
      });
    }
    const tr = `translate(${dx}px, ${dy}px)`;
    for (const el of elements) el.style.transform = tr;
  };
  const end = (e: PointerEvent) => {
    if (e.pointerId !== pid) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    try {
      host.releasePointerCapture(pid);
    } catch {
      /* already released */
    }
    if (!dragging) {
      if (e.type === 'pointerup') onClick();
      return;
    }
    const rects = elements.map((el) => el.getBoundingClientRect());
    if (e.type === 'pointerup' && onDrop(rects[0], rects)) {
      // The cards remount in their new pile; tidy any node React kept.
      setTimeout(() => elements.forEach(reset), 60);
      return;
    }
    for (const el of elements) {
      if (motion) el.classList.add('ds-card--returning');
      el.classList.remove('ds-card--dragging');
      el.style.transform = '';
    }
    setTimeout(() => elements.forEach(reset), motion ? 240 : 0);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

/** Overlap area of two rects (0 when apart). */
export function overlapArea(a: DOMRect, b: DOMRect): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/* ------------------------------------------------------------------- piles */

export interface PileCard {
  card: Card;
  /** Offset from the pile's origin. */
  x: number;
  y: number;
  /** Index in the game pile. */
  i: number;
  /** Can be picked up / clicked as itself. */
  grab: boolean;
}

export interface PileSpec {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  cards: PileCard[];
  label: string;
  slot?: 'plain' | 'ace' | 'king' | 'recycle' | 'none';
  /** Display only (Spider's completed runs) — not a focusable button. */
  static?: boolean;
}

export function PileView({
  spec,
  cw,
  ch,
  slides,
  cardLabel,
  selectedFrom,
  hintFrom,
  hintTarget,
  onPointerDown,
  onActivate,
  onDoubleClick,
}: {
  spec: PileSpec;
  cw: number;
  ch: number;
  slides: Map<number, Slide>;
  cardLabel: (c: Card) => string;
  /** Highlight cards with index ≥ this (keyboard selection). */
  selectedFrom?: number;
  hintFrom?: number;
  hintTarget?: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>, pile: number) => void;
  onActivate: (pile: number) => void;
  onDoubleClick?: (pile: number) => void;
}) {
  const style: CSSProperties = { left: spec.x, top: spec.y, width: spec.w, height: spec.h };
  const body = (
    <>
      {spec.cards.length === 0 && spec.slot !== 'none' && (
        <span
          className={cn('ds-pile__slot', `ds-pile__slot--${spec.slot ?? 'plain'}`)}
          style={{ width: cw, height: ch }}
          aria-hidden="true"
        />
      )}
      {spec.cards.map(({ card, x, y, i, grab }) => {
        const s = slides.get(card.id);
        const cardStyle = {
          left: x,
          top: y,
          width: cw,
          height: ch,
          ...(s ? { '--fx': `${s.fx}px`, '--fy': `${s.fy}px`, '--i': Math.min(s.i, 40) } : null),
        } as CSSProperties;
        return (
          <CardView
            key={card.id}
            card={card}
            label={cardLabel(card)}
            data-ci={grab ? i : undefined}
            className={cn(
              s && 'ds-card--slide',
              selectedFrom !== undefined && i >= selectedFrom && 'ds-card--selected',
              hintFrom !== undefined && i >= hintFrom && 'ds-card--hint',
            )}
            style={cardStyle}
          />
        );
      })}
    </>
  );
  if (spec.static)
    return (
      <div className="ds-pile ds-pile--static" style={style} role="group" aria-label={spec.label}>
        {body}
      </div>
    );
  return (
    <button
      type="button"
      className={cn(
        'ds-pile',
        selectedFrom !== undefined && 'ds-pile--selected',
        hintTarget && 'ds-pile--hint',
      )}
      style={style}
      data-pile={spec.id}
      aria-label={spec.label}
      aria-pressed={selectedFrom !== undefined}
      onPointerDown={(e) => onPointerDown(e, spec.id)}
      // Pointer clicks are handled by the drag helper; detail 0 = keyboard / AT.
      onClick={(e) => {
        if (e.detail === 0) onActivate(spec.id);
      }}
      onDoubleClick={onDoubleClick ? () => onDoubleClick(spec.id) : undefined}
    >
      {body}
    </button>
  );
}

/** Index of the drop target with the largest overlap among `legal` piles, or -1. */
export function pickDropTarget(
  table: HTMLElement | null,
  head: DOMRect,
  legal: (pile: number) => boolean,
): number {
  let best = -1;
  let bestArea = 0;
  table?.querySelectorAll<HTMLElement>('[data-pile]').forEach((el) => {
    const pile = Number(el.dataset.pile);
    if (!legal(pile)) return;
    const a = overlapArea(head, el.getBoundingClientRect());
    if (a > bestArea) {
      bestArea = a;
      best = pile;
    }
  });
  return best;
}

/** The dragged elements of a pile button: every grab-able card at index ≥ i. */
export function cardsFrom(btn: HTMLElement, i: number): HTMLElement[] {
  return [...btn.querySelectorAll<HTMLElement>('[data-ci]')].filter(
    (el) => Number(el.dataset.ci) >= i,
  );
}

/** Arrow Left / Right walk focus across the piles of a table. */
export function arrowNav(
  e: Pick<KeyboardEvent, 'key' | 'preventDefault'>,
  root: HTMLElement | null,
) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const piles = [...(root?.querySelectorAll<HTMLElement>('[data-pile]') ?? [])];
  const i = piles.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  e.preventDefault();
  piles[(i + (e.key === 'ArrowRight' ? 1 : -1) + piles.length) % piles.length]?.focus();
}

/* ----------------------------------------------------------------- storage */

export function loadJSON<T extends object>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? { ...fallback, ...(parsed as Partial<T>) }
      : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota — stats are a nicety */
  }
}

export interface CardStats {
  played: number;
  won: number;
  best: number;
}

/* ---------------------------------------------------------------- keyboard */

/** Window-level shortcuts, live only while this Dunesday window is active. */
export function useWindowKeys(winId: string, handler: (e: KeyboardEvent) => void) {
  const active = useOs((s) => s.activeId === winId);
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!active) return;
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (el?.closest?.('[role="menu"], [role="dialog"]')) return;
      ref.current(e);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [active]);
}

/** Polite live-region text; repeating a message still re-announces it. */
export function useAnnouncer() {
  const [msg, setMsg] = useState('');
  const announce = useCallback(
    (m: string) => setMsg((prev) => (prev === m ? m + String.fromCharCode(160) : m)),
    [],
  );
  return [msg, announce] as const;
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/* ----------------------------------------------------------------- chrome */

export interface CardsMenu {
  key: string;
  label: string;
  items: MenuItem[];
}

export function CardsMenuBar({ menus }: { menus: CardsMenu[] }) {
  const [open, setOpen] = useState<{ key: string; x: number; y: number } | null>(null);
  const wasOpen = useRef(false);
  const close = useCallback(() => setOpen(null), []);
  const current = open ? menus.find((m) => m.key === open.key) : undefined;
  return (
    <div className="ds-cards__menubar">
      {menus.map((m) => (
        <button
          key={m.key}
          type="button"
          className={cn('ds-cards__menubtn', open?.key === m.key && 'is-open')}
          aria-haspopup="menu"
          aria-expanded={open?.key === m.key}
          onPointerDown={() => {
            wasOpen.current = open?.key === m.key;
          }}
          onClick={(e) => {
            if (wasOpen.current) {
              wasOpen.current = false;
              return;
            }
            const r = e.currentTarget.getBoundingClientRect();
            sfx.tick();
            setOpen({ key: m.key, x: r.left, y: r.bottom });
          }}
        >
          {m.label}
        </button>
      ))}
      {open && current && (
        <PopupMenu
          at={{ x: open.x, y: open.y }}
          items={current.items}
          label={current.label}
          onClose={close}
        />
      )}
    </div>
  );
}

export function CardsStatus({
  score,
  moves,
  seconds,
  message,
}: {
  score: number;
  moves: number;
  seconds: number;
  message?: string;
}) {
  const { t } = useTranslation('c-dunesday');
  return (
    <div className="ds-cards__status">
      <span className="ds-cards__status-msg">{message}</span>
      <span>{t('cards-score', { defaultValue: 'Score: {{n}}', n: score })}</span>
      <span>{t('cards-moves', { defaultValue: 'Moves: {{n}}', n: moves })}</span>
      <span>{t('cards-time', { defaultValue: 'Time: {{time}}', time: formatTime(seconds) })}</span>
    </div>
  );
}

export interface DialogAction {
  label: string;
  onClick: () => void;
}

/** A small in-app modal over the card table. Escape = `onClose`. */
export function CardsDialog({
  title,
  children,
  actions,
  onClose,
  tone,
}: {
  title: string;
  children: ReactNode;
  actions: DialogAction[];
  onClose: () => void;
  tone?: 'win';
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    return () => prev?.focus?.();
  }, []);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Tab') {
      const btns = [...(ref.current?.querySelectorAll<HTMLElement>('button') ?? [])];
      if (!btns.length) return;
      const i = btns.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length]?.focus();
    }
  };
  return (
    <div className={cn('ds-cards__scrim', tone === 'win' && 'ds-cards__scrim--win')}>
      <div
        ref={ref}
        className={cn('ds-cards__dialog', tone === 'win' && 'ds-cards__dialog--win')}
        role="dialog"
        onKeyDown={onKey}
        aria-modal="true"
        aria-labelledby={id}
      >
        <h2 id={id} className="ds-cards__dialog-title">
          {title}
        </h2>
        <div className="ds-cards__dialog-body">{children}</div>
        <div className="ds-cards__dialog-actions">
          {actions.map((a) => (
            <button key={a.label} type="button" className="ds-btn7" onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StatsDialog({
  stats,
  onReset,
  onClose,
}: {
  stats: CardStats;
  onReset: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('c-dunesday');
  const pct = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
  return (
    <CardsDialog
      title={t('cards-stats-title', { defaultValue: 'Statistics' })}
      onClose={onClose}
      actions={[
        { label: t('cards-ok', { defaultValue: 'OK' }), onClick: onClose },
        { label: t('cards-stats-reset', { defaultValue: 'Reset' }), onClick: onReset },
      ]}
    >
      <dl className="ds-cards__stats">
        <dt>{t('cards-stats-played', { defaultValue: 'Games played' })}</dt>
        <dd>{stats.played}</dd>
        <dt>{t('cards-stats-won', { defaultValue: 'Games won' })}</dt>
        <dd>{stats.won}</dd>
        <dt>{t('cards-stats-rate', { defaultValue: 'Win percentage' })}</dt>
        <dd>{pct}%</dd>
        <dt>{t('cards-stats-best', { defaultValue: 'Best score' })}</dt>
        <dd>{stats.best}</dd>
      </dl>
    </CardsDialog>
  );
}

/**
 * The win celebration: cards leap off the foundations and bounce across the
 * felt. Pure CSS keyframes (an X drift on the wrapper, a gravity bounce on the
 * card); the stylesheet only shows it when motion is allowed.
 */
export function WinCascade({
  origins,
  cw,
  ch,
  w,
  h,
  suits,
}: {
  origins: { x: number; y: number }[];
  cw: number;
  ch: number;
  w: number;
  h: number;
  suits: Suit[];
}) {
  const items = useMemo(() => {
    const out = [];
    for (let i = 0; i < 26; i++) {
      const o = origins[i % origins.length] ?? { x: 0, y: 0 };
      const jitter = ((i * 37) % 23) / 23;
      const dir = (i * 7) % 3 === 0 ? 1 : -1;
      out.push({
        key: i,
        x: o.x,
        y: o.y,
        dx: Math.round(dir * (0.35 + jitter * 0.6) * w),
        drop: Math.max(0, Math.round(h - ch - o.y)),
        delay: (i * 0.2).toFixed(2),
        card: {
          id: 10_000 + i,
          suit: suits[i % suits.length],
          rank: 13 - (Math.floor(i / origins.length) % 13),
          up: true,
        } as Card,
      });
    }
    return out;
  }, [origins, w, h, ch, suits]);
  return (
    <div className="ds-cards__cascade" aria-hidden="true">
      {items.map((it) => (
        <span
          key={it.key}
          className="ds-cards__fly"
          style={
            {
              left: it.x,
              top: it.y,
              '--dx': `${it.dx}px`,
              '--drop': `${it.drop}px`,
              '--delay': `${it.delay}s`,
            } as CSSProperties
          }
        >
          <CardView
            card={it.card}
            label=""
            className="ds-cards__bounce"
            style={{ width: cw, height: ch }}
          />
        </span>
      ))}
    </div>
  );
}
