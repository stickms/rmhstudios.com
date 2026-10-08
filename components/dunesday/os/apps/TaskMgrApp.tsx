'use client';

/**
 * Windows Task Manager for the Dunesday 7 sandbox.
 *
 * Applications lists the desktop's open windows (End Task, Switch To, New
 * Task… opens Run). Processes shows one pseudo process per window plus the
 * shell's own (explorer.exe, dwm.exe, dunesday.exe). Performance graphs real
 * numbers where there are some — how much of the marathon is watched, how far
 * through tonight's block you are, how full the sandbox's storage is — next to
 * a modest, made-up CPU line. Graphs sample once a second on a plain interval.
 *
 * The section switcher is a `radiogroup` (it picks a view; arrow keys move it),
 * not a tab strip.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMinutes } from '@/lib/dunesday/schedule';
import { allTitles, isIncluded, runtimeOf } from '@/lib/dunesday/state';
import { HOME, QUOTA_BYTES, byteSize } from '@/lib/dunesday/vfs';
import { cn } from '@/lib/utils';
import { useDunesday } from '../../DunesdayProvider';
import { sfx } from '../../sound';
import { openApp, showMessage } from '../actions';
import { APPS } from '../apps';
import type { AppProps } from '../apps';
import { Icon } from '../icons';
import { PopupMenu, type MenuItem } from '../Menu';
import { useOs, type AppId, type Win } from '../store';

type Section = 'apps' | 'procs' | 'perf';
const SECTIONS: Section[] = ['apps', 'procs', 'perf'];

/** Which image each app runs as; null = hosted by explorer.exe. */
const IMAGE: Record<AppId, string | null> = {
  welcome: 'welcome.exe',
  planner: 'planner.exe',
  calendar: 'mcalendar.exe',
  explorer: null,
  messenger: 'msnmsgr.exe',
  sync: 'mobsync.exe',
  player: 'wmplayer.exe',
  notepad: 'notepad.exe',
  paint: 'mspaint.exe',
  photos: 'dllhost.exe',
  calculator: 'calc.exe',
  cmd: 'cmd.exe',
  taskmgr: 'taskmgr.exe',
  ie: 'iexplore.exe',
  minesweeper: 'MineSweeper.exe',
  solitaire: 'Solitaire.exe',
  spider: 'SpiderSolitaire.exe',
  personalize: 'rundll32.exe',
  properties: null,
  aquarium: 'aquarium.scr',
  about: 'winver.exe',
  run: null,
  dialog: null,
};

const MEM_K: Partial<Record<AppId, number>> = {
  ie: 48320,
  player: 22816,
  paint: 9412,
  messenger: 14208,
  planner: 18944,
  calendar: 12672,
  solitaire: 11520,
  spider: 12288,
  minesweeper: 7680,
  aquarium: 16384,
  photos: 8960,
  cmd: 2312,
  notepad: 1824,
  calculator: 3096,
  taskmgr: 4120,
};

const TOTAL_K = 2_097_152;
const BASE_USED_K = 786_432;
const HISTORY = 60;

function pidOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ((h % 2400) + 260) * 4;
}

interface Proc {
  key: string;
  image: string;
  pid: number;
  mem: number;
  desc: string;
  win?: Win;
}

interface Sample {
  cpu: number;
  marathon: number;
  tonight: number;
}

function Graph({ values, label }: { values: number[]; label: string }) {
  const step = 100 / (HISTORY - 1);
  const offset = HISTORY - values.length;
  const points = values
    .map((v, i) => `${((offset + i) * step).toFixed(2)},${(100 - v).toFixed(2)}`)
    .join(' ');
  return (
    <svg
      className="ds-tm-graph"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <line
          key={`h${i}`}
          x1="0"
          x2="100"
          y1={(i + 1) * 10}
          y2={(i + 1) * 10}
          className="ds-tm-grid"
        />
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <line
          key={`v${i}`}
          y1="0"
          y2="100"
          x1={(i + 1) * 10}
          x2={(i + 1) * 10}
          className="ds-tm-grid"
        />
      ))}
      {values.length > 1 && <polyline points={points} className="ds-tm-line" />}
    </svg>
  );
}

