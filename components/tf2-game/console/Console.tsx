/**
 * The developer console panel, shared by TF2, Half-Life 2 and Portal: the
 * Source console's translucent panel over the top of the game, with its
 * scrollback (virtualised, capped by the engine at 2000 lines), the command
 * line with history (↑ ↓) and completion (Tab, or tap a suggestion), Copy,
 * Clear, and an editor for the player's cfg files (`cfg_edit autoexec.cfg`).
 * The engine is lib/tf2-game/console (one per HUD store, found with
 * `gameConsoleFor`); this is a view of it plus its window listeners:
 *
 *   - the backquote key opens and closes it (when the developer console is
 *     enabled — `con_enable`, Options → Keyboard — or `?console=1` / `-console`
 *     opened it this session), Escape closes it;
 *   - keys and mouse buttons bound to console commands (`bind f "say gg"`)
 *     run while it is closed and the game has the keys;
 *   - `net_graph` and `cl_showpos` draw their overlay (./NetGraph.tsx).
 *
 * While it is open the game sees no input (GameHud sets `input.suspended`
 * from `useConsoleOpen`), and the pointer is released.
 *
 * Accessibility: the panel is a labelled region; the scrollback is a `log`
 * with `aria-live="off"` (a console is too chatty to announce) that can be
 * focused and scrolled from the keyboard; only errors are announced, through
 * a separate alert region; the command line is a combobox over its
 * suggestions.
 */
'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Eraser, X } from 'lucide-react';
import type { HudGame } from '@/lib/tf2-game/client/hud-state';
import type { HudStore } from '@/lib/tf2-game/client/hud-store';
import { devConsoleEnabled, type GameSettings } from '@/lib/tf2-game/client/settings';
import type { InputState } from '@/lib/tf2-game/client/input/input-state';
import { releaseAll } from '@/lib/tf2-game/client/input/input-state';
import { mouseCode } from '@/lib/tf2-game/client/input/actions';
import { detectTouchFirst } from '@/lib/tf2-game/client/input/touch';
import { commonPrefix } from '@/lib/tf2-game/console/core';
import { gameConsoleFor } from '@/lib/tf2-game/console/runtime';
import type { GameConsole } from '@/lib/tf2-game/console/game-console';
import NetGraph from './NetGraph';

/** One scrollback line's height in px — keep equal to `--tf2g-con-line` in tf2-game.css. */
const LINE_PX = 16;
/** Lines drawn beyond the visible ones (each side). */
const OVERSCAN = 6;
const MAX_SUGGESTIONS = 8;
/** The scrollback is a scrollable region, so it takes keyboard focus (WCAG 2.1.1) though its role is not interactive. */
const SCROLL_REGION_TAB_INDEX = 0;

const subscribeNoop = () => () => {};

const isTextField = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');

/** Whether the console of this game's store is open (GameHud suspends the game's input while it is). */
export function useConsoleOpen(store: HudStore, game: HudGame): boolean {
  const con = useMemo(() => gameConsoleFor(store, game), [store, game]);
  return useSyncExternalStore(
    (cb) => con.subscribeOpen(cb),
    () => con.isOpen,
    () => false,
  );
}

/** The developer console for a pause-menu entry: whether it may open (con_enable, or `?console=1`), and how to open it. */
export function useConsoleEntry(store: HudStore, game: HudGame, settings: GameSettings): { enabled: boolean; open: () => void } {
  const con = useMemo(() => gameConsoleFor(store, game), [store, game]);
  const touchFirst = useSyncExternalStore(subscribeNoop, detectTouchFirst, () => false);
  // Re-read when the console opens or closes (`?console=1` turns it on for the session that way).
  useSyncExternalStore(
    (cb) => con.subscribeOpen(cb),
    () => con.isOpen,
    () => false,
  );
  const enabled = con.forcedOn || devConsoleEnabled(settings, touchFirst);
  return { enabled, open: useCallback(() => con.setOpen(true), [con]) };
}

export interface ConsoleProps {
  game: HudGame;
  store: HudStore;
  input?: InputState;
  settings: GameSettings;
  onSettingsChange: (next: GameSettings) => void;
}

