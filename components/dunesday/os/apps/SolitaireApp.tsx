'use client';

/**
 * Solitaire (Klondike) for the Dunesday desktop, after the Windows 7 game:
 * draw one or three, Standard scoring, unlimited passes through the stock,
 * unlimited undo, hints, auto-complete and the bouncing-card win.
 *
 * Piles are numbered: 0 stock, 1 waste, 2–5 foundations, 6–12 tableau. All
 * rules are pure functions over an immutable `Game`; the component keeps a
 * history stack of those snapshots for undo.
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
  faceDown,
  faceUp,
  fanOffsets,
  formatTime,
  isRed,
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
} from './cards';

/* ------------------------------------------------------------------ rules */

const STOCK = 0;
const WASTE = 1;
const F0 = 2;
const T0 = 6;
const PILES = 13;
const isFound = (p: number) => p >= F0 && p < T0;
const isTab = (p: number) => p >= T0;

type Draw = 1 | 3;

interface Game {
  piles: Card[][];
  score: number;
  moves: number;
  draw: Draw;
  startedAt: number | null;
  endedAt: number | null;
  won: boolean;
}

interface Move {
  src: number;
  i: number;
  dst: number;
}

function newGame(draw: Draw): Game {
  const deck = shuffle(makeDeck(ALL_SUITS, 1));
  const piles: Card[][] = Array.from({ length: PILES }, () => []);
  let k = 0;
  for (let c = 0; c < 7; c++)
    for (let r = 0; r <= c; r++) {
      const card = deck[k++];
      piles[T0 + c].push(r === c ? faceUp(card) : card);
    }
  piles[STOCK] = deck.slice(k);
  return { piles, score: 0, moves: 0, draw, startedAt: null, endedAt: null, won: false };
}

function canFound(card: Card, pile: Card[]): boolean {
  const top = topOf(pile);
  return top ? top.suit === card.suit && card.rank === top.rank + 1 : card.rank === 1;
}

function canTab(card: Card, pile: Card[]): boolean {
  const top = topOf(pile);
  if (!top) return card.rank === 13;
  return top.up && isRed(top.suit) !== isRed(card.suit) && card.rank === top.rank - 1;
}

/** May the card at `i` of pile `p` be picked up (with everything above it)? */
function canPick(g: Game, p: number, i: number): boolean {
  const pile = g.piles[p];
  if (i < 0 || i >= pile.length) return false;
  if (p === WASTE || isFound(p)) return i === pile.length - 1;
  if (isTab(p)) return pile[i].up;
  return false;
}

/** The deepest card a keyboard selection on pile `p` can carry, or -1. */
function pickIndex(g: Game, p: number): number {
  const pile = g.piles[p];
  if (!pile.length) return -1;
  if (p === WASTE || isFound(p)) return pile.length - 1;
  if (isTab(p)) return pile.findIndex((c) => c.up);
  return -1;
}

function legal(g: Game, { src, i, dst }: Move): boolean {
  if (src === dst || !canPick(g, src, i)) return false;
  const card = g.piles[src][i];
  const count = g.piles[src].length - i;
  if (isFound(dst)) return count === 1 && canFound(card, g.piles[dst]);
  if (isTab(dst)) return canTab(card, g.piles[dst]);
  return false;
}

function finish(g: Game): Game {
  let n = 0;
  for (let f = F0; f < T0; f++) n += g.piles[f].length;
  const won = n === 52;
  const now = Date.now();
  return { ...g, won, startedAt: g.startedAt ?? now, endedAt: won ? now : null };
}

function applyMove(g: Game, { src, i, dst }: Move): Game {
  const piles = g.piles.slice();
  const moving = piles[src].slice(i);
  let rest = piles[src].slice(0, i);
  let score = g.score;
  if (isFound(dst) && !isFound(src)) score += 10;
  if (src === WASTE && isTab(dst)) score += 5;
  if (isFound(src) && isTab(dst)) score -= 15;
  const under = topOf(rest);
  if (isTab(src) && under && !under.up) {
    rest = [...rest.slice(0, -1), faceUp(under)];
    score += 5;
  }
  piles[src] = rest;
  piles[dst] = [...piles[dst], ...moving];
  return finish({ ...g, piles, score: Math.max(0, score), moves: g.moves + 1 });
}

