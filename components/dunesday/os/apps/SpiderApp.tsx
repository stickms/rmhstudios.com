'use client';

/**
 * Spider Solitaire for the Dunesday desktop, after the Windows 7 game: two
 * decks, ten columns, one / two / four suits. Build down regardless of suit,
 * move only same-suit runs, and a finished King-to-Ace run flies off to the
 * foundations. Score starts at 500, −1 per move, +100 per completed run.
 *
 * Piles are numbered: 0 stock, 1–8 completed runs, 9–18 tableau.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppProps } from '../apps';
import type { MenuItem } from '../Menu';
import { sfx } from '../../sound';
import {
  ALL_SUITS,
  CardsDialog,
  CardsMenuBar,
  CardsStatus,
  PileView,
  StatsDialog,
  WinCascade,
  arrowNav,
  cardMetrics,
  cardsFrom,
  faceUp,
  fanOffsets,
  formatTime,
  loadJSON,
  makeDeck,
  motionOK,
  pickDropTarget,
  saveJSON,
  shuffle,
  startCardDrag,
  topOf,
  useAnnouncer,
  useCardText,
  useSlides,
  useTableSize,
  useWindowKeys,
  type Card,
  type CardStats,
  type PileCard,
  type PileSpec,
  type Pos,
  type Suit,
} from './cards';

/* ------------------------------------------------------------------ rules */

const STOCK = 0;
const F0 = 1;
const T0 = 9;
const PILES = 19;
const isTab = (p: number) => p >= T0;

type Suits = 1 | 2 | 4;

interface Game {
  piles: Card[][];
  score: number;
  moves: number;
  suits: Suits;
  done: number;
  startedAt: number | null;
  endedAt: number | null;
  won: boolean;
}

interface Move {
  src: number;
  i: number;
  dst: number;
}

const SUIT_SETS: Record<Suits, Suit[]> = { 1: ['S'], 2: ['S', 'H'], 4: ALL_SUITS };

function newGame(suits: Suits): Game {
  const deck = shuffle(makeDeck(SUIT_SETS[suits], 8 / suits));
  const piles: Card[][] = Array.from({ length: PILES }, () => []);
  let k = 0;
  for (let c = 0; c < 10; c++) {
    const n = c < 4 ? 6 : 5;
    for (let r = 0; r < n; r++) {
      const card = deck[k++];
      piles[T0 + c].push(r === n - 1 ? faceUp(card) : card);
    }
  }
  piles[STOCK] = deck.slice(k);
  return {
    piles,
    score: 500,
    moves: 0,
    suits,
    done: 0,
    startedAt: null,
    endedAt: null,
    won: false,
  };
}

/** Index of the bottom of the movable same-suit run on top of a column, or -1. */
function runStart(pile: Card[]): number {
  let i = pile.length - 1;
  if (i < 0 || !pile[i].up) return -1;
  while (
    i > 0 &&
    pile[i - 1].up &&
    pile[i - 1].suit === pile[i].suit &&
    pile[i - 1].rank === pile[i].rank + 1
  )
    i--;
  return i;
}

function canPick(g: Game, p: number, i: number): boolean {
  if (!isTab(p)) return false;
  const s = runStart(g.piles[p]);
  return s >= 0 && i >= s && i < g.piles[p].length;
}

function legal(g: Game, { src, i, dst }: Move): boolean {
  if (src === dst || !isTab(dst) || !canPick(g, src, i)) return false;
  const top = topOf(g.piles[dst]);
  return !top || top.rank === g.piles[src][i].rank + 1;
}

/** Lift any finished K→A run off column `p` to the next foundation. */
function collect(piles: Card[][], p: number): number {
  const pile = piles[p];
  if (pile.length < 13) return 0;
  const run = pile.slice(-13);
  const suit = run[0].suit;
  for (let k = 0; k < 13; k++)
    if (!run[k].up || run[k].suit !== suit || run[k].rank !== 13 - k) return 0;
  const f = piles.findIndex((x, idx) => idx >= F0 && idx < T0 && x.length === 0);
  if (f < 0) return 0;
  piles[f] = run.slice().reverse();
  const rest = pile.slice(0, -13);
  const under = topOf(rest);
  piles[p] = under && !under.up ? [...rest.slice(0, -1), faceUp(under)] : rest;
  return 1;
}