function Gauge({ value, caption }: { value: number; caption: string }) {
  return (
    <div className="ds-tm-gauge" aria-hidden="true">
      <div className="ds-tm-gauge-bar">
        <span style={{ height: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <span className="ds-tm-gauge-text">{caption}</span>
    </div>
  );
}

export default function TaskMgrApp({ win }: AppProps) {
  const { t, i18n } = useTranslation('c-dunesday');
  const { state, pct, tonight, today } = useDunesday();
  const windows = useOs((s) => s.windows);
  const vfs = useOs((s) => s.vfs);
  const focus = useOs((s) => s.focus);
  const close = useOs((s) => s.close);

  const [section, setSection] = useState<Section>('apps');
  const [selApp, setSelApp] = useState<string | null>(null);
  const [selProc, setSelProc] = useState<string | null>(null);
  const [menu, setMenu] = useState<null | { which: 'file' | 'view'; x: number; y: number }>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const segRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const num = (n: number) => n.toLocaleString(i18n.language);
  const user = vfs[HOME]?.name ?? '';
  const titleOf = (w: Win) => w.title || APPS[w.app].title(t);

  const procs: Proc[] = useMemo(() => {
    const sys: Proc[] = [
      {
        key: 'sys:explorer',
        image: 'explorer.exe',
        pid: 1888,
        mem: 24512,
        desc: t('tm-desc-explorer', { defaultValue: 'Windows Explorer' }),
      },
      {
        key: 'sys:dwm',
        image: 'dwm.exe',
        pid: 1412,
        mem: 18240,
        desc: t('tm-desc-dwm', { defaultValue: 'Desktop Window Manager' }),
      },
      {
        key: 'sys:dunesday',
        image: 'dunesday.exe',
        pid: 2026,
        mem: 32768,
        desc: t('tm-desc-dunesday', { defaultValue: 'Dunesday 7 shell' }),
      },
    ];
    const own = windows
      .filter((w) => IMAGE[w.app])
      .map((w) => ({
        key: w.id,
        image: IMAGE[w.app] as string,
        pid: pidOf(w.id),
        mem: MEM_K[w.app] ?? 6144,
        desc: APPS[w.app].title(t),
        win: w,
      }));
    return [...sys, ...own].sort((a, b) =>
      a.image.localeCompare(b.image, undefined, { sensitivity: 'base' }),
    );
  }, [windows, t]);

  const memUsedK = BASE_USED_K + procs.reduce((a, p) => a + p.mem, 0);
  const memPct = Math.round((memUsedK / TOTAL_K) * 100);
  const storageBytes = useMemo(() => byteSize(vfs), [vfs]);
  const storagePct = Math.min(100, Math.round((storageBytes / QUOTA_BYTES) * 100));

  // Tonight: how far through the evening's block, counting what's already ticked off today.
  const tonightStats = useMemo(() => {
    let done = 0;
    for (const x of allTitles(state)) {
      if (state.watched[x.id] === today && isIncluded(state, x)) done += runtimeOf(state, x);
    }
    const left = tonight?.minutes ?? 0;
    const total = done + left;
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [state, today, tonight]);

  // Latest values for the sampler, read from a ref so the interval never restarts.
  const live = useRef({ windows: windows.length, marathon: pct, tonight: tonightStats.pct });
  useEffect(() => {
    live.current = { windows: windows.length, marathon: pct, tonight: tonightStats.pct };
  }, [windows.length, pct, tonightStats.pct]);

  useEffect(() => {
    const sample = () => {
      const l = live.current;
      const cpu = Math.min(100, Math.round(1 + l.windows * 1.5 + Math.random() * 4));
      setSamples((cur) =>
        [...cur, { cpu, marathon: l.marathon, tonight: l.tonight }].slice(-HISTORY),
      );
      setNow(Date.now());
    };
    sample();
    const id = window.setInterval(sample, 1000);
    return () => window.clearInterval(id);
  }, []);

  const cpuNow = samples[samples.length - 1]?.cpu ?? 0;

  const sectionLabel = (s: Section) =>
    s === 'apps'
      ? t('tm-applications', { defaultValue: 'Applications' })
      : s === 'procs'
        ? t('tm-processes', { defaultValue: 'Processes' })
        : t('tm-performance', { defaultValue: 'Performance' });

  const onSegKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + SECTIONS.length) % SECTIONS.length;
    setSection(SECTIONS[next]);
    segRefs.current[next]?.focus();
  };

  const endTask = (id: string | null) => {
    if (!id) return;
    sfx.pop();
    close(id);
    setSelApp(null);
  };
  const switchTo = (id: string | null) => {
    if (!id) return;
    sfx.tick();
    focus(id);
  };
  const endProcess = () => {
    const p = procs.find((x) => x.key === selProc);
    if (!p) return;
    if (!p.win) {
      showMessage({
        icon: 'warning',
        title: t('app-taskmgr', { defaultValue: 'Windows Task Manager' }),
        text: t('tm-critical', {
          defaultValue: '“{{name}}” is a critical part of Dunesday 7 and can’t be ended.',
          name: p.image,
        }),
      });
      return;
    }
    sfx.pop();
    close(p.win.id);
    setSelProc(null);
  };

  /** Roving focus for a list of rows; Enter runs `onEnter`, Delete runs `onDelete`. */
  const rowKeys =
    (
      ids: string[],
      current: string | null,
      select: (id: string) => void,
      onEnter: () => void,
      onDelete: () => void,
    ) =>
    (e: KeyboardEvent<HTMLDivElement>) => {
      const idx = Math.max(0, ids.indexOf(current ?? ''));
      let next: number | null = null;
      if (e.key === 'ArrowDown') next = Math.min(ids.length - 1, idx + 1);
      else if (e.key === 'ArrowUp') next = Math.max(0, idx - 1);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = ids.length - 1;
      else if (e.key === 'Enter') {
        e.preventDefault();
        onEnter();
        return;
      } else if (e.key === 'Delete') {
        e.preventDefault();
        onDelete();
        return;
      }
      if (next === null || !ids[next]) return;
      e.preventDefault();
      select(ids[next]);
      document.getElementById(`${win.id}-row-${ids[next]}`)?.focus();
    };

  const appIds = windows.map((w) => w.id);
  const procIds = procs.map((p) => p.key);

  const menuItems = (which: 'file' | 'view'): MenuItem[] =>
    which === 'file'
      ? [
          {
            label: t('tm-new-task-run', { defaultValue: 'New Task (Run...)' }),
            onSelect: () => openApp('run'),
          },
          { separator: true },
          {
            label: t('tm-exit', { defaultValue: 'Exit Task Manager' }),
            onSelect: () => close(win.id),
          },
        ]
      : [
          {
            label: t('tm-view-apps', { defaultValue: 'Applications' }),
            checked: section === 'apps',
            onSelect: () => setSection('apps'),
          },
          {
            label: t('tm-view-procs', { defaultValue: 'Processes' }),
            checked: section === 'procs',
            onSelect: () => setSection('procs'),
          },
          {
            label: t('tm-view-perf', { defaultValue: 'Performance' }),
            checked: section === 'perf',
            onSelect: () => setSection('perf'),
          },
        ];

  const openMenu = (which: 'file' | 'view') => (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ which, x: r.left, y: r.bottom });
  };

  const upSec = Math.floor((now - startedAt) / 1000);
  const upTime = `${String(Math.floor(upSec / 3600)).padStart(2, '0')}:${String(Math.floor((upSec % 3600) / 60)).padStart(2, '0')}:${String(upSec % 60).padStart(2, '0')}`;

  return (
    <div className="ds-tm">
      <div
        className="ds-tm-menubar"
        role="menubar"
        aria-label={t('tm-menubar', { defaultValue: 'Task Manager menu' })}
      >
        <button type="button" role="menuitem" aria-haspopup="menu" onClick={openMenu('file')}>
          {t('tm-menu-file', { defaultValue: 'File' })}
        </button>
        <button type="button" role="menuitem" aria-haspopup="menu" onClick={openMenu('view')}>
          {t('tm-menu-view', { defaultValue: 'View' })}
        </button>
      </div>

      <div
        className="ds-tm-switch"
        role="radiogroup"
        aria-label={t('tm-sections', { defaultValue: 'Task Manager view' })}
      >
        {SECTIONS.map((s, i) => (
          <button
            key={s}
            ref={(el) => {
              segRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={section === s}
            tabIndex={section === s ? 0 : -1}
            className={cn('ds-tm-seg', section === s && 'ds-tm-seg--on')}
            onClick={() => setSection(s)}
            onKeyDown={(e) => onSegKey(e, i)}
          >
            {sectionLabel(s)}
          </button>
        ))}
      </div>

      <section className="ds-tm-body" aria-label={sectionLabel(section)}>
        {section === 'apps' && (
          <>
            <div className="ds-tm-table">
              <div className="ds-tm-head ds-tm-cols--apps" role="presentation">
                <span>{t('tm-col-task', { defaultValue: 'Task' })}</span>
                <span>{t('tm-col-status', { defaultValue: 'Status' })}</span>
              </div>
              <div
                className="ds-tm-rows"
                role="listbox"
                aria-label={t('tm-applications', { defaultValue: 'Applications' })}
              >
                {windows.map((w) => (
                  <div
                    key={w.id}
                    id={`${win.id}-row-${w.id}`}
                    role="option"
                    aria-selected={selApp === w.id}
                    tabIndex={selApp === w.id || (!selApp && w === windows[0]) ? 0 : -1}
                    className={cn(
                      'ds-tm-row ds-tm-cols--apps',
                      selApp === w.id && 'ds-tm-row--sel',
                    )}
                    onClick={() => setSelApp(w.id)}
                    onDoubleClick={() => switchTo(w.id)}
                    onKeyDown={rowKeys(
                      appIds,
                      selApp,
                      setSelApp,
                      () => switchTo(selApp),
                      () => endTask(selApp),
                    )}
                  >
                    <span className="ds-tm-task">
                      <Icon name={APPS[w.app].icon} size={16} />
                      <span>{titleOf(w)}</span>
                    </span>
                    <span>{t('tm-running', { defaultValue: 'Running' })}</span>
                  </div>
                ))}
                {!windows.length && (
                  <p className="ds-tm-empty">
                    {t('tm-no-apps', { defaultValue: 'No applications are running.' })}
                  </p>
                )}
              </div>
            </div>
            <div className="ds-tm-actions">
              <button
                type="button"
                className="ds-btn7"
                disabled={!selApp}
                onClick={() => endTask(selApp)}
              >
                {t('tm-end-task', { defaultValue: 'End Task' })}
              </button>
              <button
                type="button"
                className="ds-btn7"
                disabled={!selApp}
                onClick={() => switchTo(selApp)}
              >
                {t('tm-switch-to', { defaultValue: 'Switch To' })}
              </button>
              <button type="button" className="ds-btn7" onClick={() => openApp('run')}>
                {t('tm-new-task', { defaultValue: 'New Task…' })}
              </button>
            </div>
          </>
        )}

        {section === 'procs' && (
          <>
            <div className="ds-tm-table">
              <div className="ds-tm-head ds-tm-cols--procs" role="presentation">
                <span>{t('tm-col-image', { defaultValue: 'Image Name' })}</span>
                <span>{t('tm-col-user', { defaultValue: 'User Name' })}</span>
                <span className="ds-tm-num">{t('tm-col-cpu', { defaultValue: 'CPU' })}</span>
                <span className="ds-tm-num">{t('tm-col-mem', { defaultValue: 'Memory' })}</span>
                <span>{t('tm-col-desc', { defaultValue: 'Description' })}</span>
              </div>
              <div
                className="ds-tm-rows"
                role="listbox"
                aria-label={t('tm-processes', { defaultValue: 'Processes' })}
              >
                {procs.map((p) => (
                  <div
                    key={p.key}
                    id={`${win.id}-row-${p.key}`}
                    role="option"
                    aria-selected={selProc === p.key}
                    tabIndex={selProc === p.key || (!selProc && p === procs[0]) ? 0 : -1}
                    className={cn(
                      'ds-tm-row ds-tm-cols--procs',
                      selProc === p.key && 'ds-tm-row--sel',
                    )}
                    onClick={() => setSelProc(p.key)}
                    onKeyDown={rowKeys(procIds, selProc, setSelProc, endProcess, endProcess)}
                  >
                    <span>{p.image}</span>
                    <span>{p.image === 'dwm.exe' ? 'SYSTEM' : user}</span>
                    <span className="ds-tm-num">00</span>
                    <span className="ds-tm-num">{num(p.mem)} K</span>
                    <span>{p.desc}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="ds-tm-actions">
              <button type="button" className="ds-btn7" disabled={!selProc} onClick={endProcess}>
                {t('tm-end-process', { defaultValue: 'End Process' })}
              </button>
            </div>
          </>
        )}

        {section === 'perf' && (
          <div className="ds-tm-perf">
            <fieldset className="ds-tm-box">
              <legend>{t('tm-cpu', { defaultValue: 'CPU Usage' })}</legend>
              <Gauge value={cpuNow} caption={`${cpuNow} %`} />
            </fieldset>
            <fieldset className="ds-tm-box ds-tm-box--wide">
              <legend>{t('tm-cpu-history', { defaultValue: 'CPU Usage History' })}</legend>
              <Graph
                values={samples.map((s) => s.cpu)}
                label={t('tm-cpu-graph', {
                  defaultValue: 'CPU usage over the last minute, now {{n}}%',
                  n: cpuNow,
                })}
              />
            </fieldset>

            <fieldset className="ds-tm-box">
              <legend>{t('tm-marathon', { defaultValue: 'Marathon' })}</legend>
              <Gauge value={pct} caption={`${pct} %`} />
            </fieldset>
            <fieldset className="ds-tm-box ds-tm-box--wide">
              <legend>
                {t('tm-marathon-history', { defaultValue: 'Marathon Watched History' })}
              </legend>
              <Graph
                values={samples.map((s) => s.marathon)}
                label={t('tm-marathon-graph', {
                  defaultValue: 'Share of the marathon watched, now {{n}}%',
                  n: pct,
                })}
              />
            </fieldset>

            <fieldset className="ds-tm-box">
              <legend>{t('tm-tonight', { defaultValue: 'Tonight' })}</legend>
              <Gauge value={tonightStats.pct} caption={`${tonightStats.pct} %`} />
            </fieldset>
            <fieldset className="ds-tm-box ds-tm-box--wide">
              <legend>{t('tm-tonight-history', { defaultValue: 'Tonight’s Block' })}</legend>
              <Graph
                values={samples.map((s) => s.tonight)}
                label={t('tm-tonight-graph', {
                  defaultValue: 'Tonight: {{done}} of {{total}} watched',
                  done: formatMinutes(tonightStats.done),
                  total: formatMinutes(tonightStats.total),
                })}
              />
            </fieldset>

            <fieldset className="ds-tm-box ds-tm-box--full">
              <legend>{t('tm-storage', { defaultValue: 'Storage (C:)' })}</legend>
              <div
                className="ds-tm-meter"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={storagePct}
                aria-label={t('tm-storage', { defaultValue: 'Storage (C:)' })}
              >
                <span style={{ width: `${storagePct}%` }} />
              </div>
              <p className="ds-tm-meter-text">
                {t('tm-storage-used', {
                  defaultValue: '{{used}} KB of {{total}} KB used ({{pct}}%)',
                  used: num(Math.ceil(storageBytes / 1024)),
                  total: num(QUOTA_BYTES / 1024),
                  pct: storagePct,
                })}
              </p>
            </fieldset>

            <div className="ds-tm-pair">
              <fieldset className="ds-tm-box">
                <legend>{t('tm-phys-mem', { defaultValue: 'Physical Memory (K)' })}</legend>
                <dl className="ds-tm-stats">
                  <dt>{t('tm-total', { defaultValue: 'Total' })}</dt>
                  <dd>{num(TOTAL_K)}</dd>
                  <dt>{t('tm-used', { defaultValue: 'In use' })}</dt>
                  <dd>{num(memUsedK)}</dd>
                  <dt>{t('tm-available', { defaultValue: 'Available' })}</dt>
                  <dd>{num(TOTAL_K - memUsedK)}</dd>
                </dl>
              </fieldset>
              <fieldset className="ds-tm-box">
                <legend>{t('tm-system', { defaultValue: 'System' })}</legend>
                <dl className="ds-tm-stats">
                  <dt>{t('tm-procs-count', { defaultValue: 'Processes' })}</dt>
                  <dd>{procs.length}</dd>
                  <dt>{t('tm-tonight-min', { defaultValue: 'Tonight' })}</dt>
                  <dd>
                    {formatMinutes(tonightStats.done)} / {formatMinutes(tonightStats.total)}
                  </dd>
                  <dt>{t('tm-uptime', { defaultValue: 'Up Time' })}</dt>
                  <dd>{upTime}</dd>
                </dl>
              </fieldset>
            </div>
          </div>
        )}
      </section>

      <div className="ds-tm-status">
        <span>{t('tm-status-procs', { defaultValue: 'Processes: {{n}}', n: procs.length })}</span>
        <span>{t('tm-status-cpu', { defaultValue: 'CPU Usage: {{n}}%', n: cpuNow })}</span>
        <span>{t('tm-status-mem', { defaultValue: 'Physical Memory: {{n}}%', n: memPct })}</span>
      </div>

      {menu && (
        <PopupMenu
          at={{ x: menu.x, y: menu.y }}
          label={t('tm-menu', { defaultValue: 'Menu' })}
          items={menuItems(menu.which)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