/** Turn cards from the stock, or recycle the waste when the stock is empty. */
function drawStock(g: Game): Game | null {
  const piles = g.piles.slice();
  const stock = piles[STOCK];
  const waste = piles[WASTE];
  if (!stock.length) {
    if (!waste.length) return null;
    piles[STOCK] = waste.slice().reverse().map(faceDown);
    piles[WASTE] = [];
  } else {
    const n = Math.min(g.draw, stock.length);
    piles[WASTE] = [...waste, ...stock.slice(-n).reverse().map(faceUp)];
    piles[STOCK] = stock.slice(0, -n);
  }
  return finish({ ...g, piles, moves: g.moves + 1 });
}

/** The best place a click sends the card at `i`: foundation, then a built pile, then a space. */
function bestDest(g: Game, src: number, i: number): number | null {
  for (let f = F0; f < T0; f++) if (legal(g, { src, i, dst: f })) return f;
  let space: number | null = null;
  for (let t = T0; t < PILES; t++) {
    if (!legal(g, { src, i, dst: t })) continue;
    if (g.piles[t].length) return t;
    space ??= t;
  }
  // A king already at the bottom of a column gains nothing from a space.
  if (space !== null && !(isTab(src) && i === 0)) return space;
  return null;
}

/** Index in `src` of the card that fits `dst` (keyboard moves), or -1. */
function fitIndex(g: Game, src: number, dst: number): number {
  const from = pickIndex(g, src);
  if (from < 0) return -1;
  for (let i = from; i < g.piles[src].length; i++) if (legal(g, { src, i, dst })) return i;
  return -1;
}

/** Legal, useful moves, best first. `dst: -1` = turn the stock. */
function findHints(g: Game): Move[] {
  const ranked: { m: Move; r: number }[] = [];
  const tops = [WASTE, ...Array.from({ length: 7 }, (_, c) => T0 + c)];
  for (const src of tops) {
    const i = g.piles[src].length - 1;
    if (i < 0) continue;
    for (let f = F0; f < T0; f++)
      if (legal(g, { src, i, dst: f })) {
        ranked.push({ m: { src, i, dst: f }, r: 0 });
        break;
      }
  }
  for (let c = 0; c < 7; c++) {
    const src = T0 + c;
    const i = pickIndex(g, src);
    if (i < 0) continue;
    let spaceUsed = false;
    for (let t = T0; t < PILES; t++) {
      const m = { src, i, dst: t };
      if (!legal(g, m)) continue;
      const empty = !g.piles[t].length;
      if (empty && (i === 0 || spaceUsed)) continue;
      if (empty) spaceUsed = true;
      ranked.push({ m, r: i > 0 ? 1 : 3 });
    }
  }
  const w = g.piles[WASTE].length - 1;
  if (w >= 0)
    for (let t = T0; t < PILES; t++)
      if (legal(g, { src: WASTE, i: w, dst: t }))
        ranked.push({ m: { src: WASTE, i: w, dst: t }, r: 2 });
  ranked.sort((a, b) => a.r - b.r);
  const out = ranked.map((x) => x.m);
  if (!out.length && (g.piles[STOCK].length || g.piles[WASTE].length))
    out.push({ src: STOCK, i: -1, dst: -1 });
  return out;
}

function canAutoComplete(g: Game): boolean {
  if (g.won || g.piles[STOCK].length || g.piles[WASTE].length) return false;
  for (let t = T0; t < PILES; t++) if (g.piles[t].some((c) => !c.up)) return false;
  return true;
}

function autoStep(g: Game): Game | null {
  let best: Move | null = null;
  let bestRank = 99;
  for (let t = T0; t < PILES; t++) {
    const i = g.piles[t].length - 1;
    if (i < 0 || g.piles[t][i].rank >= bestRank) continue;
    for (let f = F0; f < T0; f++)
      if (legal(g, { src: t, i, dst: f })) {
        best = { src: t, i, dst: f };
        bestRank = g.piles[t][i].rank;
        break;
      }
  }
  return best ? applyMove(g, best) : null;
}