export default function Console({ game, store, input, settings, onSettingsChange }: ConsoleProps) {
  const { t } = useTranslation('c-tf2-game');
  const con = useMemo(() => gameConsoleFor(store, game, { settings }), [store, game]); // eslint-disable-line react-hooks/exhaustive-deps
  const touchFirst = useSyncExternalStore(subscribeNoop, detectTouchFirst, () => false);
  const open = useSyncExternalStore(
    (cb) => con.subscribeOpen(cb),
    () => con.isOpen,
    () => false,
  );
  const [editing, setEditing] = useState<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const onChangeRef = useRef(onSettingsChange);
  onChangeRef.current = onSettingsChange;

  // The panel lends the console the input state, the settings and the cfg editor.
  useEffect(() => {
    con.setTouchFirst(touchFirst);
  }, [con, touchFirst]);
  useEffect(() => {
    con.attachUi({
      input: input ?? null,
      getSettings: () => settingsRef.current,
      setSettings: (next) => onChangeRef.current(next),
      editFile: (name) => {
        setEditing(name);
        con.setOpen(true);
      },
    });
    if (!con.core.lines.length) {
      con.print(
        t('console_hint', { defaultValue: 'Developer console. help <name>, find <text> and cvarlist describe what exists; Tab completes; ↑ ↓ recall commands.' }),
        'echo',
      );
    }
    return () => con.attachUi(null);
  }, [con, input, t]);
  useEffect(() => {
    con.syncSettings(settings);
  }, [con, settings]);

  // `?console=1` (or `-console`, as the engine's launch option): open at start.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    if (q.get('console') === '1' || q.has('-console')) con.forceOpen();
  }, [con]);

  // The toggle key, Escape, and the console's own binds.
  const inputRef = useRef<HTMLInputElement>(null);
  const inputStateRef = useRef(input);
  inputStateRef.current = input;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Backquote' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // A backquote typed into another field (chat, a cfg) is a character.
        if (isTextField(e.target) && e.target !== inputRef.current) return;
        if (!con.enabled) return;
        // The pause menu, the HUD editor or a chat line has the keys: the console waits (it can always close).
        if (!con.isOpen && inputStateRef.current?.suspended) return;
        e.preventDefault();
        e.stopPropagation();
        con.toggle();
        return;
      }
      if (isTextField(e.target)) return;
      if (con.keyEvent(e.code, true, e.repeat)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      con.keyEvent(e.code, false);
    };
    const locked = () => typeof document !== 'undefined' && document.pointerLockElement !== null;
    const onMouseDown = (e: MouseEvent) => {
      if (locked()) con.keyEvent(mouseCode(e.button), true);
    };
    const onMouseUp = (e: MouseEvent) => {
      con.keyEvent(mouseCode(e.button), false);
    };
    const onWheel = (e: WheelEvent) => {
      if (!locked() || !e.deltaY) return;
      const code = e.deltaY < 0 ? 'MWheelUp' : 'MWheelDown';
      if (con.keyEvent(code, true)) con.keyEvent(code, false);
    };
    const onBlur = () => con.releaseKeys();
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('mouseup', onMouseUp, true);
    window.addEventListener('wheel', onWheel, { capture: true, passive: true });
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('mouseup', onMouseUp, true);
      window.removeEventListener('wheel', onWheel, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [con]);

  // Opening: the game lets go of its keys and the pointer; closing: focus goes back.
  const returnFocus = useRef<Element | null>(null);
  useEffect(() => {
    if (open) {
      con.releaseKeys();
      if (input) releaseAll(input);
      returnFocus.current = document.activeElement;
      if (document.pointerLockElement) document.exitPointerLock();
      inputRef.current?.focus({ preventScroll: true });
    } else {
      setEditing(null);
      const back = returnFocus.current;
      returnFocus.current = null;
      if (back instanceof HTMLElement && back.isConnected && back !== document.body) back.focus({ preventScroll: true });
      else if (document.activeElement instanceof HTMLElement && document.activeElement.closest('.tf2g-console')) document.activeElement.blur();
    }
  }, [open, con, input]);

  return (
    <>
      <NetGraph con={con} />
      {open ? (
        editing ? (
          <CfgEditor con={con} file={editing} onDone={() => setEditing(null)} />
        ) : (
          <ConsolePanel con={con} inputRef={inputRef} onClose={() => con.setOpen(false)} />
        )
      ) : null}
    </>
  );
}

