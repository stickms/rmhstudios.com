'use client';

/**
 * The Windows 7 Start menu.
 *
 * Left: pinned programs, or "All Programs" grouped into folders, and the
 * "Search programs and files" box, which searches programs, your files and the
 * watch list as you type. Right: the user picture (your RMH avatar — it turns
 * into each link's icon as you hover, like Windows 7), the profile folders,
 * Computer, Control Panel, Run…, and the Shut down split button.
 *
 * Keyboard: typing lands in the search box, arrows move through results,
 * Enter opens the first match, Escape closes and returns focus to the orb.
 */

import { m as motion } from 'framer-motion';
import { ChevronRight, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DOCUMENTS,
  HOME,
  MUSIC,
  PICTURES,
  RECYCLE,
  ROOT,
  VIDEOS,
  type VNode,
} from '@/lib/dunesday/vfs';
import { allTitles } from '@/lib/dunesday/state';
import { cn } from '@/lib/utils';
import { useDunesday } from '../DunesdayProvider';
import { openApp, openNode } from './actions';
import { APPS, type AppDef, type StartGroup } from './apps';
import { Icon, type IconName } from './icons';
import { PopupMenu, type MenuItem } from './Menu';
import { iconFor } from './nodeIcon';
import { useOs } from './store';
import { useProfile } from './useProfile';
import { UserTile } from './UserTile';

const PINNED_LEFT: (keyof typeof APPS)[] = [
  'welcome',
  'planner',
  'calendar',
  'messenger',
  'player',
  'ie',
  'paint',
  'solitaire',
  'minesweeper',
];

interface Result {
  key: string;
  label: string;
  sub?: string;
  icon: IconName;
  run: () => void;
}

