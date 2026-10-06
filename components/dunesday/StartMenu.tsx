'use client';

/**
 * The Windows 7 Start orb, opening a glass Start menu for the page: jump to a
 * section, open the chat, flip Night mode, mute the sounds.
 *
 * A real menu: `aria-haspopup`/`aria-expanded` on the orb, `role="menu"` with
 * menuitems, arrow keys move, Escape and an outside click close it and return
 * focus to the orb.
 */

import { AnimatePresence, m as motion } from 'framer-motion';
import {
  CalendarDays,
  CalendarCheck,
  ListChecks,
  MessageCircle,
  Moon,
  SlidersHorizontal,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SPRING } from '@/lib/motion';
import { sfx } from './sound';

interface Item {
  key: string;
  icon: ReactNode;
  label: string;
  hint?: string;
  run: () => void;
}

export function StartMenu({
  night,
  onNight,
  muted,
  onMuted,
}: {
  night: boolean;
  onNight: () => void;
  muted: boolean;
  onMuted: () => void;
}) {
  const { t } = useTranslation('c-dunesday');
  const [open, setOpen] = useState(false);
  const orbRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const go = (hash: string) => () => {
    document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const items: Item[] = [
    {
      key: 'plan',
      icon: <SlidersHorizontal size={20} />,
      label: t('nav-plan', { defaultValue: 'Plan' }),
      hint: t('start-plan-hint', { defaultValue: 'Pace, dates and rhythm' }),
      run: go('#plan'),
    },
    {
      key: 'schedule',
      icon: <CalendarDays size={20} />,
      label: t('nav-schedule', { defaultValue: 'Schedule' }),
      hint: t('start-schedule-hint', { defaultValue: 'Night by night' }),
      run: go('#schedule'),
    },
    {
      key: 'list',
      icon: <ListChecks size={20} />,
      label: t('nav-list', { defaultValue: 'Watch list' }),
      hint: t('start-list-hint', { defaultValue: 'Tick off what you’ve seen' }),
      run: go('#list'),
    },
    {
      key: 'connect',
      icon: <CalendarCheck size={20} />,
      label: t('nav-connect', { defaultValue: 'Connect' }),
      hint: t('start-connect-hint', { defaultValue: 'Calendar, RSS & Discord' }),
      run: go('#connect'),
    },
    {
      key: 'buddy',
      icon: <MessageCircle size={20} />,
      label: t('buddy-name', { defaultValue: 'Dunesday Buddy' }),
      hint: t('start-buddy-hint', { defaultValue: 'Ask about the films' }),
      run: () => window.dispatchEvent(new CustomEvent('dunesday:open-buddy')),
    },
  ];
  const side: Item[] = [
    {
      key: 'night',
      icon: night ? <Sun size={18} /> : <Moon size={18} />,
      label: night
        ? t('day', { defaultValue: 'Day mode' })
        : t('night', { defaultValue: 'Night mode' }),
      run: onNight,
    },
    {
      key: 'sound',
      icon: muted ? <VolumeX size={18} /> : <Volume2 size={18} />,
      label: muted
        ? t('sound-on', { defaultValue: 'Turn sounds on' })
        : t('sound-off', { defaultValue: 'Mute sounds' }),
      run: onMuted,
    },
  ];

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: MouseEvent) => {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !orbRef.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    orbRef.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    const all = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = (i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length;
      all[next]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      all[e.key === 'Home' ? 0 : all.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const run = (item: Item) => {
    setOpen(false);
    item.run();
  };

  return (
    <div className="ds-start">
      <button
        ref={orbRef}
        type="button"
        className="ds-start-orb"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('start', { defaultValue: 'Start' })}
        data-sfx="custom"
        onClick={() => {
          sfx.bloop();
          setOpen((v) => !v);
        }}
      >
        <span className="ds-start-flag" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            role="menu"
            aria-label={t('start', { defaultValue: 'Start' })}
            className="ds-start-menu"
            onKeyDown={onKey}
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={SPRING.snappy}
          >
            <div className="ds-start-left">
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  className="ds-start-item"
                  onClick={() => run(item)}
                >
                  <span className="ds-start-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span>
                    <strong>{item.label}</strong>
                    {item.hint && <small>{item.hint}</small>}
                  </span>
                </button>
              ))}
            </div>
            <div className="ds-start-right">
              <div className="ds-start-user" aria-hidden="true">
                <span className="ds-buddy-avatar">🍿</span>
              </div>
              {side.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  className="ds-start-item ds-start-item--side"
                  onClick={() => run(item)}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
