'use client';

/**
 * Minesweeper — the Windows 7 game: three classic levels plus Custom, a safe
 * first click, flood reveal, flags and question marks, chording, a timer and
 * per-level best times kept in localStorage. Keyboard: arrows move, Enter or
 * Space reveal, F or Shift+Enter flag, F2 starts a new game. Touch: tap
 * reveals, long-press (or Flag mode) flags.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Bomb, Clock, Flag, X } from 'lucide-react';
import type { AppProps } from '../apps';
import { useOs } from '../store';
import { PopupMenu, type MenuItem } from '../Menu';
import { Icon } from '../icons';
import { sfx } from '../../sound';

type Level = 'beginner' | 'intermediate' | 'expert' | 'custom';
type StdLevel = Exclude<Level, 'custom'>;
type CellState = 'hidden' | 'open' | 'flag' | 'q';
interface Cell {
  mine: boolean;
  adj: number;
  state: CellState;
}
type Status = 'ready' | 'playing' | 'won' | 'lost';
interface Game {
  rows: number;
  cols: number;
  mines: number;
  cells: Cell[];
  status: Status;
  placed: boolean;
  exploded: number;
}
interface Dims {
  rows: number;
  cols: number;
  mines: number;
}
interface Saved {
  level: Level;
  custom: Dims;
  marks: boolean;
  best: Partial<Record<StdLevel, number>>;
  played: Partial<Record<StdLevel, number>>;
  won: Partial<Record<StdLevel, number>>;
}
type Dialog = null | 'lost' | 'won' | 'custom' | 'stats' | 'about';

const STORAGE_KEY = 'dunesday:minesweeper';
const LEVELS: Record<StdLevel, Dims> = {
  beginner: { rows: 9, cols: 9, mines: 10 },
  intermediate: { rows: 16, cols: 16, mines: 40 },
  expert: { rows: 16, cols: 30, mines: 99 },
};
const LONG_PRESS_MS = 450;
const MIN_CELL = 18;
const MAX_CELL = 34;

const DEFAULT_SAVED: Saved = {
  level: 'beginner',
  custom: { rows: 9, cols: 9, mines: 10 },
  marks: true,
  best: {},
  played: {},
  won: {},
};

function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SAVED;
    const p = JSON.parse(raw) as Partial<Saved>;
    return { ...DEFAULT_SAVED, ...p, custom: validDims(p.custom) ?? DEFAULT_SAVED.custom };
  } catch {
    return DEFAULT_SAVED;
  }
}

function writeSaved(s: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — the game still plays */
  }
}

function maxMines(rows: number, cols: number) {
  return Math.min(668, (rows - 1) * (cols - 1));
}

function validDims(d: unknown): Dims | null {
  if (!d || typeof d !== 'object') return null;
  const { rows, cols, mines } = d as Dims;
  if (![rows, cols, mines].every(Number.isInteger)) return null;
  if (rows < 9 || rows > 24 || cols < 9 || cols > 30) return null;
  if (mines < 10 || mines > maxMines(rows, cols)) return null;
  return { rows, cols, mines };
}

function dimsFor(level: Level, custom: Dims): Dims {
  return level === 'custom' ? custom : LEVELS[level];
}

function neighbours(i: number, rows: number, cols: number): number[] {
  const r = Math.floor(i / cols);
  const c = i % cols;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) out.push(rr * cols + cc);
    }
  }
  return out;
}

function emptyGame(d: Dims): Game {
  return {
    ...d,
    cells: Array.from({ length: d.rows * d.cols }, () => ({
      mine: false,
      adj: 0,
      state: 'hidden' as CellState,
    })),
    status: 'ready',
    placed: false,
    exploded: -1,
  };
}

/** Lay mines avoiding the first click (and its neighbours when there is room). */
function placeMines(g: Game, safe: number): Cell[] {
  const total = g.rows * g.cols;
  const around = neighbours(safe, g.rows, g.cols);
  const exclude = new Set<number>([safe]);
  if (total - around.length - 1 >= g.mines) around.forEach((n) => exclude.add(n));
  const pool: number[] = [];
  for (let i = 0; i < total; i++) if (!exclude.has(i)) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const cells = g.cells.map((c) => ({ ...c, mine: false, adj: 0 }));
  pool.slice(0, g.mines).forEach((i) => (cells[i].mine = true));
  for (let i = 0; i < total; i++) {
    cells[i].adj = neighbours(i, g.rows, g.cols).filter((n) => cells[n].mine).length;
  }
  return cells;
}