export function StartMenu7({
  compact,
  onClose,
  onLock,
  onLogOff,
  onShutdown,
  onRestart,
  onSwitchUser,
}: {
  compact: boolean;
  onClose: () => void;
  onLock: () => void;
  onLogOff: () => void;
  onShutdown: () => void;
  onRestart: () => void;
  onSwitchUser: () => void;
}) {
  const { t } = useTranslation('c-dunesday');
  const profile = useProfile();
  const { state } = useDunesday();
  const vfs = useOs((s) => s.vfs);
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(false);
  const [hoverIcon, setHoverIcon] = useState<IconName | null>(null);
  const [power, setPower] = useState<{ x: number; y: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement;
      if (root.current?.contains(el) || el.closest('.ds-orb7') || el.closest('.ds-menu7')) return;
      onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [onClose]);

  const launch = (fn: () => void) => () => {
    onClose();
    fn();
  };

  const appResult = (a: AppDef): Result => ({
    key: `app-${a.id}`,
    label: a.title(t),
    icon: a.icon,
    run: () => openApp(a.id),
  });

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: Result[] = [];
    for (const a of Object.values(APPS))
      if (a.start && a.title(t).toLowerCase().includes(q)) out.push(appResult(a));
    const files = Object.values(vfs)
      .filter((n: VNode) => n.parent && n.parent !== RECYCLE && n.name.toLowerCase().includes(q))
      .slice(0, 8);
    for (const n of files)
      out.push({
        key: `f-${n.id}`,
        label: n.name,
        sub: t('search-file', { defaultValue: 'File' }),
        icon: iconFor(n, vfs),
        run: () => openNode(n, (name) => name),
      });
    const titles = allTitles(state)
      .filter((x) => x.title.toLowerCase().includes(q))
      .slice(0, 8);
    for (const x of titles)
      out.push({
        key: `t-${x.id}`,
        label: x.title,
        sub: t('search-title', { defaultValue: 'Watch list' }),
        icon: state.watched[x.id] ? 'film-watched' : x.kind === 'series' ? 'series' : 'film',
        run: () => openApp('properties', { params: { title: x.id } }),
      });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, vfs, state, t]);

  const groups: { id: Exclude<StartGroup, null | 'pinned'>; label: string }[] = [
    { id: 'dunesday', label: 'Dunesday' },
    { id: 'accessories', label: t('group-accessories', { defaultValue: 'Accessories' }) },
    { id: 'games', label: t('group-games', { defaultValue: 'Games' }) },
    { id: 'system', label: t('group-system', { defaultValue: 'System Tools' }) },
  ];

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      (document.querySelector('.ds-orb7') as HTMLElement | null)?.focus();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const all = [...(root.current?.querySelectorAll<HTMLElement>('.ds-sm-item') ?? [])];
      const i = all.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus();
    }
  };

  const right: { key: string; label: string; icon: IconName; run: () => void; bold?: boolean }[] = [
    {
      key: 'home',
      label: profile.name,
      icon: 'folder-user',
      run: () => openApp('explorer', { params: { path: HOME } }),
      bold: true,
    },
    {
      key: 'docs',
      label: t('documents', { defaultValue: 'Documents' }),
      icon: 'folder-docs',
      run: () => openApp('explorer', { params: { path: DOCUMENTS } }),
    },
    {
      key: 'pics',
      label: t('pictures', { defaultValue: 'Pictures' }),
      icon: 'folder-pics',
      run: () => openApp('explorer', { params: { path: PICTURES } }),
    },
    {
      key: 'music',
      label: t('music', { defaultValue: 'Music' }),
      icon: 'folder-music',
      run: () => openApp('explorer', { params: { path: MUSIC } }),
    },
    {
      key: 'videos',
      label: t('videos-watchlist', { defaultValue: 'Videos (watch list)' }),
      icon: 'folder-videos',
      run: () => openApp('explorer', { params: { path: VIDEOS } }),
    },
    {
      key: 'computer',
      label: t('computer', { defaultValue: 'Computer' }),
      icon: 'computer',
      run: () => openApp('explorer', { params: { path: ROOT } }),
    },
    {
      key: 'control',
      label: t('control-panel', { defaultValue: 'Control Panel' }),
      icon: 'personalize',
      run: () => openApp('personalize'),
    },
    {
      key: 'taskmgr',
      label: t('app-taskmgr', { defaultValue: 'Windows Task Manager' }),
      icon: 'taskmgr',
      run: () => openApp('taskmgr'),
    },
    {
      key: 'help',
      label: t('help', { defaultValue: 'Help and Support' }),
      icon: 'question',
      run: () => openApp('about'),
    },
    {
      key: 'run',
      label: t('run', { defaultValue: 'Run…' }),
      icon: 'run',
      run: () => openApp('run'),
    },
  ];

  const powerItems: MenuItem[] = [
    { label: t('power-switch', { defaultValue: 'Switch user' }), onSelect: launch(onSwitchUser) },
    { label: t('power-logoff', { defaultValue: 'Log off' }), onSelect: launch(onLogOff) },
    { label: t('power-lock', { defaultValue: 'Lock' }), onSelect: launch(onLock) },
    { separator: true },
    { label: t('power-restart', { defaultValue: 'Restart' }), onSelect: launch(onRestart) },
  ];

  return (
    <motion.div
      ref={root}
      className={cn('ds-sm', compact && 'ds-sm--compact')}
      role="dialog"
      aria-label={t('start', { defaultValue: 'Start' })}
      onKeyDown={onKey}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12, transition: { duration: 0.12 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 38 }}
    >
      <div className="ds-sm-left">
        <div className="ds-sm-list">
          {query ? (
            results.length ? (
              results.map((r) => (
                <button key={r.key} type="button" className="ds-sm-item" onClick={launch(r.run)}>
                  <Icon name={r.icon} size={28} />
                  <span>
                    {r.label}
                    {r.sub && <small>{r.sub}</small>}
                  </span>
                </button>
              ))
            ) : (
              <p className="ds-sm-empty">
                {t('search-none', { defaultValue: 'No items match your search.' })}
              </p>
            )
          ) : all ? (
            groups.map((g) => (
              <div key={g.id} className="ds-sm-group">
                <p className="ds-sm-groupname">
                  <Icon name="folder" size={18} /> {g.label}
                </p>
                {Object.values(APPS)
                  .filter((a) => a.start === g.id || (g.id === 'dunesday' && a.start === 'pinned'))
                  .map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="ds-sm-item ds-sm-item--sub"
                      onClick={launch(appResult(a).run)}
                    >
                      <Icon name={a.icon} size={20} />
                      <span>{a.title(t)}</span>
                    </button>
                  ))}
              </div>
            ))
          ) : (
            PINNED_LEFT.map((id) => {
              const a = APPS[id];
              return (
                <button
                  key={id}
                  type="button"
                  className="ds-sm-item"
                  onClick={launch(appResult(a).run)}
                >
                  <Icon name={a.icon} size={32} />
                  <span>{a.title(t)}</span>
                </button>
              );
            })
          )}
        </div>
        {!query && (
          <button
            type="button"
            className="ds-sm-item ds-sm-all"
            onClick={() => setAll((v) => !v)}
            aria-expanded={all}
          >
            {all ? '◀ ' : ''}
            {all
              ? t('back', { defaultValue: 'Back' })
              : t('all-programs', { defaultValue: 'All Programs' })}
            {!all && <ChevronRight size={14} aria-hidden="true" />}
          </button>
        )}
        <label className="ds-sm-search">
          <span className="ds-sr-only">
            {t('search-start', { defaultValue: 'Search programs and files' })}
          </span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder={t('search-start', { defaultValue: 'Search programs and files' })}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) {
                e.preventDefault();
                launch(results[0].run)();
              }
            }}
          />
          <Search size={14} aria-hidden="true" />
        </label>
      </div>

      <div className="ds-sm-right">
        <div className="ds-sm-pic" aria-hidden="true">
          {hoverIcon ? (
            <span className="ds-usertile ds-sm-picicon" style={{ width: 56, height: 56 }}>
              <Icon name={hoverIcon} size={44} />
            </span>
          ) : (
            <UserTile image={profile.image} size={56} />
          )}
        </div>
        <div className="ds-sm-links">
          {right.map((r) => (
            <button
              key={r.key}
              type="button"

              className={cn('ds-sm-item ds-sm-link', r.bold && 'ds-sm-link--bold')}
              onPointerEnter={() => setHoverIcon(r.key === 'home' ? null : r.icon)}
              onPointerLeave={() => setHoverIcon(null)}
              onFocus={() => setHoverIcon(r.key === 'home' ? null : r.icon)}
              onBlur={() => setHoverIcon(null)}
              onClick={launch(r.run)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="ds-sm-power">
          <button type="button" className="ds-sm-shutdown" onClick={launch(onShutdown)}>
            {t('power-shutdown', { defaultValue: 'Shut down' })}
          </button>
          <button
            type="button"
            className="ds-sm-shutarrow"
            aria-haspopup="menu"
            aria-expanded={Boolean(power)}
            aria-label={t('power-options', { defaultValue: 'Shut down options' })}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setPower({ x: r.left, y: r.top - 4 });
            }}
          >
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      {power && (
        <PopupMenu
          at={power}
          placement="above"
          label={t('power-options', { defaultValue: 'Shut down options' })}
          items={powerItems}
          onClose={() => setPower(null)}
        />
      )}
    </motion.div>
  );
}