function finish(g: Game, piles: Card[][], gained: number): Game {
  const done = g.done + gained;
  const won = done === 8;
  const now = Date.now();
  return {
    ...g,
    piles,
    done,
    won,
    score: Math.max(0, g.score - 1 + gained * 100),
    moves: g.moves + 1,
    startedAt: g.startedAt ?? now,
    endedAt: won ? now : null,
  };
}

function applyMove(g: Game, { src, i, dst }: Move): Game {
  const piles = g.piles.slice();
  const rest = piles[src].slice(0, i);
  const under = topOf(rest);
  piles[src] = under && !under.up ? [...rest.slice(0, -1), faceUp(under)] : rest;
  piles[dst] = [...piles[dst], ...g.piles[src].slice(i)];
  return finish(g, piles, collect(piles, dst));
}

/** Deal one card onto every column. Null when the stock is empty. */
function dealRow(g: Game): Game | null {
  const stock = g.piles[STOCK];
  if (!stock.length) return null;
  const piles = g.piles.slice();
  const n = Math.min(10, stock.length);
  const dealt = stock.slice(-n).reverse();
  piles[STOCK] = stock.slice(0, -n);
  let gained = 0;
  dealt.forEach((card, c) => {
    piles[T0 + c] = [...piles[T0 + c], faceUp(card)];
  });
  for (let c = 0; c < 10; c++) gained += collect(piles, T0 + c);
  return finish(g, piles, gained);
}

const hasEmptyColumn = (g: Game) => g.piles.some((p, idx) => isTab(idx) && p.length === 0);

/** Where a click sends the card at `i`: a same-suit build, any build, then a space. */
function bestDest(g: Game, src: number, i: number): number | null {
  const card = g.piles[src][i];
  let any: number | null = null;
  let space: number | null = null;
  for (let d = T0; d < PILES; d++) {
    if (!legal(g, { src, i, dst: d })) continue;
    const top = topOf(g.piles[d]);
    if (top?.suit === card.suit) return d;
    if (top) any ??= d;
    else space ??= d;
  }
  if (any !== null) return any;
  return i > 0 ? space : null;
}

function fitIndex(g: Game, src: number, dst: number): number {
  const s = runStart(g.piles[src]);
  if (s < 0) return -1;
  for (let i = s; i < g.piles[src].length; i++) if (legal(g, { src, i, dst })) return i;
  return -1;
}

/** Useful moves, best first; `dst: -1` means deal from the stock. */
function findHints(g: Game): Move[] {
  const ranked: { m: Move; r: number }[] = [];
  for (let src = T0; src < PILES; src++) {
    const pile = g.piles[src];
    const i = runStart(pile);
    if (i < 0) continue;
    const card = pile[i];
    const below = i > 0 ? pile[i - 1] : undefined;
    const settled = !!below && below.up && below.rank === card.rank + 1;
    let spaceUsed = false;
    for (let dst = T0; dst < PILES; dst++) {
      const m = { src, i, dst };
      if (!legal(g, m)) continue;
      const top = topOf(g.piles[dst]);
      if (!top) {
        if (i === 0 || spaceUsed || settled) continue;
        spaceUsed = true;
        ranked.push({ m, r: 3 });
      } else if (top.suit === card.suit) ranked.push({ m, r: 0 });
      else if (!settled) ranked.push({ m, r: below && !below.up ? 1 : i === 0 ? 1 : 2 });
    }
  }
  ranked.sort((a, b) => a.r - b.r);
  const out = ranked.map((x) => x.m);
  if (!out.length && g.piles[STOCK].length) out.push({ src: STOCK, i: -1, dst: -1 });
  return out;
}

/* ------------------------------------------------------------- component */

interface Saved extends CardStats {
  suits: Suits;
}

const KEY = 'dunesday:spider';
const DEFAULTS: Saved = { played: 0, won: 0, best: 0, suits: 1 };
const asSuits = (n: number): Suits => (n === 2 ? 2 : n === 4 ? 4 : 1);

type Dialog = null | 'stats' | 'about' | { confirmSuits: Suits };