function levelClass(level: string): string {
  return `tf2g-con-line tf2g-con-${level}`;
}

function ConsolePanel({ con, inputRef, onClose }: { con: GameConsole; inputRef: RefObject<HTMLInputElement | null>; onClose: () => void }) {
  const { t } = useTranslation('c-tf2-game');
  const core = con.core;
  const version = useSyncExternalStore(
    (cb) => core.subscribe(cb),
    () => core.version,
    () => 0,
  );
  const lines = core.lines;
  const ids = useId();
  const titleId = `${ids}-title`;
  const listId = `${ids}-suggest`;
  const inputId = `${ids}-input`;

  // ── The scrollback (virtualised) ────────────────────────────────────────
  const logRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(0);
  const [viewH, setViewH] = useState(240);
  const stick = useRef(true);
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    setViewH(el.clientHeight);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const el = logRef.current;
    if (el && stick.current) {
      el.scrollTop = el.scrollHeight;
      setScroll(el.scrollTop);
    }
  }, [version, viewH]);
  const first = Math.max(0, Math.floor(scroll / LINE_PX) - OVERSCAN);
  const last = Math.min(lines.length, Math.ceil((scroll + viewH) / LINE_PX) + OVERSCAN);
  const shown = lines.slice(first, last);

  // ── Errors are announced (only errors: the log itself stays quiet) ──────
  const [alert, setAlert] = useState('');
  const seen = useRef(lines.length ? lines[lines.length - 1].id : 0);
  useEffect(() => {
    let latest: string | null = null;
    for (let i = lines.length - 1; i >= 0 && lines[i].id > seen.current; i--) {
      if (lines[i].level === 'error' && latest === null) latest = lines[i].text;
    }
    if (lines.length) seen.current = lines[lines.length - 1].id;
    if (latest !== null) setAlert(latest);
  }, [version, lines]);

  // ── The command line ────────────────────────────────────────────────────
  const [value, setValue] = useState('');
  const [histPos, setHistPos] = useState(-1);
  const [cycle, setCycle] = useState<{ base: string; index: number } | null>(null);
  const completion = useMemo(() => (value.trim() ? core.complete(value, MAX_SUGGESTIONS * 4) : { start: 0, items: [] }), [core, value]);
  const suggestions = completion.items.slice(0, MAX_SUGGESTIONS);
  const exactOnly = suggestions.length === 1 && value.slice(completion.start).trim() === suggestions[0];
  const listOpen = suggestions.length > 0 && !exactOnly;
  const active = cycle ? cycle.index % Math.max(1, suggestions.length) : -1;

  const applySuggestion = (item: string, trailingSpace = true) => {
    const next = value.slice(0, completion.start) + item + (trailingSpace ? ' ' : '');
    setValue(next);
    setCycle(null);
    inputRef.current?.focus();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const line = value;
    setValue('');
    setHistPos(-1);
    setCycle(null);
    stick.current = true;
    if (line.trim()) con.submit(line);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!completion.items.length) return;
      if (completion.items.length === 1) {
        applySuggestion(completion.items[0]);
        return;
      }
      // Complete the common part first, then cycle through the matches.
      const typed = value.slice(completion.start);
      const common = commonPrefix(completion.items);
      if (!cycle && common.length > typed.length) {
        setValue(value.slice(0, completion.start) + common);
        return;
      }
      const base = cycle?.base ?? value;
      const index = cycle ? cycle.index + (e.shiftKey ? -1 + suggestions.length : 1) : e.shiftKey ? suggestions.length - 1 : 0;
      const item = suggestions[index % suggestions.length];
      setCycle({ base, index });
      setValue(value.slice(0, completion.start) + item);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const hist = core.history;
      if (!hist.length) return;
      e.preventDefault();
      let pos = histPos;
      if (e.key === 'ArrowUp') pos = pos < 0 ? hist.length - 1 : Math.max(0, pos - 1);
      else pos = pos < 0 ? -1 : pos + 1 >= hist.length ? -1 : pos + 1;
      setHistPos(pos);
      setValue(pos < 0 ? '' : hist[pos]);
      setCycle(null);
    }
  };

  const copy = async () => {
    const text = core.lines.map((l) => l.text).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      con.print(t('console_copied', { defaultValue: 'Copied {{n}} lines to the clipboard.', n: core.lines.length }), 'success');
    } catch {
      con.print(t('console_copy_failed', { defaultValue: 'The browser did not allow copying to the clipboard.' }), 'error');
    }
  };

  return (
    <section className="tf2g-console tf2g-interactive" aria-labelledby={titleId} data-jelly="off">
      <header className="tf2g-console-head">
        <h2 id={titleId} className="tf2g-console-title">
          {t('console_title', { defaultValue: 'Console' })}
        </h2>
        <div className="tf2g-console-tools">
          <button type="button" className="tf2g-console-tool" onClick={() => void copy()} aria-label={t('console_copy', { defaultValue: 'Copy console output' })} title={t('console_copy', { defaultValue: 'Copy console output' })}>
            <Copy className="size-4" aria-hidden />
          </button>
          <button type="button" className="tf2g-console-tool" onClick={() => core.clear()} aria-label={t('console_clear', { defaultValue: 'Clear console' })} title={t('console_clear', { defaultValue: 'Clear console' })}>
            <Eraser className="size-4" aria-hidden />
          </button>
          <button type="button" className="tf2g-console-tool" onClick={onClose} aria-label={t('console_close', { defaultValue: 'Close console' })} title={t('console_close', { defaultValue: 'Close console' })}>
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </header>
      <div
        ref={logRef}
        className="tf2g-console-log"
        role="log"
        aria-live="off"
        aria-label={t('console_log_label', { defaultValue: 'Console output' })}
        tabIndex={SCROLL_REGION_TAB_INDEX}
        onScroll={(e) => {
          const el = e.currentTarget;
          setScroll(el.scrollTop);
          stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - LINE_PX;
        }}
      >
        <div className="tf2g-console-lines" style={{ height: lines.length * LINE_PX }}>
          {shown.map((l, i) => (
            <div key={l.id} className={levelClass(l.level)} style={{ top: (first + i) * LINE_PX }}>
              {l.text || ' '}
            </div>
          ))}
        </div>
      </div>
      {listOpen ? (
        <ul id={listId} className="tf2g-console-suggest" role="listbox" aria-label={t('console_suggestions', { defaultValue: 'Suggestions' })}>
          {suggestions.map((s, i) => (
            <li key={s} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button type="button" tabIndex={-1} className="tf2g-console-option" data-active={i === active || undefined} onMouseDown={(e) => e.preventDefault()} onClick={() => applySuggestion(s)}>
                {s}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form className="tf2g-console-row" onSubmit={submit}>
        <label htmlFor={inputId} className="tf2g-sr">
          {t('console_input_label', { defaultValue: 'Console command' })}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          className="tf2g-console-input"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setCycle(null);
            setHistPos(-1);
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listOpen ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={listOpen && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          maxLength={510}
        />
        <button type="submit" className="tf2g-console-submit">
          {t('console_submit', { defaultValue: 'Submit' })}
        </button>
      </form>
      <div className="tf2g-sr" role="alert">
        {alert}
      </div>
    </section>
  );
}

function CfgEditor({ con, file, onDone }: { con: GameConsole; file: string; onDone: () => void }) {
  const { t } = useTranslation('c-tf2-game');
  const [text, setText] = useState(() => con.readFile(file));
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section className="tf2g-console tf2g-interactive" aria-labelledby={`${id}-title`} data-jelly="off">
      <header className="tf2g-console-head">
        <h2 id={`${id}-title`} className="tf2g-console-title">
          {t('console_editing', { defaultValue: 'Editing {{file}}', file })}
        </h2>
      </header>
      <label htmlFor={`${id}-text`} className="tf2g-sr">
        {t('console_editor_label', { defaultValue: 'Contents of {{file}}', file })}
      </label>
      <textarea
        ref={ref}
        id={`${id}-text`}
        className="tf2g-console-editor"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onDone();
          }
        }}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
      <div className="tf2g-console-row tf2g-console-row-end">
        <button type="button" className="tf2g-console-submit tf2g-console-quiet" onClick={onDone}>
          {t('console_cancel', { defaultValue: 'Cancel' })}
        </button>
        <button
          type="button"
          className="tf2g-console-submit"
          onClick={() => {
            if (con.writeFile(file, text)) onDone();
          }}
        >
          {t('console_save', { defaultValue: 'Save' })}
        </button>
      </div>
    </section>
  );
}