/* ------------------------------------------------------------- component */

interface Saved extends CardStats {
  draw: Draw;
}

const KEY = 'dunesday:solitaire';
const DEFAULTS: Saved = { played: 0, won: 0, best: 0, draw: 1 };

type Dialog = null | 'stats' | 'about' | { confirmDraw: Draw };

export default function SolitaireApp({ win }: AppProps) {
  const { t } = useTranslation('c-dunesday');
  const text = useCardText();
  const [saved, setSaved] = useState<Saved>(() => loadJSON(KEY, DEFAULTS));
  const [g, setG] = useState<Game>(() => newGame(saved.draw === 3 ? 3 : 1));
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

  /* ----- layout */
  const m = cardMetrics(size.w, size.h, 7, 2.9);
  const y0 = m.gap;
  const y1 = y0 + m.ch + Math.round(m.gap * 1.5);
  const avail = size.h - y1 - m.gap;
  const fanX = Math.round(m.cw * 0.22);

  const pileName = useCallback(
    (p: number) => {
      if (p === STOCK) return t('sol-pile-stock', { defaultValue: 'Stock' });
      if (p === WASTE) return t('sol-pile-waste', { defaultValue: 'Waste' });
      if (isFound(p))
        return t('sol-pile-found', { defaultValue: 'Foundation {{n}}', n: p - F0 + 1 });
      return t('sol-pile-tab', { defaultValue: 'Tableau {{n}}', n: p - T0 + 1 });
    },
    [t],
  );

  const layout = useMemo(() => {
    const specs: PileSpec[] = [];
    const pos = new Map<number, Pos>();
    const { cw, ch, colX } = m;
    const add = (
      id: number,
      x: number,
      y: number,
      w: number,
      h: number,
      cards: PileCard[],
      slot: PileSpec['slot'],
    ) => {
      specs.push({ id, x, y, w, h, cards, slot, label: text.pile(pileName(id), g.piles[id]) });
      for (const pc of cards) pos.set(pc.card.id, { x: x + pc.x, y: y + pc.y, pile: id });
    };
    const hide = (id: number, list: Card[], x: number, y: number) => {
      for (const c of list) pos.set(c.id, { x, y, pile: id });
    };
    // Stock: only the top back is drawn; the rest live under it.
    const stock = g.piles[STOCK];
    hide(STOCK, stock, colX(0), y0);
    add(
      STOCK,
      colX(0),
      y0,
      cw,
      ch,
      stock.length
        ? [{ card: stock[stock.length - 1], x: 0, y: 0, i: stock.length - 1, grab: false }]
        : [],
      g.piles[WASTE].length ? 'recycle' : 'plain',
    );
    // Waste: draw-three fans the last three sideways.
    const waste = g.piles[WASTE];
    const show = Math.min(waste.length, g.draw === 3 ? 3 : 2);
    hide(WASTE, waste.slice(0, waste.length - show), colX(1), y0);
    add(
      WASTE,
      colX(1),
      y0,
      cw + (g.draw === 3 ? fanX * 2 : 0),
      ch,
      waste.slice(waste.length - show).map((card, j) => {
        const i = waste.length - show + j;
        return { card, x: g.draw === 3 ? j * fanX : 0, y: 0, i, grab: i === waste.length - 1 };
      }),
      'plain',
    );
    for (let f = F0; f < T0; f++) {
      const pile = g.piles[f];
      const x = colX(3 + f - F0);
      hide(f, pile.slice(0, -2), x, y0);
      add(
        f,
        x,
        y0,
        cw,
        ch,
        pile.slice(-2).map((card, j) => {
          const i = Math.max(0, pile.length - 2) + j;
          return { card, x: 0, y: 0, i, grab: i === pile.length - 1 };
        }),
        'ace',
      );
    }
    for (let c = 0; c < 7; c++) {
      const p = T0 + c;
      const pile = g.piles[p];
      const offs = fanOffsets(pile, ch, avail, 0.1, 0.26);
      add(
        p,
        colX(c),
        y1,
        cw,
        (offs[offs.length - 1] ?? 0) + ch,
        pile.map((card, i) => ({ card, x: 0, y: offs[i], i, grab: card.up })),
        'king',
      );
    }
    return { specs, pos };
    // m is derived from size; listing size keeps the memo honest and cheap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, size.w, size.h, text, pileName]);

  const { slides, drops, dealFrom } = useSlides(layout.pos, g);

  /* ----- state transitions */
  const commit = (next: Game | null): boolean => {
    if (!next) return false;
    hist.current.push(g);
    if (!counted.current) {
      counted.current = true;
      updateSaved((s) => ({ ...s, played: s.played + 1 }));
    }
    if (next.won && !g.won) {
      updateSaved((s) => ({ ...s, won: s.won + 1, best: Math.max(s.best, next.score) }));
      sfx.fanfare();
      setWinShown(true);
      announce(
        t('sol-won-announce', { defaultValue: 'You won! Score {{score}}.', score: next.score }),
      );
    }
    setG(next);
    setSel(null);
    setHint(null);
    return true;
  };

  const startNew = (draw: Draw) => {
    hist.current = [];
    counted.current = false;
    updateSaved((s) => (s.draw === draw ? s : { ...s, draw }));
    dealFrom(m.colX(0), y0);
    setG(newGame(draw));
    setSel(null);
    setHint(null);
    setDialog(null);
    setWinShown(true);
    sfx.swoosh();
    announce(t('sol-new-announce', { defaultValue: 'New game dealt.' }));
  };

  const undo = () => {
    const prev = hist.current.pop();
    if (!prev) return;
    setG(prev);
    setSel(null);
    setHint(null);
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
    commit(applyMove(g, mv));
    if (isFound(mv.dst)) sfx.chime();
    else sfx.pop();
    lastClickMove.current = Date.now();
    announce(
      t('cards-moved', {
        defaultValue: '{{card}} to {{pile}}.',
        card: text.name(card),
        pile: pileName(mv.dst),
      }),
    );
  };

  const doDraw = () => {
    const recycling = !g.piles[STOCK].length;
    const next = drawStock(g);
    if (!next || !commit(next)) return;
    sfx.tick();
    const top = topOf(next.piles[WASTE]);
    announce(
      recycling || !top
        ? t('sol-recycled', { defaultValue: 'Waste turned back into the stock.' })
        : t('sol-drew', { defaultValue: 'Drew {{card}}.', card: text.name(top) }),
    );
  };

  /* ----- auto-complete: one card per tick once everything is face up */
  const auto = canAutoComplete(g);
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });
  useEffect(() => {
    if (!auto) return;
    const id = setTimeout(
      () => {
        const next = autoStep(g);
        if (next && commitRef.current(next)) sfx.tick();
      },
      motionOK(rootRef.current) ? 110 : 0,
    );
    return () => clearTimeout(id);
  }, [auto, g]);

  /* ----- timer */
  useEffect(() => {
    if (!g.startedAt || g.won) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [g.startedAt, g.won]);
  const seconds = g.startedAt
    ? ((g.endedAt ?? Math.max(now, g.startedAt)) - g.startedAt) / 1000
    : 0;

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
      announce(t('sol-no-hint', { defaultValue: 'No more moves. Try Undo or start a new game.' }));
      return;
    }
    const h = list[hintCycle.current++ % list.length];
    setHint(h);
    sfx.bloop();
    if (h.src === STOCK)
      announce(t('sol-hint-stock', { defaultValue: 'Hint: turn a card from the stock.' }));
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
    if (g.won || auto) return;
    if (p === STOCK) {
      setSel(null);
      doDraw();
      return;
    }
    if (sel === null) {
      const i = pickIndex(g, p);
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
    if (p === STOCK) return doDraw();
    if (i < 0 || g.won || auto) return;
    if (Date.now() - lastClickMove.current < 350) return; // second half of a double-click
    const d = bestDest(g, p, i);
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

  const onDoubleClick = (p: number) => {
    if (Date.now() - lastClickMove.current < 500 || g.won) return;
    const i = g.piles[p].length - 1;
    for (let f = F0; f < T0; f++)
      if (legal(g, { src: p, i, dst: f })) return doMove({ src: p, i, dst: f });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>, p: number) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ci]');
    const i = el ? Number(el.dataset.ci) : -1;
    const draggable = !g.won && !auto && canPick(g, p, i);
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
      startNew(g.draw);
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

  const changeDraw = (draw: Draw) => {
    if (draw === g.draw) return;
    if (counted.current && !g.won) setDialog({ confirmDraw: draw });
    else startNew(draw);
  };

  /* ----- menus */
  const gameItems: MenuItem[] = [
    {
      label: t('cards-new', { defaultValue: 'New game' }),
      hint: 'F2',
      bold: true,
      onSelect: () => startNew(g.draw),
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
    { separator: true },
    {
      label: t('sol-draw-one', { defaultValue: 'Draw one' }),
      checked: g.draw === 1,
      onSelect: () => changeDraw(1),
    },
    {
      label: t('sol-draw-three', { defaultValue: 'Draw three' }),
      checked: g.draw === 3,
      onSelect: () => changeDraw(3),
    },
    { separator: true },
    {
      label: t('cards-stats-item', { defaultValue: 'Statistics' }),
      onSelect: () => setDialog('stats'),
    },
  ];
  const helpItems: MenuItem[] = [
    {
      label: t('sol-about-item', { defaultValue: 'About Solitaire' }),
      onSelect: () => setDialog('about'),
    },
  ];

  const foundOrigins = useMemo(
    () => Array.from({ length: 4 }, (_, k) => ({ x: m.colX(3 + k), y: y0 })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [size.w, size.h],
  );

  const tableStyle = { '--cw': `${m.cw}px` } as React.CSSProperties;

  return (
    <div ref={rootRef} className="ds-cards ds-sol">
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
        aria-label={t('sol-table', { defaultValue: 'Solitaire table' })}
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
              selectedFrom={sel === spec.id ? pickIndex(g, spec.id) : undefined}
              hintFrom={
                hint && hint.src === spec.id
                  ? hint.i < 0
                    ? g.piles[STOCK].length - 1
                    : hint.i
                  : undefined
              }
              hintTarget={
                !!hint && (hint.dst === spec.id || (hint.src === STOCK && spec.id === STOCK))
              }
              onPointerDown={onPointerDown}
              onActivate={activate}
              onDoubleClick={onDoubleClick}
            />
          ))}
        {g.won && size.w > 0 && (
          <WinCascade
            origins={foundOrigins}
            cw={m.cw}
            ch={m.ch}
            w={size.w}
            h={size.h}
            suits={ALL_SUITS}
          />
        )}
      </div>
      <CardsStatus score={g.score} moves={g.moves} seconds={seconds} />
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
              onClick: () => startNew(g.draw),
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
          title={t('sol-about-title', { defaultValue: 'About Solitaire' })}
          onClose={() => setDialog(null)}
          actions={[
            { label: t('cards-ok', { defaultValue: 'OK' }), onClick: () => setDialog(null) },
          ]}
        >
          <p>
            {t('sol-about-body', {
              defaultValue:
                'Klondike Solitaire for the Dunesday desktop. Build the four foundations up from Ace to King by suit; build the tableau down in alternating colours.',
            })}
          </p>
          <p>
            {t('sol-about-keys', {
              defaultValue:
                'Drag cards, or click one to send it to its best place. Keyboard: Tab or arrow keys between piles, Enter to pick up and Enter to drop, H for a hint, Ctrl+Z to undo, F2 for a new game.',
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
              onClick: () => startNew(dialog.confirmDraw),
            },
            {
              label: t('cards-confirm-no', { defaultValue: 'Keep playing' }),
              onClick: () => setDialog(null),
            },
          ]}
        >
          <p>
            {t('sol-confirm-body', {
              defaultValue:
                'The new draw setting starts a new game. This game will count as a loss.',
            })}
          </p>
        </CardsDialog>
      )}
    </div>
  );
}
