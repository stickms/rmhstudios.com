'use client';

/**
 * The Windows 7 superbar: Start orb, pinned and running programs, the
 * notification area, the clock and Show desktop.
 *
 * - Program buttons light up with the colour-matched glow that follows the
 *   cursor across the button (Windows 7's "hot-track"); the glow position is
 *   a custom property on that one button, set only while hovered.
 * - Click a program to switch to it, click again to minimise it; with several
 *   windows open a jump list lets you pick one. Right-click for the jump list.
 * - Hover Show desktop to peek through every window (Aero Peek); click it to
 *   minimise everything, click again to bring it all back.
 */

import { AnimatePresence, m as motion } from 'framer-motion';
import { CloudCheck, CloudOff, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useMemo, useState, type PointerEvent as RPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { daysBetween, parseDay } from '@/lib/dunesday/schedule';
import { DUNESDAY } from '@/lib/dunesday/titles';
import { cn } from '@/lib/utils';
import { useDunesday } from '../DunesdayProvider';
import { Balloons } from '../Balloons';
import { sfx } from '../sound';
import { openApp } from './actions';
import { APPS } from './apps';
import { Icon } from './icons';
import { PopupMenu, type MenuItem } from './Menu';
import { StartMenu7 } from './StartMenu7';
import { useOs, type AppId } from './store';

const PINNED: AppId[] = ['explorer', 'ie', 'planner', 'player', 'messenger'];

const GLOW: Partial<Record<AppId, string>> = {
  explorer: '#ffd060',
  ie: '#52b6ff',
  planner: '#3fc6ff',
  player: '#ff9a3d',
  messenger: '#6fe05a',
  calendar: '#ff6a5a',
  minesweeper: '#9fb6cc',
  solitaire: '#ff6a6a',
  spider: '#b0b0b0',
  paint: '#ffc04a',
  notepad: '#8fd0ff',
  cmd: '#c0c0c0',
};

export function Taskbar({
  compact,
  onLock,
  onLogOff,
  onShutdown,
  onRestart,
  onSwitchUser,
}: {
  compact: boolean;
  onLock: () => void;
  onLogOff: () => void;
  onShutdown: () => void;
  onRestart: () => void;
  onSwitchUser: () => void;
}) {
  const { t } = useTranslation('c-dunesday');
  const { muted, toggleMuted, sync, balloons, closeBalloon } = useDunesday();
  const windows = useOs((s) => s.windows);
  const activeId = useOs((s) => s.activeId);
  const focus = useOs((s) => s.focus);
  const minimize = useOs((s) => s.minimize);
  const close = useOs((s) => s.close);
  const showDesktop = useOs((s) => s.showDesktop);
  const setPeek = useOs((s) => s.setPeek);
  const [startOpen, setStartOpen] = useState(false);
  const [jump, setJump] = useState<null | { app: AppId; x: number; y: number }>(null);
  const [clockOpen, setClockOpen] = useState(false);

  const buttons = useMemo(() => {
    const running = [...new Set(windows.filter((w) => w.app !== 'dialog').map((w) => w.app))];
    const list = compact ? running : [...PINNED, ...running.filter((a) => !PINNED.includes(a))];
    return list.map((app) => ({ app, wins: windows.filter((w) => w.app === app) }));
  }, [windows, compact]);

  // Ctrl+Esc opens Start, as on Windows.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Escape') {
        e.preventDefault();
        setStartOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const clickApp = (app: AppId, el: HTMLElement) => {
    const wins = windows.filter((w) => w.app === app);
    sfx.tick();
    if (!wins.length) return void openApp(app);
    if (wins.length === 1) {
      const w = wins[0];
      if (w.id === activeId && !w.min) minimize(w.id);
      else focus(w.id);
      return;
    }
    const r = el.getBoundingClientRect();
    setJump({ app, x: r.left, y: r.top - 4 });
  };

  const jumpItems = (app: AppId): MenuItem[] => {
    const wins = windows.filter((w) => w.app === app);
    const def = APPS[app];
    return [
      ...wins.map((w) => ({
        label: w.title ?? def.title(t),
        icon: <Icon name={def.icon} size={16} />,
        onSelect: () => focus(w.id),
        bold: w.id === activeId,
      })),
      ...(wins.length ? [{ separator: true } as MenuItem] : []),
      {
        label: def.title(t),
        icon: <Icon name={def.icon} size={16} />,
        onSelect: () => openApp(app),
      },
      ...(wins.length
        ? [
            {
              label:
                wins.length > 1
                  ? t('close-all-windows', { defaultValue: 'Close all windows' })
                  : t('close-window', { defaultValue: 'Close window' }),
              onSelect: () => wins.forEach((w) => close(w.id)),
            } as MenuItem,
          ]
        : []),
    ];
  };

  const hotTrack = (e: RPointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--hx', `${e.clientX - r.left}px`);
  };

  return (
    <>
      <nav className="ds-taskbar" aria-label={t('taskbar', { defaultValue: 'Taskbar' })}>
        <button
          type="button"
          className={cn('ds-orb7', startOpen && 'ds-orb7--open')}
          aria-label={t('start', { defaultValue: 'Start' })}
          aria-haspopup="menu"
          aria-expanded={startOpen}
          onClick={() => {
            sfx.bloop();
            setStartOpen((v) => !v);
          }}
        >
          <span className="ds-orb7-flag" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
        </button>

        <ul className="ds-tb-apps" aria-label={t('running-programs', { defaultValue: 'Programs' })}>
          {buttons.map(({ app, wins }) => {
            const def = APPS[app];
            const isActive = wins.some((w) => w.id === activeId && !w.min);
            const label = def.title(t);
            return (
              <li key={app}>
                <button
                  type="button"
                  className={cn(
                    'ds-tb-btn',
                    wins.length > 0 && 'ds-tb-btn--running',
                    wins.length > 1 && 'ds-tb-btn--stack',
                    isActive && 'ds-tb-btn--active',
                  )}
                  style={{ ['--glow' as string]: GLOW[app] ?? '#6fc8ff' }}
                  aria-label={
                    wins.length
                      ? t('tb-running', {
                          defaultValue: '{{name}} ({{count}} open)',
                          name: label,
                          count: wins.length,
                        })
                      : label
                  }
                  aria-pressed={isActive}
                  title={label}
                  onPointerMove={hotTrack}
                  onClick={(e) => clickApp(app, e.currentTarget)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const r = e.currentTarget.getBoundingClientRect();
                    setJump({ app, x: r.left, y: r.top - 4 });
                  }}
                >
                  <Icon name={def.icon} size={compact ? 26 : 30} />
                </button>
              </li>
            );
          })}
        </ul>

        <div className="ds-tray">
          <button
            type="button"
            className="ds-tray-btn"
            aria-label={
              sync.slot
                ? t('tray-sync-on', { defaultValue: 'Sync is on' })
                : t('tray-sync-off', { defaultValue: 'Sync is off' })
            }
            title={
              sync.slot
                ? t('tray-sync-on', { defaultValue: 'Sync is on' })
                : t('tray-sync-off', { defaultValue: 'Sync is off' })
            }
            onClick={() => openApp('sync')}
          >
            {sync.slot ? (
              <CloudCheck size={16} aria-hidden="true" />
            ) : (
              <CloudOff size={16} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="ds-tray-btn"
            aria-pressed={!muted}
            aria-label={
              muted
                ? t('sound-on', { defaultValue: 'Turn sounds on' })
                : t('sound-off', { defaultValue: 'Mute sounds' })
            }
            title={
              muted
                ? t('sound-on', { defaultValue: 'Turn sounds on' })
                : t('sound-off', { defaultValue: 'Mute sounds' })
            }
            onClick={toggleMuted}
          >
            {muted ? (
              <VolumeX size={16} aria-hidden="true" />
            ) : (
              <Volume2 size={16} aria-hidden="true" />
            )}
          </button>
          <TrayClock open={clockOpen} onToggle={() => setClockOpen((v) => !v)} />
        </div>

        {!compact && (
          <button
            type="button"
            className="ds-showdesk"
            aria-label={t('show-desktop', { defaultValue: 'Show desktop' })}
            title={t('show-desktop', { defaultValue: 'Show desktop' })}
            onPointerEnter={() => setPeek(true)}
            onPointerLeave={() => setPeek(false)}
            onFocus={() => setPeek(true)}
            onBlur={() => setPeek(false)}
            onClick={() => {
              sfx.swoosh();
              showDesktop();
            }}
          />
        )}
      </nav>

      <AnimatePresence>
        {startOpen && (
          <StartMenu7
            compact={compact}
            onClose={() => setStartOpen(false)}
            onLock={onLock}
            onLogOff={onLogOff}
            onShutdown={onShutdown}
            onRestart={onRestart}
            onSwitchUser={onSwitchUser}
          />
        )}
      </AnimatePresence>

      {jump && (
        <PopupMenu
          at={{ x: jump.x, y: jump.y }}
          placement="above"
          label={APPS[jump.app].title(t)}
          items={jumpItems(jump.app)}
          onClose={() => setJump(null)}
        />
      )}

      <Balloons items={balloons} onClose={closeBalloon} />
    </>
  );
}

function TrayClock({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t, i18n } = useTranslation('c-dunesday');
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  const time = now
    ? now.toLocaleTimeString(i18n.language, { hour: 'numeric', minute: '2-digit' })
    : '';
  const date = now
    ? now.toLocaleDateString(i18n.language, { year: 'numeric', month: 'numeric', day: 'numeric' })
    : '';
  return (
    <div className="ds-tray-clockwrap">
      <button
        type="button"
        className="ds-tray-clock"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t('clock-open', {
          defaultValue: 'Date and time: {{time}}, {{date}}',
          time,
          date,
        })}
        onClick={onToggle}
      >
        <span>{time}</span>
        <span>{date}</span>
      </button>
      <AnimatePresence>
        {open && now && <ClockFlyout now={now} onClose={onToggle} />}
      </AnimatePresence>
    </div>
  );
}

function ClockFlyout({ now, onClose }: { now: Date; onClose: () => void }) {
  const { t, i18n } = useTranslation('c-dunesday');
  const { today } = useDunesday();
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const first = month.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const dd = parseDay(DUNESDAY);
  const left = Math.max(0, daysBetween(today, DUNESDAY));
  const h = now.getHours() % 12;
  const m = now.getMinutes();
  return (
    <motion.div
      role="dialog"
      aria-label={t('clock-flyout', { defaultValue: 'Date and time' })}
      className="ds-flyout"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.15 }}
    >
      <p className="ds-flyout-date">
        {now.toLocaleDateString(i18n.language, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })}
      </p>
      <div className="ds-flyout-body">
        <div className="ds-flyout-cal">
          <div className="ds-flyout-calhead">
            <button
              type="button"
              aria-label={t('prev-month', { defaultValue: 'Previous month' })}
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            >
              ◀
            </button>
            <span>
              {month.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              aria-label={t('next-month', { defaultValue: 'Next month' })}
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            >
              ▶
            </button>
          </div>
          <div className="ds-flyout-grid">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <span key={i} className="ds-flyout-dow" aria-hidden="true">
                {d}
              </span>
            ))}
            {Array.from({ length: first }, (_, i) => (
              <span key={`p${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const isToday =
                now.getFullYear() === month.getFullYear() &&
                now.getMonth() === month.getMonth() &&
                now.getDate() === i + 1;
              const isDunes =
                dd.getUTCFullYear() === month.getFullYear() &&
                dd.getUTCMonth() === month.getMonth() &&
                dd.getUTCDate() === i + 1;
              return (
                <span
                  key={i}
                  className={cn(
                    'ds-flyout-day',
                    isToday && 'ds-flyout-day--today',
                    isDunes && 'ds-flyout-day--dunes',
                  )}
                >
                  {i + 1}
                </span>
              );
            })}
          </div>
        </div>
        <svg className="ds-flyout-clock" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="46" fill="#fff" stroke="#9cc6e6" strokeWidth="4" />
          {Array.from({ length: 12 }, (_, i) => (
            <rect
              key={i}
              x="49"
              y="8"
              width="2"
              height={i % 3 ? 4 : 8}
              fill="#456"
              transform={`rotate(${i * 30} 50 50)`}
            />
          ))}
          <rect
            x="48"
            y="26"
            width="4"
            height="25"
            rx="2"
            fill="#123"
            transform={`rotate(${h * 30 + m * 0.5} 50 50)`}
          />
          <rect
            x="49"
            y="16"
            width="2"
            height="35"
            rx="1"
            fill="#234"
            transform={`rotate(${m * 6} 50 50)`}
          />
          <circle cx="50" cy="50" r="3" fill="#c8232c" />
        </svg>
      </div>
      <p className="ds-flyout-foot">
        {left > 0
          ? t('flyout-countdown', {
              defaultValue: '{{count}} days until Dunesday (18 December)',
              count: left,
            })
          : t('its-dunesday', { defaultValue: 'It’s Dunesday. Enjoy the show!' })}
      </p>
    </motion.div>
  );
}
