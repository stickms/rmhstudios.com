'use client';

/**
 * Windows 7 Calculator, Standard mode, for the Dunesday 7 sandbox.
 *
 * Immediate-execution semantics like the real one: `2 + 3 × 4 =` is 20, an
 * operator pressed twice just swaps the operator, `=` pressed again repeats
 * the last operation, and the unary keys (√, 1/x, ±, %) act on the number
 * on screen. Memory keys, a history line above the display, full keyboard
 * input, and View ▸ "Days until Dunesday" — the date-calculation panel,
 * counting down to 18 December.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { daysBetween, formatMinutes } from '@/lib/dunesday/schedule';
import { DUNESDAY } from '@/lib/dunesday/titles';
import { cn } from '@/lib/utils';
import { useDunesday } from '../../DunesdayProvider';
import { sfx } from '../../sound';
import { openApp } from '../actions';
import type { AppProps } from '../apps';
import { PopupMenu, type MenuItem } from '../Menu';
import { useOs } from '../store';

type Op = '+' | '-' | '*' | '/';
type Err = 'div0' | 'undefined' | 'invalid' | 'overflow';

interface Calc {
  entry: string;
  /** The left operand once an operator has been pressed. */
  acc: number | null;
  op: Op | null;
  /** True when the next digit starts a new number. */
  fresh: boolean;
  /** Tokens shown on the history line ("12 + sqrt(9) ×"). */
  history: string[];
  /** How the number on screen was made, when a unary key made it ("sqrt(9)"). */
  expr: string | null;
  last: { op: Op; operand: number } | null;
  memory: number | null;
  error: Err | null;
}

const INITIAL: Calc = {
  entry: '0',
  acc: null,
  op: null,
  fresh: true,
  history: [],
  expr: null,
  last: null,
  memory: null,
  error: null,
};

const SHOW: Record<Op, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };

/** 16 significant digits at most, like the real display. */
function fmt(n: number): string {
  if (Object.is(n, -0) || n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e16 || abs < 1e-15) {
    const [mant, exp] = n.toExponential(15).split('e');
    const m = mant.replace(/\.?0+$/, '');
    return `${m.includes('.') ? m : `${m}.`}e${exp.startsWith('-') ? exp : `+${exp}`}`;
  }
  const s = String(Number(n.toPrecision(16)));
  if (!s.includes('e')) return s;
  return n.toFixed(Math.min(20, 16 + Math.ceil(-Math.log10(abs)))).replace(/\.?0+$/, '');
}

function apply(a: number, op: Op, b: number): number | Err {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      if (b === 0) return a === 0 ? 'undefined' : 'div0';
      return a / b;
  }
}

const check = (r: number | Err): number | Err =>
  typeof r === 'number' && !Number.isFinite(r) ? 'overflow' : r;

type Key =
  | { k: 'digit'; d: string }
  | { k: 'dot' }
  | { k: 'op'; op: Op }
  | { k: 'eq' }
  | { k: 'sqrt' }
  | { k: 'inv' }
  | { k: 'neg' }
  | { k: 'pct' }
  | { k: 'back' }
  | { k: 'ce' }
  | { k: 'c' }
  | { k: 'mc' }
  | { k: 'mr' }
  | { k: 'ms' }
  | { k: 'mplus' }
  | { k: 'mminus' };

