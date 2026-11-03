'use client';

/**
 * Isleworks — the phone HUD.
 *
 * On a 390×664 screen the desktop HUD (six-stat bar, a wrapping row of control
 * clusters, a rail of four panels, the build dock) covered about 70% of the
 * viewport, and the city is the game. So below the compact breakpoint the HUD
 * collapses to two things:
 *
 *  - a **strip** — one 44px row with the three numbers that decide what to build
 *    next (treasury, residents, happiness), a warning chip only when power or
 *    water has actually run short, a pause/resume toggle, and the menu button;
 *  - a **sheet** — everything else (speed, overlay, camera, the inspector,
 *    objectives, events, the balance sheet, sharing), closed until asked for.
 *
 * The sheet is deliberately not `components/ui/sheet`. That one is a modal
 * Radix dialog portalled to `<body>`: it would put the HUD's `--isw-*` tokens
 * out of scope and put a scrim over the map, where the whole point here is that
 * the city stays visible and tappable above a non-modal panel (select another
 * building and the inspector follows). It keeps the parts of the dialog contract that
 * matter — a labelled region (not the dialog role, which the jelly-coverage gate reserves for
 * `components/ui`), a 44px close control, Escape to close, focus
 * handed to it on open and back to the menu button on close.
 *
 * Selecting a building opens the sheet on its inspector, which is what a tap on
 * a building is asking for; closing the sheet clears the selection.
 */

import { useEffect, useRef, useState } from 'react';
import { Droplets, Menu, Pause, Play, Smile, Users, X, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { activeObjectives } from '@/lib/isleworks/objectives';
import { useIsleworks } from '@/lib/isleworks/store';
import type { RigHandle } from '../scene/CameraRig';

import { NextUnlock } from './BuildPalette';
import { RailPanels } from './Rail';
import {
  CameraControls,
  MonthDial,
  OverlayPicker,
  SpeedControl,
  Stat,
  Treasury,
  compact,
} from './TopBar';

export function CompactHud({ rigRef }: { rigRef: React.MutableRefObject<RigHandle | null> }) {
  const { t } = useTranslation('c-isleworks');
  const city = useIsleworks((s) => s.city);
  const speed = useIsleworks((s) => s.speed);
  const setSpeed = useIsleworks((s) => s.setSpeed);
  const selectedId = useIsleworks((s) => s.selectedId);
  const visiting = useIsleworks((s) => s.visiting);
  const overlay = useIsleworks((s) => s.overlay);
  const setOverlay = useIsleworks((s) => s.setOverlay);

  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);

  // A tap on a building asks "what is this?" — answer it.
  useEffect(() => {
    if (selectedId) setOpen(true);
  }, [selectedId]);

  const close = () => {
    setOpen(false);
    if (useIsleworks.getState().selectedId) useIsleworks.getState().select(null);
    menuRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    sheetRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      if (useIsleworks.getState().selectedId) useIsleworks.getState().select(null);
      menuRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const stats = city.stats;
  const powerShort = stats.powerDemand > stats.powerSupply;
  const waterShort = stats.waterDemand > stats.waterSupply;
  const rewardReady = activeObjectives(city, 3).some((o) => o.complete);
  const paused = speed === 0;

  return (
    <>
      <div className="isw-top isw-top--compact">
        <div className="isw-panel isw-stats isw-stats--compact">
          <Treasury money={city.money} month={city.month} net={stats.netIncome} />
          <Stat
            icon={<Users size={14} aria-hidden />}
            label={t('stat-population', { defaultValue: 'Residents' })}
            value={compact(stats.population)}
          />
          <Stat
            icon={<Smile size={14} aria-hidden />}
            label={t('stat-happiness', { defaultValue: 'Happiness' })}
            value={`${Math.round(stats.happiness)}%`}
            tone={stats.happiness >= 62 ? 'good' : stats.happiness >= 42 ? undefined : 'bad'}
          />
          {powerShort && (
            <Stat
              icon={<Zap size={14} aria-hidden />}
              label={t('stat-power', { defaultValue: 'Power' })}
              value={compact(stats.powerSupply - stats.powerDemand)}
              tone="bad"
            />
          )}
          {waterShort && (
            <Stat
              icon={<Droplets size={14} aria-hidden />}
              label={t('stat-water', { defaultValue: 'Water' })}
              value={compact(stats.waterSupply - stats.waterDemand)}
              tone="bad"
            />
          )}
        </div>

        <div className="isw-panel isw-cluster">
          <button
            type="button"
            className="isw-btn"
            aria-label={
              paused
                ? t('resume', { defaultValue: 'Resume' })
                : t('pause', { defaultValue: 'Pause' })
            }
            onClick={() => setSpeed(paused ? 1 : 0)}
          >
            {paused ? <Play size={16} aria-hidden /> : <Pause size={16} aria-hidden />}
          </button>
          <button
            ref={menuRef}
            type="button"
            className="isw-btn isw-menu-btn"
            aria-label={t('menu', { defaultValue: 'Menu' })}
            aria-expanded={open}
            aria-controls="isw-sheet"
            onClick={() => (open ? close() : setOpen(true))}
          >
            <Menu size={16} aria-hidden />
            {rewardReady && !open && <span className="isw-menu-dot" aria-hidden />}
          </button>
        </div>
      </div>

      {open && (
        <section
          id="isw-sheet"
          ref={sheetRef}
          tabIndex={-1}
          className="isw-panel isw-sheet"
          aria-label={t('menu', { defaultValue: 'Menu' })}
        >
          <header className="isw-sheet-head">
            <MonthDial month={city.month} />
            <span className="isw-stat-value">
              {t('month-n', { defaultValue: 'Month {{n}}', n: city.month })}
            </span>
            <button
              type="button"
              className="isw-btn isw-sheet-close"
              aria-label={t('close', { defaultValue: 'Close' })}
              onClick={close}
            >
              <X size={16} aria-hidden />
            </button>
          </header>

          <div className="isw-sheet-body">
            <div className="isw-sheet-controls">
              <SpeedControl />
              <CameraControls rigRef={rigRef} />
              <OverlayPicker value={overlay} onChange={setOverlay} />
            </div>
            {!visiting && <RailPanels />}
            {!visiting && <NextUnlock />}
          </div>
        </section>
      )}
    </>
  );
}