/** Open the given cells (flood-filling zeros). Returns the first mine hit, or -1. */
function openCells(
  cells: Cell[],
  start: number[],
  rows: number,
  cols: number,
): { cells: Cell[]; hit: number; opened: number } {
  const next = cells.slice();
  let hit = -1;
  let opened = 0;
  const stack = [...start];
  while (stack.length) {
    const i = stack.pop() as number;
    const c = next[i];
    if (c.state === 'open' || c.state === 'flag') continue;
    next[i] = { ...c, state: 'open' };
    opened++;
    if (c.mine) {
      if (hit < 0) hit = i;
      continue;
    }
    if (c.adj === 0) {
      for (const n of neighbours(i, rows, cols)) {
        if (next[n].state !== 'open' && next[n].state !== 'flag') stack.push(n);
      }
    }
  }
  return { cells: next, hit, opened };
}

export default function MinesweeperApp({ win }: AppProps) {
  const { t } = useTranslation('c-dunesday');
  const [saved, setSaved] = useState<Saved>(loadSaved);
  const [game, setGame] = useState<Game>(() => emptyGame(dimsFor(saved.level, saved.custom)));
  const [elapsed, setElapsed] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [lastResult, setLastResult] = useState<{
    time: number;
    best: number | null;
    isBest: boolean;
  }>({
    time: 0,
    best: null,
    isBest: false,
  });
  const [menu, setMenu] = useState<null | { which: 'game' | 'help'; x: number; y: number }>(null);
  const [focus, setFocus] = useState(0);
  const [flagMode, setFlagMode] = useState(false);
  const [cell, setCell] = useState(24);
  const [announce, setAnnounce] = useState('');
  const [draft, setDraft] = useState({ rows: '9', cols: '9', mines: '10' });
  const [draftError, setDraftError] = useState('');

  const startedAt = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const rootKey = useRef<(e: KeyboardEvent) => void>(() => {});
  const hostRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressFired = useRef(false);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const lastPointer = useRef<string>('mouse');
  const suppressUntil = useRef(0);

  const persist = useCallback((patch: (s: Saved) => Saved) => {
    setSaved((s) => {
      const n = patch(s);
      writeSaved(n);
      return n;
    });
  }, []);

  /* ── Timer ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (game.status !== 'playing') return;
    const id = setInterval(() => {
      setElapsed(Math.min(999, Math.floor((Date.now() - startedAt.current) / 1000) + 1));
    }, 250);
    return () => clearInterval(id);
  }, [game.status]);

  /* ── Fit tiles to the window ───────────────────────────────────────────── */
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const fit = () => {
      const w = host.clientWidth - 20;
      const h = host.clientHeight - 20;
      const size = Math.floor(
        Math.min((w - (game.cols - 1)) / game.cols, (h - (game.rows - 1)) / game.rows),
      );
      setCell(Math.max(MIN_CELL, Math.min(MAX_CELL, size || MIN_CELL)));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    fit();
    return () => ro.disconnect();
  }, [game.rows, game.cols]);

  /* ── Dialog focus ──────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!dialog) return;
    dialogRef.current?.querySelector<HTMLElement>('[data-autofocus], input, button')?.focus();
  }, [dialog]);

  useEffect(
    () => () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
    },
    [],
  );

  const focusCell = (i: number) => {
    gridRef.current?.querySelector<HTMLElement>(`[data-i="${i}"]`)?.focus();
  };

  const newGame = useCallback(
    (d?: Dims) => {
      const dims = d ?? { rows: game.rows, cols: game.cols, mines: game.mines };
      setGame(emptyGame(dims));
      setElapsed(0);
      setDialog(null);
      setAnnounce('');
      setFocus((f) => Math.min(f, dims.rows * dims.cols - 1));
      sfx.chime();
    },
    [game.rows, game.cols, game.mines],
  );

  const chooseLevel = (level: Level, custom?: Dims) => {
    persist((s) => ({ ...s, level, custom: custom ?? s.custom }));
    newGame(dimsFor(level, custom ?? saved.custom));
    setFocus(0);
  };

  /* ── End states ────────────────────────────────────────────────────────── */
  const finish = (g: Game, cells: Cell[], hit: number) => {
    const now = Math.min(999, Math.max(1, Math.ceil((Date.now() - startedAt.current) / 1000)));
    const std = saved.level === 'custom' ? null : saved.level;
    if (hit >= 0) {
      const shown = cells.map((c) =>
        c.mine && c.state !== 'flag' ? { ...c, state: 'open' as CellState } : c,
      );
      setGame({ ...g, cells: shown, status: 'lost', exploded: hit, placed: true });
      setElapsed(now);
      if (std) persist((s) => ({ ...s, played: { ...s.played, [std]: (s.played[std] ?? 0) + 1 } }));
      setLastResult({ time: now, best: std ? (saved.best[std] ?? null) : null, isBest: false });
      setAnnounce(t('ms-announce-lost', { defaultValue: 'You hit a mine. Game lost.' }));
      setDialog('lost');
      sfx.pop();
      return;
    }
    const hidden = cells.filter((c) => c.state !== 'open').length;
    if (hidden === g.mines) {
      const flagged = cells.map((c) => (c.mine ? { ...c, state: 'flag' as CellState } : c));
      setGame({ ...g, cells: flagged, status: 'won', placed: true });
      setElapsed(now);
      const prev = std ? saved.best[std] : undefined;
      const isBest = !!std && (prev === undefined || now < prev);
      if (std) {
        persist((s) => ({
          ...s,
          played: { ...s.played, [std]: (s.played[std] ?? 0) + 1 },
          won: { ...s.won, [std]: (s.won[std] ?? 0) + 1 },
          best: isBest ? { ...s.best, [std]: now } : s.best,
        }));
      }
      setLastResult({ time: now, best: std ? (isBest ? now : (prev ?? null)) : null, isBest });
      setAnnounce(
        t('ms-announce-won', { defaultValue: 'You won in {{time}} seconds!', time: now }),
      );
      setDialog('won');
      sfx.fanfare();
      return;
    }
    setGame({ ...g, cells, status: 'playing', placed: true });
  };

  /* ── Moves ─────────────────────────────────────────────────────────────── */
  const over = game.status === 'won' || game.status === 'lost';

  const chord = (i: number) => {
    if (over) return;
    const c = game.cells[i];
    if (c.state !== 'open' || c.adj === 0) return;
    const around = neighbours(i, game.rows, game.cols);
    const flags = around.filter((n) => game.cells[n].state === 'flag').length;
    if (flags !== c.adj) return;
    const targets = around.filter(
      (n) => game.cells[n].state === 'hidden' || game.cells[n].state === 'q',
    );
    if (!targets.length) return;
    const res = openCells(game.cells, targets, game.rows, game.cols);
    if (res.hit < 0) (res.opened > 3 ? sfx.pop : sfx.tick)();
    finish(game, res.cells, res.hit);
  };

  const reveal = (i: number) => {
    if (over) return;
    let cells = game.cells;
    const c = cells[i];
    if (c.state === 'open') {
      chord(i);
      return;
    }
    if (c.state === 'flag') return;
    if (!game.placed) {
      cells = placeMines(game, i);
      startedAt.current = Date.now();
      setElapsed(1);
    }
    const res = openCells(cells, [i], game.rows, game.cols);
    if (res.hit < 0) (res.opened > 1 ? sfx.pop : sfx.tick)();
    finish(game, res.cells, res.hit);
  };

  const toggleFlag = (i: number) => {
    if (over) return;
    const c = game.cells[i];
    if (c.state === 'open') return;
    const next: CellState =
      c.state === 'hidden'
        ? 'flag'
        : c.state === 'flag'
          ? saved.marks
            ? 'q'
            : 'hidden'
          : 'hidden';
    const cells = game.cells.slice();
    cells[i] = { ...c, state: next };
    setGame({ ...game, cells });
    if (next === 'flag') sfx.bloop();
    else sfx.undo();
  };

  /* ── Pointer plumbing ──────────────────────────────────────────────────── */
  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pressOrigin.current = null;
  };

  const onCellPointerDown = (i: number) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    lastPointer.current = e.pointerType;
    setFocus(i);
    if (e.pointerType === 'mouse') return;
    pressFired.current = false;
    clearPress();
    pressOrigin.current = { x: e.clientX, y: e.clientY };
    pressTimer.current = setTimeout(() => {
      pressFired.current = true;
      pressTimer.current = null;
      toggleFlag(i);
    }, LONG_PRESS_MS);
  };

  /** Both buttons at once (or the middle button) chords, Win7 style. */
  const onCellMouseDown = (i: number) => (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (e.buttons === 3 || e.button === 1) {
      e.preventDefault();
      suppressUntil.current = Date.now() + 400;
      chord(i);
    }
  };

  const onCellPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const o = pressOrigin.current;
    if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > 10) clearPress();
  };

  const onCellClick = (i: number) => (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (Date.now() < suppressUntil.current) return;
    if (pressFired.current) {
      pressFired.current = false;
      return;
    }
    if (e.detail === 0) return; // keyboard activation is handled in onKeyDown
    if (flagMode && game.cells[i].state !== 'open') toggleFlag(i);
    else reveal(i);
  };

  const onCellContextMenu = (i: number) => (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (lastPointer.current !== 'mouse') return; // long-press already handled it
    if (Date.now() < suppressUntil.current) return;
    toggleFlag(i);
  };

  /* ── Keyboard ──────────────────────────────────────────────────────────── */
  const onGridKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const r = Math.floor(focus / game.cols);
    const c = focus % game.cols;
    let next: number;
    switch (e.key) {
      case 'ArrowUp':
        next = Math.max(0, r - 1) * game.cols + c;
        break;
      case 'ArrowDown':
        next = Math.min(game.rows - 1, r + 1) * game.cols + c;
        break;
      case 'ArrowLeft':
        next = r * game.cols + Math.max(0, c - 1);
        break;
      case 'ArrowRight':
        next = r * game.cols + Math.min(game.cols - 1, c + 1);
        break;
      case 'Home':
        next = e.ctrlKey ? 0 : r * game.cols;
        break;
      case 'End':
        next = e.ctrlKey ? game.cells.length - 1 : r * game.cols + game.cols - 1;
        break;
      case 'Enter':
        e.preventDefault();
        if (e.shiftKey) toggleFlag(focus);
        else reveal(focus);
        return;
      case ' ':
        e.preventDefault();
        reveal(focus);
        return;
      case 'f':
      case 'F':
        e.preventDefault();
        toggleFlag(focus);
        return;
      default:
        return;
    }
    e.preventDefault();
    setFocus(next);
    focusCell(next);
  };

  const onRootKey = (e: KeyboardEvent) => {
    if (e.key === 'F2') {
      e.preventDefault();
      newGame();
    } else if (e.key === 'Escape' && dialog) {
      e.preventDefault();
      e.stopPropagation();
      setDialog(null);
      focusCell(focus);
    }
  };

  useEffect(() => {
    rootKey.current = onRootKey;
  });

  /* F2 / Escape anywhere inside the window (a native listener: the root is not a widget). */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const h = (e: KeyboardEvent) => rootKey.current(e);
    el.addEventListener('keydown', h);
    return () => el.removeEventListener('keydown', h);
  }, []);

  /* ── Menus ─────────────────────────────────────────────────────────────── */
  const closeMenu = useCallback(() => setMenu(null), []);
  const openMenu = (which: 'game' | 'help') => (e: ReactMouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu((m) => (m?.which === which ? null : { which, x: r.left, y: r.bottom }));
  };

  const openCustom = () => {
    setDraft({
      rows: String(saved.custom.rows),
      cols: String(saved.custom.cols),
      mines: String(saved.custom.mines),
    });
    setDraftError('');
    setDialog('custom');
  };

  const gameItems: MenuItem[] = [
    {
      label: t('ms-menu-new', { defaultValue: 'New game' }),
      hint: 'F2',
      bold: true,
      onSelect: () => newGame(),
    },
    { separator: true },
    {
      label: t('ms-level-beginner', { defaultValue: 'Beginner' }),
      checked: saved.level === 'beginner',
      onSelect: () => chooseLevel('beginner'),
    },
    {
      label: t('ms-level-intermediate', { defaultValue: 'Intermediate' }),
      checked: saved.level === 'intermediate',
      onSelect: () => chooseLevel('intermediate'),
    },
    {
      label: t('ms-level-expert', { defaultValue: 'Expert' }),
      checked: saved.level === 'expert',
      onSelect: () => chooseLevel('expert'),
    },
    {
      label: t('ms-level-custom', { defaultValue: 'Custom…' }),
      checked: saved.level === 'custom',
      onSelect: openCustom,
    },
    { separator: true },
    {
      label: t('ms-menu-stats', { defaultValue: 'Statistics' }),
      onSelect: () => setDialog('stats'),
    },
    {
      label: t('ms-menu-marks', { defaultValue: 'Allow question marks' }),
      checked: saved.marks,
      onSelect: () => persist((s) => ({ ...s, marks: !s.marks })),
    },
    { separator: true },
    {
      label: t('ms-menu-exit', { defaultValue: 'Exit' }),
      onSelect: () => useOs.getState().close(win.id),
    },
  ];
  const helpItems: MenuItem[] = [
    {
      label: t('ms-menu-about', { defaultValue: 'About Minesweeper' }),
      onSelect: () => setDialog('about'),
    },
  ];

  const submitCustom = () => {
    const d = { rows: Number(draft.rows), cols: Number(draft.cols), mines: Number(draft.mines) };
    const ok = validDims(d);
    if (!ok) {
      const max =
        Number.isInteger(d.rows) && Number.isInteger(d.cols)
          ? maxMines(Math.min(24, Math.max(9, d.rows)), Math.min(30, Math.max(9, d.cols)))
          : 668;
      setDraftError(
        t('ms-custom-error', {
          defaultValue: 'Height must be 9–24, width 9–30, and mines 10–{{max}}.',
          max,
        }),
      );
      return;
    }
    chooseLevel('custom', ok);
  };

  /* ── Rendering ─────────────────────────────────────────────────────────── */
  const flagsPlaced = game.cells.filter((c) => c.state === 'flag').length;
  const minesLeft = game.mines - flagsPlaced;

  const stateLabel = (c: Cell, i: number): string => {
    if (c.state === 'flag') {
      if (game.status === 'lost' && !c.mine)
        return t('ms-state-wrong-flag', { defaultValue: 'flagged, no mine' });
      return t('ms-state-flag', { defaultValue: 'flagged' });
    }
    if (c.state === 'q') return t('ms-state-question', { defaultValue: 'question mark' });
    if (c.state === 'hidden') return t('ms-state-hidden', { defaultValue: 'unrevealed' });
    if (c.mine) {
      return i === game.exploded
        ? t('ms-state-exploded', { defaultValue: 'mine, exploded' })
        : t('ms-state-mine', { defaultValue: 'mine' });
    }
    if (c.adj === 0) return t('ms-state-empty', { defaultValue: 'no mines nearby' });
    return c.adj === 1
      ? t('ms-state-one', { defaultValue: '1 mine nearby' })
      : t('ms-state-many', { defaultValue: '{{n}} mines nearby', n: c.adj });
  };

  const gridStyle = { '--ms-cell': `${cell}px`, '--ms-cols': game.cols } as CSSProperties;
  const rows = Array.from({ length: game.rows }, (_, r) => r);
  const levelName =
    saved.level === 'beginner'
      ? t('ms-level-beginner', { defaultValue: 'Beginner' })
      : saved.level === 'intermediate'
        ? t('ms-level-intermediate', { defaultValue: 'Intermediate' })
        : saved.level === 'expert'
          ? t('ms-level-expert', { defaultValue: 'Expert' })
          : t('ms-level-custom-name', { defaultValue: 'Custom' });

  return (
    <div className="ds-ms" ref={rootRef}>
      <div
        className="ds-ms__menubar"
        role="toolbar"
        aria-label={t('ms-menubar', { defaultValue: 'Minesweeper menu' })}
      >
        <button
          type="button"
          className="ds-ms__menubtn"
          aria-haspopup="menu"
          aria-expanded={menu?.which === 'game'}
          onClick={openMenu('game')}
        >
          {t('ms-menu-game', { defaultValue: 'Game' })}
        </button>
        <button
          type="button"
          className="ds-ms__menubtn"
          aria-haspopup="menu"
          aria-expanded={menu?.which === 'help'}
          onClick={openMenu('help')}
        >
          {t('ms-menu-help', { defaultValue: 'Help' })}
        </button>
        <span className="ds-ms__spacer" />
        <button
          type="button"
          className={`ds-btn7 ds-ms__flagmode${flagMode ? ' ds-ms__flagmode--on' : ''}`}
          aria-pressed={flagMode}
          onClick={() => setFlagMode((f) => !f)}
          title={t('ms-flagmode-hint', { defaultValue: 'When on, tapping a tile flags it' })}
        >
          <Flag size={14} aria-hidden="true" />
          <span>{t('ms-flagmode', { defaultValue: 'Flag mode' })}</span>
        </button>
      </div>

      <div className="ds-ms__host" ref={hostRef}>
        <div
          ref={gridRef}
          className={`ds-ms__board ds-ms__board--${game.status}`}
          role="grid"
          aria-label={t('ms-board', {
            defaultValue: 'Minefield, {{level}}: {{rows}} rows by {{cols}} columns',
            level: levelName,
            rows: game.rows,
            cols: game.cols,
          })}
          aria-rowcount={game.rows}
          aria-colcount={game.cols}
          style={gridStyle}
          onKeyDown={onGridKey}
          onContextMenu={(e) => e.preventDefault()}
        >
          {rows.map((r) => (
            <div role="row" className="ds-ms__row" key={r} aria-rowindex={r + 1}>
              {game.cells.slice(r * game.cols, (r + 1) * game.cols).map((c, ci) => {
                const i = r * game.cols + ci;
                const wrong = game.status === 'lost' && c.state === 'flag' && !c.mine;
                const cls = [
                  'ds-ms__cell',
                  c.state === 'open' ? 'ds-ms__cell--open' : 'ds-ms__cell--closed',
                  c.state === 'open' && !c.mine && c.adj > 0 ? `ds-ms__cell--n${c.adj}` : '',
                  c.state === 'open' && c.mine ? 'ds-ms__cell--mine' : '',
                  i === game.exploded ? 'ds-ms__cell--boom' : '',
                  wrong ? 'ds-ms__cell--wrong' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button
                    key={i}
                    type="button"
                    role="gridcell"
                    data-i={i}
                    aria-colindex={ci + 1}
                    tabIndex={i === focus ? 0 : -1}
                    className={cls}
                    aria-label={t('ms-cell', {
                      defaultValue: 'Row {{row}}, column {{col}}, {{state}}',
                      row: r + 1,
                      col: ci + 1,
                      state: stateLabel(c, i),
                    })}
                    onPointerDown={onCellPointerDown(i)}
                    onMouseDown={onCellMouseDown(i)}
                    onPointerMove={onCellPointerMove}
                    onPointerUp={clearPress}
                    onPointerCancel={clearPress}
                    onPointerLeave={clearPress}
                    onClick={onCellClick(i)}
                    onAuxClick={(e) => {
                      if (e.button === 1) e.preventDefault();
                    }}
                    onContextMenu={onCellContextMenu(i)}
                    onFocus={() => setFocus(i)}
                  >
                    {c.state === 'flag' && (
                      <span className="ds-ms__glyph ds-ms__flag" aria-hidden="true">
                        <Flag />
                        {wrong && <X className="ds-ms__cross" />}
                      </span>
                    )}
                    {c.state === 'q' && (
                      <span className="ds-ms__glyph ds-ms__q" aria-hidden="true">
                        ?
                      </span>
                    )}
                    {c.state === 'open' && c.mine && (
                      <span className="ds-ms__glyph" aria-hidden="true">
                        <Bomb />
                      </span>
                    )}
                    {c.state === 'open' && !c.mine && c.adj > 0 && (
                      <span className="ds-ms__glyph" aria-hidden="true">
                        {c.adj}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="ds-ms__status">
        <span className="ds-ms__counter" title={t('ms-time', { defaultValue: 'Time' })}>
          <Clock size={16} aria-hidden="true" />
          <span className="ds-ms__counter-value">
            <span className="ds-ms__sr">{t('ms-time', { defaultValue: 'Time' })}: </span>
            {elapsed}
          </span>
        </span>
        <span className="ds-ms__level">{levelName}</span>
        <span className="ds-ms__counter" title={t('ms-mines-left', { defaultValue: 'Mines left' })}>
          <span className="ds-ms__counter-value">
            <span className="ds-ms__sr">
              {t('ms-mines-left', { defaultValue: 'Mines left' })}:{' '}
            </span>
            {minesLeft}
          </span>
          <Bomb size={16} aria-hidden="true" />
        </span>
      </div>
      <div className="ds-ms__sr" role="status" aria-live="polite">
        {announce}
      </div>

      {menu && (
        <PopupMenu
          at={{ x: menu.x, y: menu.y }}
          items={menu.which === 'game' ? gameItems : helpItems}
          label={
            menu.which === 'game'
              ? t('ms-menu-game', { defaultValue: 'Game' })
              : t('ms-menu-help', { defaultValue: 'Help' })
          }
          onClose={closeMenu}
        />
      )}

      {dialog && (
        <div className="ds-ms__scrim">
          <div
            ref={dialogRef}
            className="ds-ms__dialog"
            role={dialog === 'lost' || dialog === 'won' ? 'alertdialog' : 'dialog'}
            aria-modal="true"
            aria-labelledby={`${win.id}-ms-dlg`}
          >
            {dialog === 'lost' && (
              <>
                <h2 id={`${win.id}-ms-dlg`} className="ds-ms__dlg-title">
                  {t('ms-lost-title', { defaultValue: 'Game lost' })}
                </h2>
                <p className="ds-ms__dlg-text">
                  {t('ms-lost-body', {
                    defaultValue: 'Sorry, you lost this game. Better luck next time!',
                  })}
                </p>
                <dl className="ds-ms__dl">
                  <dt>{t('ms-time', { defaultValue: 'Time' })}</dt>
                  <dd>{t('ms-seconds', { defaultValue: '{{n}} s', n: lastResult.time })}</dd>
                  <dt>{t('ms-best', { defaultValue: 'Best time' })}</dt>
                  <dd>
                    {lastResult.best === null
                      ? t('ms-none', { defaultValue: '—' })
                      : t('ms-seconds', { defaultValue: '{{n}} s', n: lastResult.best })}
                  </dd>
                </dl>
                <div className="ds-ms__dlg-actions">
                  <button
                    type="button"
                    className="ds-btn7"
                    data-autofocus
                    onClick={() => newGame()}
                  >
                    {t('ms-play-again', { defaultValue: 'Play again' })}
                  </button>
                  <button
                    type="button"
                    className="ds-btn7"
                    onClick={() => useOs.getState().close(win.id)}
                  >
                    {t('ms-exit', { defaultValue: 'Exit' })}
                  </button>
                </div>
              </>
            )}
            {dialog === 'won' && (
              <>
                <h2 id={`${win.id}-ms-dlg`} className="ds-ms__dlg-title">
                  {t('ms-won-title', { defaultValue: 'You won!' })}
                </h2>
                <p className="ds-ms__dlg-text">
                  {lastResult.isBest
                    ? t('ms-won-best', {
                        defaultValue: 'Congratulations — that is your best time on this level!',
                      })
                    : t('ms-won-body', {
                        defaultValue: 'Congratulations, you cleared the minefield.',
                      })}
                </p>
                <dl className="ds-ms__dl">
                  <dt>{t('ms-time', { defaultValue: 'Time' })}</dt>
                  <dd>{t('ms-seconds', { defaultValue: '{{n}} s', n: lastResult.time })}</dd>
                  <dt>{t('ms-best', { defaultValue: 'Best time' })}</dt>
                  <dd>
                    {lastResult.best === null
                      ? t('ms-none', { defaultValue: '—' })
                      : t('ms-seconds', { defaultValue: '{{n}} s', n: lastResult.best })}
                  </dd>
                </dl>
                <div className="ds-ms__dlg-actions">
                  <button
                    type="button"
                    className="ds-btn7"
                    data-autofocus
                    onClick={() => newGame()}
                  >
                    {t('ms-play-again', { defaultValue: 'Play again' })}
                  </button>
                  <button
                    type="button"
                    className="ds-btn7"
                    onClick={() => useOs.getState().close(win.id)}
                  >
                    {t('ms-exit', { defaultValue: 'Exit' })}
                  </button>
                </div>
              </>
            )}
            {dialog === 'custom' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitCustom();
                }}
              >
                <h2 id={`${win.id}-ms-dlg`} className="ds-ms__dlg-title">
                  {t('ms-custom-title', { defaultValue: 'Custom field' })}
                </h2>
                <div className="ds-ms__fields">
                  <label className="ds-ms__field">
                    <span>{t('ms-custom-rows', { defaultValue: 'Height (9–24):' })}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={9}
                      max={24}
                      value={draft.rows}
                      onChange={(e) => setDraft((d) => ({ ...d, rows: e.target.value }))}
                    />
                  </label>
                  <label className="ds-ms__field">
                    <span>{t('ms-custom-cols', { defaultValue: 'Width (9–30):' })}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={9}
                      max={30}
                      value={draft.cols}
                      onChange={(e) => setDraft((d) => ({ ...d, cols: e.target.value }))}
                    />
                  </label>
                  <label className="ds-ms__field">
                    <span>{t('ms-custom-mines', { defaultValue: 'Mines (10–668):' })}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={10}
                      max={668}
                      value={draft.mines}
                      onChange={(e) => setDraft((d) => ({ ...d, mines: e.target.value }))}
                    />
                  </label>
                </div>
                {draftError && (
                  <p className="ds-ms__error" role="alert">
                    {draftError}
                  </p>
                )}
                <div className="ds-ms__dlg-actions">
                  <button type="submit" className="ds-btn7">
                    {t('ms-ok', { defaultValue: 'OK' })}
                  </button>
                  <button type="button" className="ds-btn7" onClick={() => setDialog(null)}>
                    {t('ms-cancel', { defaultValue: 'Cancel' })}
                  </button>
                </div>
              </form>
            )}
            {dialog === 'stats' && (
              <>
                <h2 id={`${win.id}-ms-dlg`} className="ds-ms__dlg-title">
                  {t('ms-stats-title', { defaultValue: 'Minesweeper statistics' })}
                </h2>
                <table className="ds-ms__stats">
                  <thead>
                    <tr>
                      <th scope="col">{t('ms-stats-level', { defaultValue: 'Level' })}</th>
                      <th scope="col">{t('ms-stats-played', { defaultValue: 'Played' })}</th>
                      <th scope="col">{t('ms-stats-won', { defaultValue: 'Won' })}</th>
                      <th scope="col">{t('ms-best', { defaultValue: 'Best time' })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(['beginner', 'intermediate', 'expert'] as const).map((lv) => (
                      <tr key={lv}>
                        <th scope="row">
                          {lv === 'beginner'
                            ? t('ms-level-beginner', { defaultValue: 'Beginner' })
                            : lv === 'intermediate'
                              ? t('ms-level-intermediate', { defaultValue: 'Intermediate' })
                              : t('ms-level-expert', { defaultValue: 'Expert' })}
                        </th>
                        <td>{saved.played[lv] ?? 0}</td>
                        <td>{saved.won[lv] ?? 0}</td>
                        <td>
                          {saved.best[lv] === undefined
                            ? t('ms-none', { defaultValue: '—' })
                            : t('ms-seconds', { defaultValue: '{{n}} s', n: saved.best[lv] })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="ds-ms__dlg-actions">
                  <button
                    type="button"
                    className="ds-btn7"
                    onClick={() => persist((s) => ({ ...s, best: {}, played: {}, won: {} }))}
                  >
                    {t('ms-stats-reset', { defaultValue: 'Reset' })}
                  </button>
                  <button
                    type="button"
                    className="ds-btn7"
                    data-autofocus
                    onClick={() => setDialog(null)}
                  >
                    {t('ms-close', { defaultValue: 'Close' })}
                  </button>
                </div>
              </>
            )}
            {dialog === 'about' && (
              <>
                <h2 id={`${win.id}-ms-dlg`} className="ds-ms__dlg-title">
                  <Icon name="minesweeper" size={16} />
                  <span>{t('ms-about-title', { defaultValue: 'About Minesweeper' })}</span>
                </h2>
                <p className="ds-ms__dlg-text">
                  {t('ms-about-body', {
                    defaultValue:
                      'Clear the minefield without detonating a mine. Numbers tell you how many mines touch that tile. Right-click or long-press to flag; click a satisfied number to clear its neighbours.',
                  })}
                </p>
                <div className="ds-ms__dlg-actions">
                  <button
                    type="button"
                    className="ds-btn7"
                    data-autofocus
                    onClick={() => setDialog(null)}
                  >
                    {t('ms-ok', { defaultValue: 'OK' })}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