export default function SpiderApp({ win }: AppProps) {
  const { t } = useTranslation('c-dunesday');
  const text = useCardText();
  const [saved, setSaved] = useState<Saved>(() => loadJSON(KEY, DEFAULTS));
  const [g, setG] = useState<Game>(() => newGame(asSuits(saved.suits)));
  const hist = useRef<Game[]>([]);
  const counted = useRef(false);
  const lastClickMove = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const [hostRef, size] = useTableSize<HTMLDivElement>();
  const [sel, setSel] = useState<number | null>(null);
  const [hint, setHint] = useState<Move | null>(null);
  const hintCycle = useRef(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [winShown, setWinShown] = useState(true);
  const [status, setStatus] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [msg, announce] = useAnnouncer();

  const motion = () => motionOK(rootRef.current);

  const updateSaved = useCallback((f: (s: Saved) => Saved) => {
    setSaved((s) => {
      const n = f(s);
      saveJSON(KEY, n);
      return n;
    });
  }, []);

  /* ----- layout: tableau across the top, runs bottom-left, stock bottom-right */
  const m = cardMetrics(size.w, size.h, 10, 2.8);
  const y0 = m.gap;
  const yb = size.h - m.ch - m.gap;
  const avail = yb - m.gap - y0;
  const step = Math.max(4, Math.round(m.cw * 0.22));

  const pileName = useCallback(
    (p: number) => {
      if (p === STOCK) return t('sp-pile-stock', { defaultValue: 'Stock' });
      return t('sp-pile-tab', { defaultValue: 'Column {{n}}', n: p - T0 + 1 });
    },
    [t],
  );

  const layout = useMemo(() => {
    const specs: PileSpec[] = [];
    const pos = new Map<number, Pos>();
    const { cw, ch, colX } = m;
    for (let c = 0; c < 10; c++) {
      const p = T0 + c;
      const pile = g.piles[p];
      const offs = fanOffsets(pile, ch, avail, 0.09, 0.24);
      const x = colX(c);
      const cards: PileCard[] = pile.map((card, i) => ({
        card,
        x: 0,
        y: offs[i],
        i,
        grab: card.up,
      }));
      for (const pc of cards) pos.set(pc.card.id, { x, y: y0 + pc.y, pile: p });
      specs.push({
        id: p,
        x,
        y: y0,
        w: cw,
        h: (offs[offs.length - 1] ?? 0) + ch,
        cards,
        slot: 'plain',
        label: text.pile(pileName(p), pile),
      });
    }
    // Completed runs: one stack per run, overlapped left to right.
    const fx = colX(0);
    const runs: PileCard[] = [];
    for (let f = F0; f < T0; f++) {
      const k = f - F0;
      g.piles[f].forEach((card, i) => {
        runs.push({ card, x: k * step, y: 0, i, grab: false });
        pos.set(card.id, { x: fx + k * step, y: yb, pile: f });
      });
    }
    specs.push({
      id: F0,
      x: fx,
      y: yb,
      w: cw + 7 * step,
      h: ch,
      cards: runs,
      slot: g.done ? 'none' : 'plain',
      static: true,
      label: t('sp-found-label', { defaultValue: 'Completed runs: {{n}} of 8', n: g.done }),
    });
    // Stock: one back per remaining deal.
    const stock = g.piles[STOCK];
    const deals = Math.ceil(stock.length / 10);
    const sw = cw + Math.max(0, deals - 1) * step;
    const sx = colX(9) + cw - sw;
    const backs: PileCard[] = [];
    stock.forEach((card, i) => {
      const k = Math.floor(i / 10);
      pos.set(card.id, { x: sx + k * step, y: yb, pile: STOCK });
      if (i % 10 === 9 || i === stock.length - 1)
        backs.push({ card, x: k * step, y: 0, i, grab: false });
    });
    specs.push({
      id: STOCK,
      x: sx,
      y: yb,
      w: sw,
      h: ch,
      cards: backs,
      slot: 'none',
      label: t('sp-stock-label', { defaultValue: 'Stock, {{n}} deals left', n: deals }),
    });
    return { specs, pos };
    // m is derived from size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, size.w, size.h, text, pileName, t]);

  const { slides, drops, dealFrom } = useSlides(layout.pos, g);

  /* ----- state transitions */
  const commit = (next: Game | null): boolean => {
    if (!next) return false;
    hist.current.push(g);
    if (!counted.current) {
      counted.current = true;
      updateSaved((s) => ({ ...s, played: s.played + 1 }));
    }
    if (next.done > g.done) {
      sfx.chime();
      announce(t('sp-run-done', { defaultValue: 'Run completed! {{n}} of 8.', n: next.done }));
    }
    if (next.won && !g.won) {
      updateSaved((s) => ({ ...s, won: s.won + 1, best: Math.max(s.best, next.score) }));
      sfx.fanfare();
      setWinShown(true);
      announce(
        t('sp-won-announce', { defaultValue: 'You won! Score {{score}}.', score: next.score }),
      );
    }
    setG(next);
    setSel(null);
    setHint(null);
    setStatus('');
    return true;
  };

  const startNew = (suits: Suits) => {
    hist.current = [];
    counted.current = false;
    updateSaved((s) => (s.suits === suits ? s : { ...s, suits }));
    dealFrom(m.colX(9), yb);
    setG(newGame(suits));
    setSel(null);
    setHint(null);
    setDialog(null);
    setStatus('');
    setWinShown(true);
    sfx.swoosh();
    announce(t('sp-new-announce', { defaultValue: 'New game dealt.' }));
  };

  const undo = () => {
    const prev = hist.current.pop();
    if (!prev) return;
    setG(prev);
    setSel(null);
    setHint(null);
    setStatus('');
    sfx.undo();
    announce(t('cards-undone', { defaultValue: 'Move undone.' }));
  };

  const doMove = (mv: Move, dropRects?: DOMRect[]) => {
    const card = g.piles[mv.src][mv.i];
    if (dropRects && hostRef.current) {
      const tr = hostRef.current.getBoundingClientRect();
      g.piles[mv.src].slice(mv.i).forEach((c, k) => {
        const r = dropRects[k];
        if (r) drops.current.set(c.id, { x: r.left - tr.left, y: r.top - tr.top });
      });
    }
    const next = applyMove(g, mv);
    commit(next);
    if (next.done === g.done) sfx.pop();
    lastClickMove.current = Date.now();
    announce(
      t('cards-moved', {
        defaultValue: '{{card}} to {{pile}}.',
        card: text.name(card),
        pile: pileName(mv.dst),
      }),
    );
  };

  const doDeal = () => {
    if (g.won) return;
    if (!g.piles[STOCK].length) {
      sfx.tick();
      announce(t('sp-stock-empty', { defaultValue: 'The stock is empty.' }));
      return;
    }
    if (hasEmptyColumn(g)) {
      const text2 = t('sp-deal-blocked', {
        defaultValue: "You can't deal while a column is empty.",
      });
      setStatus(text2);
      sfx.undo();
      announce(text2);
      return;
    }
    if (commit(dealRow(g))) {
      sfx.swoosh();
      announce(t('sp-dealt', { defaultValue: 'Dealt a new row.' }));
    }
  };

  /* ----- timer */
  useEffect(() => {
    if (!g.startedAt || g.won) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [g.startedAt, g.won]);
  const seconds = g.startedAt
    ? ((g.endedAt ?? Math.max(now, g.startedAt)) - g.startedAt) / 1000
    : 0;

  useEffect(() => {
    if (!status) return;
    const id = setTimeout(() => setStatus(''), 4000);
    return () => clearTimeout(id);
  }, [status]);

  /* ----- hint */
  useEffect(() => {
    if (!hint) return;
    const id = setTimeout(() => setHint(null), 1800);
    return () => clearTimeout(id);
  }, [hint]);

  const showHint = () => {
    if (g.won) return;
    const list = findHints(g);
    if (!list.length) {
      sfx.undo();
      announce(t('sp-no-hint', { defaultValue: 'No more moves. Try Undo or start a new game.' }));
      return;
    }
    const h = list[hintCycle.current++ % list.length];
    setHint(h);
    sfx.bloop();
    if (h.src === STOCK)
      announce(t('sp-hint-stock', { defaultValue: 'Hint: deal a new row from the stock.' }));
    else
      announce(
        t('cards-hint', {
          defaultValue: 'Hint: {{card}} to {{pile}}.',
          card: text.name(g.piles[h.src][h.i]),
          pile: pileName(h.dst),
        }),
      );
  };

  /* ----- input */
  const activate = (p: number) => {
    if (g.won) return;
    if (p === STOCK) {
      setSel(null);
      doDeal();
      return;
    }
    if (sel === null) {
      const i = runStart(g.piles[p]);
      if (i < 0) {
        announce(t('cards-nothing', { defaultValue: 'Nothing to pick up here.' }));
        return;
      }
      setSel(p);
      sfx.tick();
      announce(
        t('cards-selected', {
          defaultValue: 'Selected {{card}}. Choose a pile to move to, or Escape to cancel.',
          card: text.name(g.piles[p][i]),
        }),
      );
      return;
    }
    if (sel === p) {
      setSel(null);
      announce(t('cards-cancelled', { defaultValue: 'Selection cancelled.' }));
      return;
    }
    const i = fitIndex(g, sel, p);
    setSel(null);
    if (i < 0) {
      sfx.undo();
      announce(t('cards-illegal', { defaultValue: "That move isn't allowed." }));
      return;
    }
    doMove({ src: sel, i, dst: p });
  };

  const clickPile = (p: number, i: number) => {
    if (sel !== null && sel !== p) return activate(p);
    setSel(null);
    if (p === STOCK) return doDeal();
    if (i < 0 || g.won) return;
    if (Date.now() - lastClickMove.current < 350) return; // second half of a double-click
    const d = canPick(g, p, i) ? bestDest(g, p, i) : null;
    if (d === null) {
      sfx.tick();
      announce(
        t('cards-no-move', {
          defaultValue: 'No move for {{card}}.',
          card: text.name(g.piles[p][i]),
        }),
      );
      return;
    }
    doMove({ src: p, i, dst: d });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>, p: number) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ci]');
    const i = el ? Number(el.dataset.ci) : -1;
    const draggable = !g.won && canPick(g, p, i);
    startCardDrag({
      event: e,
      elements: draggable ? cardsFrom(e.currentTarget, i) : [],
      motion: motion(),
      onClick: () => clickPile(p, i),
      onDrop: (head, rects) => {
        const dst = pickDropTarget(hostRef.current, head, (d) => legal(g, { src: p, i, dst: d }));
        if (dst < 0) return false;
        setSel(null);
        doMove({ src: p, i, dst }, rects);
        return true;
      },
    });
  };

  useWindowKeys(win.id, (e) => {
    if (dialog) return;
    if (e.key === 'Escape' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') onTableKey(e);
    else if (e.key === 'F2') {
      e.preventDefault();
      startNew(g.suits);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      showHint();
    }
  });

  const onTableKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && (sel !== null || hint)) {
      e.preventDefault();
      setSel(null);
      setHint(null);
      announce(t('cards-cancelled', { defaultValue: 'Selection cancelled.' }));
      return;
    }
    arrowNav(e, hostRef.current);
  };

  const changeSuits = (suits: Suits) => {
    if (suits === g.suits) return;
    if (counted.current && !g.won) setDialog({ confirmSuits: suits });
    else startNew(suits);
  };

  /* ----- menus */
  const gameItems: MenuItem[] = [
    {
      label: t('cards-new', { defaultValue: 'New game' }),
      hint: 'F2',
      bold: true,
      onSelect: () => startNew(g.suits),
    },
    {
      label: t('cards-undo', { defaultValue: 'Undo' }),
      hint: 'Ctrl+Z',
      disabled: !hist.current.length,
      onSelect: undo,
    },
    {
      label: t('cards-hint-item', { defaultValue: 'Hint' }),
      hint: 'H',
      disabled: g.won,
      onSelect: showHint,
    },
    {
      label: t('sp-deal-item', { defaultValue: 'Deal a new row' }),
      disabled: g.won || !g.piles[STOCK].length,
      onSelect: doDeal,
    },
    { separator: true },
    {
      label: t('sp-suits-1', { defaultValue: 'Beginner: 1 suit' }),
      checked: g.suits === 1,
      onSelect: () => changeSuits(1),
    },
    {
      label: t('sp-suits-2', { defaultValue: 'Intermediate: 2 suits' }),
      checked: g.suits === 2,
      onSelect: () => changeSuits(2),
    },
    {
      label: t('sp-suits-4', { defaultValue: 'Advanced: 4 suits' }),
      checked: g.suits === 4,
      onSelect: () => changeSuits(4),
    },
    { separator: true },
    {
      label: t('cards-stats-item', { defaultValue: 'Statistics' }),
      onSelect: () => setDialog('stats'),
    },
  ];
  const helpItems: MenuItem[] = [
    {
      label: t('sp-about-item', { defaultValue: 'About Spider Solitaire' }),
      onSelect: () => setDialog('about'),
    },
  ];

  const origins = useMemo(
    () =>
      Array.from({ length: 8 }, (_, k) => ({
        x: m.colX(0) + k * step,
        y: Math.max(0, yb - m.ch * 2),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [size.w, size.h],
  );

  const tableStyle = { '--cw': `${m.cw}px` } as React.CSSProperties;

  return (
    <div ref={rootRef} className="ds-cards ds-spider">
      <CardsMenuBar
        menus={[
          { key: 'game', label: t('cards-menu-game', { defaultValue: 'Game' }), items: gameItems },
          { key: 'help', label: t('cards-menu-help', { defaultValue: 'Help' }), items: helpItems },
        ]}
      />
      <div
        ref={hostRef}
        className="ds-cards__table"
        style={tableStyle}
        role="group"
        aria-label={t('sp-table', { defaultValue: 'Spider Solitaire table' })}
        onContextMenu={(e) => e.preventDefault()}
      >
        {size.w > 0 &&
          layout.specs.map((spec) => (
            <PileView
              key={spec.id}
              spec={spec}
              cw={m.cw}
              ch={m.ch}
              slides={slides}
              cardLabel={text.label}
              selectedFrom={sel === spec.id ? runStart(g.piles[spec.id]) : undefined}
              hintFrom={hint && hint.src === spec.id ? (hint.i < 0 ? 0 : hint.i) : undefined}
              hintTarget={
                !!hint && (hint.dst === spec.id || (hint.src === STOCK && spec.id === STOCK))
              }
              onPointerDown={onPointerDown}
              onActivate={activate}
            />
          ))}
        {g.won && size.w > 0 && (
          <WinCascade
            origins={origins}
            cw={m.cw}
            ch={m.ch}
            w={size.w}
            h={size.h}
            suits={SUIT_SETS[g.suits]}
          />
        )}
      </div>
      <CardsStatus score={g.score} moves={g.moves} seconds={seconds} message={status} />
      <div className="ds-cards__sr" role="status" aria-live="polite">
        {msg}
      </div>

      {g.won && winShown && !dialog && (
        <CardsDialog
          tone="win"
          title={t('cards-won-title', { defaultValue: 'You won!' })}
          onClose={() => setWinShown(false)}
          actions={[
            {
              label: t('cards-play-again', { defaultValue: 'Play again' }),
              onClick: () => startNew(g.suits),
            },
            {
              label: t('cards-close', { defaultValue: 'Close' }),
              onClick: () => setWinShown(false),
            },
          ]}
        >
          <p>
            {t('cards-won-body', {
              defaultValue: 'Score {{score}} in {{time}}, {{moves}} moves.',
              score: g.score,
              time: formatTime(seconds),
              moves: g.moves,
            })}
          </p>
          <p>{t('cards-won-best', { defaultValue: 'Best score: {{n}}', n: saved.best })}</p>
        </CardsDialog>
      )}
      {dialog === 'stats' && (
        <StatsDialog
          stats={saved}
          onClose={() => setDialog(null)}
          onReset={() => updateSaved((s) => ({ ...s, played: 0, won: 0, best: 0 }))}
        />
      )}
      {dialog === 'about' && (
        <CardsDialog
          title={t('sp-about-title', { defaultValue: 'About Spider Solitaire' })}
          onClose={() => setDialog(null)}
          actions={[
            { label: t('cards-ok', { defaultValue: 'OK' }), onClick: () => setDialog(null) },
          ]}
        >
          <p>
            {t('sp-about-body', {
              defaultValue:
                'Spider Solitaire for the Dunesday desktop. Build down from King to Ace in one suit to clear a run; clear all eight runs to win.',
            })}
          </p>
          <p>
            {t('sp-about-keys', {
              defaultValue:
                'Drag cards, or click one to send it to its best place. Click the stock to deal a row. Keyboard: Tab or arrow keys between piles, Enter to pick up and Enter to drop, H for a hint, Ctrl+Z to undo, F2 for a new game.',
            })}
          </p>
        </CardsDialog>
      )}
      {dialog && typeof dialog === 'object' && (
        <CardsDialog
          title={t('cards-confirm-title', { defaultValue: 'Start a new game?' })}
          onClose={() => setDialog(null)}
          actions={[
            {
              label: t('cards-confirm-yes', { defaultValue: 'New game' }),
              onClick: () => startNew(dialog.confirmSuits),
            },
            {
              label: t('cards-confirm-no', { defaultValue: 'Keep playing' }),
              onClick: () => setDialog(null),
            },
          ]}
        >
          <p>
            {t('sp-confirm-body', {
              defaultValue:
                'Changing the difficulty starts a new game. This game will count as a loss.',
            })}
          </p>
        </CardsDialog>
      )}
    </div>
  );
}