function reduce(s: Calc, key: Key): Calc {
  const value = Number(s.entry);
  const fail = (error: Err): Calc => ({ ...s, error, fresh: true });

  if (s.error) {
    if (key.k === 'c' || key.k === 'ce') return { ...INITIAL, memory: s.memory };
    if (key.k === 'digit' || key.k === 'dot') s = { ...INITIAL, memory: s.memory };
    else return s;
  }

  switch (key.k) {
    case 'digit': {
      if (s.fresh) return { ...s, entry: key.d, fresh: false, expr: null };
      if (s.entry.replace(/[-.]/g, '').length >= 16) return s;
      return {
        ...s,
        entry: s.entry === '0' ? key.d : s.entry === '-0' ? `-${key.d}` : s.entry + key.d,
      };
    }
    case 'dot': {
      if (s.fresh) return { ...s, entry: '0.', fresh: false, expr: null };
      if (s.entry.includes('.')) return s;
      return { ...s, entry: `${s.entry}.` };
    }
    case 'op': {
      const token = s.expr ?? fmt(value);
      // Operator pressed twice: just swap it.
      if (s.op && s.fresh && !s.expr) {
        return { ...s, op: key.op, history: [...s.history.slice(0, -1), SHOW[key.op]] };
      }
      let acc = value;
      if (s.op && s.acc !== null) {
        const r = check(apply(s.acc, s.op, value));
        if (typeof r !== 'number') return fail(r);
        acc = r;
      }
      return {
        ...s,
        acc,
        op: key.op,
        entry: fmt(acc),
        fresh: true,
        expr: null,
        history: [...s.history, token, SHOW[key.op]],
      };
    }
    case 'eq': {
      if (s.op && s.acc !== null) {
        const r = check(apply(s.acc, s.op, value));
        if (typeof r !== 'number') return { ...fail(r), history: [] };
        return {
          ...s,
          entry: fmt(r),
          acc: null,
          op: null,
          fresh: true,
          expr: null,
          history: [],
          last: { op: s.op, operand: value },
        };
      }
      if (s.last) {
        const r = check(apply(value, s.last.op, s.last.operand));
        if (typeof r !== 'number') return fail(r);
        return { ...s, entry: fmt(r), fresh: true, expr: null, history: [] };
      }
      return { ...s, fresh: true, expr: null, history: [] };
    }
    case 'sqrt': {
      if (value < 0) return fail('invalid');
      return {
        ...s,
        entry: fmt(Math.sqrt(value)),
        fresh: true,
        expr: `sqrt(${s.expr ?? fmt(value)})`,
      };
    }
    case 'inv': {
      if (value === 0) return fail('div0');
      return {
        ...s,
        entry: fmt(1 / value),
        fresh: true,
        expr: `reciproc(${s.expr ?? fmt(value)})`,
      };
    }
    case 'neg': {
      if (!s.fresh) {
        return {
          ...s,
          entry: s.entry.startsWith('-') ? s.entry.slice(1) : s.entry === '0' ? '0' : `-${s.entry}`,
        };
      }
      return { ...s, entry: fmt(-value), expr: `negate(${s.expr ?? fmt(value)})` };
    }
    case 'pct': {
      const r = s.acc === null ? 0 : (s.acc * value) / 100;
      return { ...s, entry: fmt(r), fresh: true, expr: fmt(r) };
    }
    case 'back': {
      if (s.fresh) return s;
      const next = s.entry.slice(0, -1);
      return { ...s, entry: next === '' || next === '-' ? '0' : next };
    }
    case 'ce':
      return { ...s, entry: '0', fresh: true, expr: null };
    case 'c':
      return { ...INITIAL, memory: s.memory };
    case 'mc':
      return { ...s, memory: null };
    case 'mr':
      return s.memory === null ? s : { ...s, entry: fmt(s.memory), fresh: true, expr: null };
    case 'ms':
      return { ...s, memory: value, fresh: true };
    case 'mplus':
      return { ...s, memory: (s.memory ?? 0) + value, fresh: true };
    case 'mminus':
      return { ...s, memory: (s.memory ?? 0) - value, fresh: true };
  }
}

const DATE_PANEL_W = 280;
const BASE_W = 300;

export default function CalculatorApp({ win }: AppProps) {
  const { t, i18n } = useTranslation('c-dunesday');
  const { today, remainingMinutes } = useDunesday();
  const activeId = useOs((s) => s.activeId);
  const setRect = useOs((s) => s.setRect);
  const [calc, setCalc] = useState<Calc>(INITIAL);
  const [menu, setMenu] = useState<null | {
    which: 'view' | 'edit' | 'help';
    x: number;
    y: number;
  }>(null);
  const [datePanel, setDatePanel] = useState(false);
  const [from, setFrom] = useState(today);

  const press = useCallback((key: Key) => {
    setCalc((s) => reduce(s, key));
    sfx.tick();
  }, []);

  // The date panel widens the window to its right, as in Windows 7.
  const toggleDate = () => {
    const next = !datePanel;
    setDatePanel(next);
    if (!win.max)
      setRect(win.id, { w: Math.max(240, win.w + (next ? DATE_PANEL_W : -DATE_PANEL_W)) });
  };
  const toggleRef = useRef(toggleDate);
  useEffect(() => {
    toggleRef.current = toggleDate;
  });

  // A window remembered at its widened size reopens without the panel: shrink it back.
  useEffect(() => {
    if (!win.max && win.w >= BASE_W + DATE_PANEL_W - 20)
      setRect(win.id, { w: win.w - DATE_PANEL_W });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard: only while this window is the active one, and never while the
  // viewer is typing into a field somewhere (the date panel's own input).
  useEffect(() => {
    if (activeId !== win.id) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable)
      )
        return;
      let key: Key | null = null;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl) {
        const c = e.key.toLowerCase();
        if (c === 'm') key = { k: 'ms' };
        else if (c === 'r') key = { k: 'mr' };
        else if (c === 'l') key = { k: 'mc' };
        else if (c === 'p') key = { k: 'mplus' };
        else if (c === 'q') key = { k: 'mminus' };
        else if (c === 'e') {
          e.preventDefault();
          toggleRef.current();
          return;
        } else if (c === 'c') {
          void navigator.clipboard?.writeText(calc.entry).catch(() => {});
          return;
        }
      } else if (/^[0-9]$/.test(e.key)) key = { k: 'digit', d: e.key };
      else if (e.key === '.' || e.key === ',') key = { k: 'dot' };
      else if (e.key === '+' || e.key === '-' || e.key === '*' || e.key === '/')
        key = { k: 'op', op: e.key };
      else if (e.key === 'Enter' || e.key === '=') key = { k: 'eq' };
      else if (e.key === 'Backspace') key = { k: 'back' };
      else if (e.key === 'Escape') key = { k: 'c' };
      else if (e.key === 'Delete') key = { k: 'ce' };
      else if (e.key === '%') key = { k: 'pct' };
      else if (e.key === '@') key = { k: 'sqrt' };
      else if (e.key.toLowerCase() === 'r') key = { k: 'inv' };
      else if (e.key === 'F9') key = { k: 'neg' };
      if (!key) return;
      e.preventDefault();
      press(key);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeId, win.id, press, calc.entry]);

  const errorText =
    calc.error === 'div0'
      ? t('calc-div0', { defaultValue: 'Cannot divide by zero' })
      : calc.error === 'undefined'
        ? t('calc-undefined', { defaultValue: 'Result is undefined' })
        : calc.error === 'overflow'
          ? t('calc-overflow', { defaultValue: 'Overflow' })
          : calc.error === 'invalid'
            ? t('calc-invalid', { defaultValue: 'Invalid input' })
            : null;
  const shown = errorText ?? calc.entry;
  const historyLine = [...calc.history, ...(calc.expr ? [calc.expr] : [])].join(' ');

  const btn = (
    label: string,
    key: Key,
    opts: { aria?: string; cls?: string; span?: 'tall' | 'wide' } = {},
  ) => (
    <button
      type="button"
      className={cn('ds-calc-key', opts.cls, opts.span && `ds-calc-key--${opts.span}`)}
      aria-label={opts.aria}
      disabled={!!calc.error && !['digit', 'dot', 'c', 'ce'].includes(key.k)}
      onClick={() => press(key)}
    >
      {label}
    </button>
  );

  const openMenu =
    (which: 'view' | 'edit' | 'help') => (e: React.MouseEvent<HTMLButtonElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setMenu({ which, x: r.left, y: r.bottom });
    };

  const menuItems = (which: 'view' | 'edit' | 'help'): MenuItem[] => {
    if (which === 'view') {
      return [
        {
          label: t('calc-standard', { defaultValue: 'Standard' }),
          checked: true,
          onSelect: () => {},
        },
        { separator: true },
        {
          label: t('calc-days-until', { defaultValue: 'Days until Dunesday' }),
          checked: datePanel,
          hint: 'Ctrl+E',
          onSelect: toggleDate,
        },
      ];
    }
    if (which === 'edit') {
      return [
        {
          label: t('calc-copy', { defaultValue: 'Copy' }),
          hint: 'Ctrl+C',
          onSelect: () => void navigator.clipboard?.writeText(calc.entry).catch(() => {}),
        },
        {
          label: t('calc-paste', { defaultValue: 'Paste' }),
          hint: 'Ctrl+V',
          onSelect: () =>
            void navigator.clipboard
              ?.readText()
              .then((text) => {
                const n = Number(text.trim());
                if (Number.isFinite(n))
                  setCalc((s) => ({ ...s, entry: fmt(n), fresh: false, expr: null, error: null }));
              })
              .catch(() => {}),
        },
        { separator: true },
        {
          label: t('calc-clear-history', { defaultValue: 'Clear history' }),
          onSelect: () => setCalc((s) => ({ ...s, history: [], expr: null })),
        },
      ];
    }
    return [
      {
        label: t('calc-about', { defaultValue: 'About Calculator' }),
        onSelect: () => void openApp('about'),
      },
    ];
  };

  // Date panel numbers.
  const daysLeft = daysBetween(today, DUNESDAY);
  const fromDays = /^\d{4}-\d{2}-\d{2}$/.test(from) ? daysBetween(from, DUNESDAY) : null;
  const weeks = fromDays === null ? 0 : Math.trunc(fromDays / 7);
  const rem = fromDays === null ? 0 : fromDays % 7;
  const perDay = daysLeft > 0 ? remainingMinutes / daysLeft : remainingMinutes;
  const dunesdayLabel = new Date(`${DUNESDAY}T00:00:00`).toLocaleDateString(i18n.language, {
    dateStyle: 'long',
  });

  return (
    <div className={cn('ds-calc', datePanel && 'ds-calc--date')}>
      <div
        className="ds-calc-menubar"
        role="menubar"
        aria-label={t('calc-menubar', { defaultValue: 'Calculator menu' })}
      >
        <button type="button" role="menuitem" aria-haspopup="menu" onClick={openMenu('view')}>
          {t('calc-menu-view', { defaultValue: 'View' })}
        </button>
        <button type="button" role="menuitem" aria-haspopup="menu" onClick={openMenu('edit')}>
          {t('calc-menu-edit', { defaultValue: 'Edit' })}
        </button>
        <button type="button" role="menuitem" aria-haspopup="menu" onClick={openMenu('help')}>
          {t('calc-menu-help', { defaultValue: 'Help' })}
        </button>
      </div>

      <div className="ds-calc-main">
        <div className="ds-calc-body">
          <div className="ds-calc-display">
            <div className="ds-calc-history" aria-hidden="true">
              {historyLine || ' '}
            </div>
            <div className="ds-calc-row">
              <span
                className="ds-calc-mem"
                title={calc.memory !== null ? fmt(calc.memory) : undefined}
              >
                {calc.memory !== null ? 'M' : ''}
                {calc.memory !== null && (
                  <span className="ds-sr-only">
                    {t('calc-memory-on', { defaultValue: 'Memory holds a value' })}
                  </span>
                )}
              </span>
              <output
                className={cn(
                  'ds-calc-value',
                  shown.length > 11 && 'ds-calc-value--small',
                  shown.length > 17 && 'ds-calc-value--tiny',
                )}
                aria-live="polite"
                aria-atomic="true"
              >
                {shown}
              </output>
            </div>
          </div>

          <div
            className="ds-calc-keys"
            role="group"
            aria-label={t('calc-keypad', { defaultValue: 'Keypad' })}
          >
            {btn(
              'MC',
              { k: 'mc' },
              { aria: t('calc-mc', { defaultValue: 'Memory clear' }), cls: 'ds-calc-key--mem' },
            )}
            {btn(
              'MR',
              { k: 'mr' },
              { aria: t('calc-mr', { defaultValue: 'Memory recall' }), cls: 'ds-calc-key--mem' },
            )}
            {btn(
              'MS',
              { k: 'ms' },
              { aria: t('calc-ms', { defaultValue: 'Memory store' }), cls: 'ds-calc-key--mem' },
            )}
            {btn(
              'M+',
              { k: 'mplus' },
              { aria: t('calc-mplus', { defaultValue: 'Memory add' }), cls: 'ds-calc-key--mem' },
            )}
            {btn(
              'M-',
              { k: 'mminus' },
              {
                aria: t('calc-mminus', { defaultValue: 'Memory subtract' }),
                cls: 'ds-calc-key--mem',
              },
            )}

            {btn('←', { k: 'back' }, { aria: t('calc-backspace', { defaultValue: 'Backspace' }) })}
            {btn('CE', { k: 'ce' }, { aria: t('calc-ce', { defaultValue: 'Clear entry' }) })}
            {btn('C', { k: 'c' }, { aria: t('calc-c', { defaultValue: 'Clear' }) })}
            {btn('±', { k: 'neg' }, { aria: t('calc-negate', { defaultValue: 'Negate' }) })}
            {btn('√', { k: 'sqrt' }, { aria: t('calc-sqrt', { defaultValue: 'Square root' }) })}

            {btn('7', { k: 'digit', d: '7' })}
            {btn('8', { k: 'digit', d: '8' })}
            {btn('9', { k: 'digit', d: '9' })}
            {btn('/', { k: 'op', op: '/' }, { aria: t('calc-divide', { defaultValue: 'Divide' }) })}
            {btn('%', { k: 'pct' }, { aria: t('calc-percent', { defaultValue: 'Percent' }) })}

            {btn('4', { k: 'digit', d: '4' })}
            {btn('5', { k: 'digit', d: '5' })}
            {btn('6', { k: 'digit', d: '6' })}
            {btn(
              '*',
              { k: 'op', op: '*' },
              { aria: t('calc-multiply', { defaultValue: 'Multiply' }) },
            )}
            {btn(
              '1/x',
              { k: 'inv' },
              { aria: t('calc-reciprocal', { defaultValue: 'Reciprocal' }) },
            )}

            {btn('1', { k: 'digit', d: '1' })}
            {btn('2', { k: 'digit', d: '2' })}
            {btn('3', { k: 'digit', d: '3' })}
            {btn(
              '-',
              { k: 'op', op: '-' },
              { aria: t('calc-subtract', { defaultValue: 'Subtract' }) },
            )}
            {btn(
              '=',
              { k: 'eq' },
              {
                aria: t('calc-equals', { defaultValue: 'Equals' }),
                span: 'tall',
                cls: 'ds-calc-key--eq',
              },
            )}

            {btn('0', { k: 'digit', d: '0' }, { span: 'wide' })}
            {btn(
              '.',
              { k: 'dot' },
              { aria: t('calc-decimal', { defaultValue: 'Decimal separator' }) },
            )}
            {btn('+', { k: 'op', op: '+' }, { aria: t('calc-add', { defaultValue: 'Add' }) })}
          </div>
        </div>

        {datePanel && (
          <section
            className="ds-calc-date"
            aria-label={t('calc-days-until', { defaultValue: 'Days until Dunesday' })}
          >
            <h2>{t('calc-days-until', { defaultValue: 'Days until Dunesday' })}</h2>
            <p className="ds-calc-date-sub">
              {t('calc-date-sub', {
                defaultValue: 'Avengers: Doomsday and Dune: Part Three open on {{date}}.',
                date: dunesdayLabel,
              })}
            </p>
            <div className="ds-calc-date-big" aria-live="polite">
              <strong>{Math.max(0, daysLeft)}</strong>
              <span>
                {t('calc-days-left', { defaultValue: 'days to go', count: Math.max(0, daysLeft) })}
              </span>
            </div>
            <label className="ds-calc-date-field">
              <span>{t('calc-from', { defaultValue: 'From' })}</span>
              <input
                type="date"
                value={from}
                max={DUNESDAY}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <dl className="ds-calc-date-out">
              <dt>{t('calc-difference', { defaultValue: 'Difference' })}</dt>
              <dd>
                {fromDays === null
                  ? '—'
                  : t('calc-weeks-days', {
                      defaultValue: '{{weeks}} weeks, {{days}} days',
                      weeks,
                      days: rem,
                    })}
              </dd>
              <dt>{t('calc-in-days', { defaultValue: 'In days' })}</dt>
              <dd>{fromDays === null ? '—' : fromDays}</dd>
              <dt>{t('calc-per-day', { defaultValue: 'Marathon per day' })}</dt>
              <dd>{formatMinutes(perDay)}</dd>
            </dl>
            <button type="button" className="ds-btn7" onClick={() => setFrom(today)}>
              {t('calc-today', { defaultValue: 'Today' })}
            </button>
          </section>
        )}
      </div>

      {menu && (
        <PopupMenu
          at={{ x: menu.x, y: menu.y }}
          label={t('calc-menu', { defaultValue: 'Menu' })}
          items={menuItems(menu.which)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
