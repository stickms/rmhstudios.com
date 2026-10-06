'use client';

/**
 * /dunesday — the MCU + Dune marathon planner.
 *
 * Every MCU film and Disney+ series and the Dune films, scheduled night by
 * night so the whole run finishes before Avengers: Doomsday and Dune: Part
 * Three open on 18 December 2026. The plan lives in the browser; the chat
 * assistant is the only thing that talks to the server.
 *
 * Composition only — the planner is `lib/dunesday/schedule.ts`, the state and
 * its derivations are `lib/dunesday/state.ts`, and each section is its own
 * component.
 */

import { Link } from '@tanstack/react-router';
import { m as motion } from 'framer-motion';
import { ArrowLeft, Moon, Sun } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useCelebration } from '@/hooks/useCelebration';
import { DURATION, EASE } from '@/lib/motion';
import { buildPlan, localToday } from '@/lib/dunesday/schedule';
import { paintDocumentGround } from '@/stores/themeStore';
import {
  allTitles,
  effectiveSettings,
  isIncluded,
  isWatched,
  progressOf,
  remainingWork,
  type DunesdayState,
} from '@/lib/dunesday/state';
import { TITLES } from '@/lib/dunesday/titles';
import { AeroScene } from './AeroScene';
import { Balloons, type Balloon } from './Balloons';
import { Buddy } from './Buddy';
import { Hero } from './Hero';
import { PlanControls } from './PlanControls';
import { Schedule } from './Schedule';
import { StatusPanel } from './StatusPanel';
import { Watchlist } from './Watchlist';
import { useDunesdayState } from './useDunesdayState';

const GROUND = { day: '#bfe6ff', night: '#0b1a3a' };

/** Achievement keys currently earned — compared across renders to pop balloons. */
function earned(state: DunesdayState, streak: number): Set<string> {
  const out = new Set<string>();
  const titles = allTitles(state).filter((x) => isIncluded(state, x));
  const seen = titles.filter((x) => isWatched(state, x));
  if (seen.length >= 1) out.add('first');
  if (seen.length >= 10) out.add('ten');
  if (titles.length && seen.length * 2 >= titles.length) out.add('half');
  if (titles.length && seen.length === titles.length) out.add('all');
  for (let phase = 1; phase <= 6; phase++) {
    const inPhase = titles.filter((x) => x.franchise === 'mcu' && x.phase === phase);
    if (inPhase.length && inPhase.every((x) => isWatched(state, x))) out.add(`phase-${phase}`);
  }
  const dune = titles.filter((x) => x.franchise === 'dune');
  if (dune.length && dune.every((x) => isWatched(state, x))) out.add('dune');
  if (streak >= 3) out.add('streak-3');
  if (streak >= 7) out.add('streak-7');
  return out;
}

export function Dunesday() {
  const { t } = useTranslation('c-dunesday');
  const { state, ready, importedShare, actions } = useDunesdayState();
  const celebrate = useCelebration();
  const [today, setToday] = useState(() => localToday());
  const [balloons, setBalloons] = useState<Balloon[]>([]);

  // Roll "today" over at midnight for anyone who leaves the tab open.
  useEffect(() => {
    setToday(localToday());
    const id = window.setInterval(() => setToday(localToday()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Paint <html> to match the scene, so overscroll never flashes another colour.
  useEffect(() => {
    paintDocumentGround(state.night ? GROUND.night : GROUND.day, state.night);
  }, [state.night]);

  useEffect(() => {
    if (importedShare) {
      toast.success(
        t('share-imported', { defaultValue: 'Loaded a shared plan. Your own progress is kept.' }),
      );
    }
  }, [importedShare, t]);

  const settings = useMemo(() => effectiveSettings(state, today), [state, today]);
  const work = useMemo(() => remainingWork(state), [state]);
  const plan = useMemo(() => buildPlan(work, settings), [work, settings]);
  const progress = useMemo(() => progressOf(state, today), [state, today]);
  const remainingMinutes = useMemo(() => work.reduce((a, w) => a + w.minutes, 0), [work]);

  // The two one-tap fixes the status panel offers when the plan runs late.
  const fitMinutes = useMemo(() => {
    if (plan.onTime) return null;
    const fit = buildPlan(work, { ...settings, mode: 'fit' });
    return fit.impossible ? null : fit.minutesPerDay;
  }, [plan.onTime, work, settings]);
  const essentialsFinish = useMemo(() => {
    if (plan.onTime) return null;
    const essentials = work.filter((w) => w.title.essential);
    if (essentials.length === work.length) return null;
    const p = buildPlan(essentials, {
      ...settings,
      mode: 'pace',
      minutesPerDay: plan.minutesPerDay,
    });
    return p.finishDate;
  }, [plan.onTime, plan.minutesPerDay, work, settings]);

  // Balloon tips: only for achievements earned during this visit.
  const prevEarned = useRef<Set<string> | null>(null);
  const balloonCopy = useCallback(
    (key: string): Omit<Balloon, 'id'> | null => {
      switch (key) {
        case 'first':
          return {
            title: t('ach-first', { defaultValue: 'And so it begins' }),
            body: t('ach-first-body', {
              defaultValue: 'First title down. Only the whole saga to go.',
            }),
          };
        case 'ten':
          return {
            title: t('ach-ten', { defaultValue: 'Double digits' }),
            body: t('ach-ten-body', {
              defaultValue: 'Ten titles watched. Keep the snacks coming.',
            }),
          };
        case 'half':
          return {
            title: t('ach-half', { defaultValue: 'Perfectly balanced' }),
            body: t('ach-half-body', {
              defaultValue: 'Half the list is done — as all things should be.',
            }),
          };
        case 'all':
          return {
            title: t('ach-all', { defaultValue: 'Ready for Dunesday' }),
            body: t('ach-all-body', {
              defaultValue: 'Every title watched. See you at the cinema.',
            }),
          };
        case 'dune':
          return {
            title: t('ach-dune', { defaultValue: 'The spice must flow' }),
            body: t('ach-dune-body', { defaultValue: 'All of Dune watched. Arrakis awaits.' }),
          };
        case 'streak-3':
          return {
            title: t('ach-streak-3', { defaultValue: 'On a roll' }),
            body: t('ach-streak-3-body', { defaultValue: 'Three nights in a row.' }),
          };
        case 'streak-7':
          return {
            title: t('ach-streak-7', { defaultValue: 'Week-long binge' }),
            body: t('ach-streak-7-body', { defaultValue: 'Seven nights straight. Impressive.' }),
          };
        default:
          if (key.startsWith('phase-')) {
            const n = key.slice(6);
            return {
              title: t('ach-phase', { defaultValue: 'Phase {{n}} complete', n }),
              body: t('ach-phase-body', {
                defaultValue: 'Every Phase {{n}} title in your plan is watched.',
                n,
              }),
            };
          }
          return null;
      }
    },
    [t],
  );

  useEffect(() => {
    if (!ready) return;
    const now = earned(state, progress.streak);
    const before = prevEarned.current;
    prevEarned.current = now;
    if (!before) return;
    const fresh = [...now].filter((k) => !before.has(k));
    if (!fresh.length) return;
    const add = fresh
      .map((key) => {
        const copy = balloonCopy(key);
        return copy ? { id: `${key}-${Date.now()}`, ...copy } : null;
      })
      .filter((b): b is Balloon => b !== null);
    setBalloons((cur) => [...cur, ...add].slice(-3));
    if (
      fresh.includes('all') ||
      fresh.some((k) => k.startsWith('phase-')) ||
      fresh.includes('dune')
    ) {
      void celebrate({
        kind: fresh.includes('all') ? 'fireworks' : undefined,
        colors: ['#19b5f0', '#8ae65c', '#ffd58a', '#ffffff'],
      });
    }
  }, [state, progress.streak, ready, balloonCopy, celebrate]);

  const closeBalloon = useCallback(
    (id: string) => setBalloons((cur) => cur.filter((b) => b.id !== id)),
    [],
  );

  const reveal = {
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-60px' },
    transition: { duration: 0.5, ease: EASE.standard },
  } as const;

  return (
    <div className="ds app-page" data-night={state.night}>
      <AeroScene />

      <nav
        className="ds-topbar ds-no-print"
        aria-label={t('nav-label', { defaultValue: 'Dunesday' })}
      >
        <div className="ds-topbar-inner">
          <Link
            to="/apps"
            className="ds-btn ds-btn--ghost ds-btn--sm ds-btn--icon"
            aria-label={t('back', { defaultValue: 'Back to RMH Studios apps' })}
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </Link>
          <a href="#top" className="ds-brand">
            <span className="ds-orb" aria-hidden="true">
              <Sun size={18} />
            </span>
            Dunesday
          </a>
          <div className="ds-nav">
            <a href="#plan">{t('nav-plan', { defaultValue: 'Plan' })}</a>
            <a href="#schedule">{t('nav-schedule', { defaultValue: 'Schedule' })}</a>
            <a href="#list">{t('nav-list', { defaultValue: 'Watch list' })}</a>
          </div>
          <div className="ds-topbar-actions">
            <button
              type="button"
              className="ds-btn ds-btn--ghost ds-btn--sm ds-btn--icon"
              aria-pressed={state.night}
              aria-label={t('night', { defaultValue: 'Night mode' })}
              onClick={() => actions.set('night', !state.night)}
            >
              {state.night ? (
                <Sun size={16} aria-hidden="true" />
              ) : (
                <Moon size={16} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </nav>

      <main className="ds-main" id="top">
        <Hero />

        <motion.section id="plan" className="ds-section" {...reveal}>
          <h2 className="ds-section-title">
            {t('section-plan', { defaultValue: 'Build your marathon' })}
          </h2>
          <div className="ds-grid-2">
            <PlanControls
              state={state}
              actions={actions}
              effectiveAvg={plan.minutesPerDay}
              effectiveStart={settings.startDate}
            />
            <div className="ds-stack" style={{ alignContent: 'start' }}>
              <StatusPanel
                plan={plan}
                progress={progress}
                deadline={state.settings.deadline}
                fitMinutes={fitMinutes}
                essentialsFinish={essentialsFinish}
                onUseFit={() => actions.setSettings({ mode: 'fit' })}
                onEssentials={() => actions.preset('essentials')}
              />
              <TitleMix state={state} />
            </div>
          </div>
        </motion.section>

        <motion.section id="schedule" className="ds-section" {...reveal}>
          <h2 className="ds-section-title">
            {t('section-schedule', { defaultValue: 'Night by night' })}
          </h2>
          <Schedule plan={plan} state={state} actions={actions} today={today} />
        </motion.section>

        <motion.section id="list" className="ds-section" {...reveal}>
          <h2 className="ds-section-title">
            {t('section-list', { defaultValue: 'What’s on the list' })}
          </h2>
          <Watchlist state={state} actions={actions} />
        </motion.section>

        <footer className="ds-footer">
          <div className="ds-footer-badges" aria-hidden="true">
            <span className="ds-88x31">AERO 2026</span>
            <span className="ds-88x31">SPOILER FREE</span>
            <span className="ds-88x31">SPICE INSIDE</span>
          </div>
          <p>
            {t('footer-note', {
              defaultValue:
                'Runtimes are theatrical cuts; series totals marked ≈ are estimates — tap any runtime to correct it. Your plan is saved in this browser only. A fan-made planner, not affiliated with Marvel Studios, Disney, Legendary or Warner Bros.',
            })}
          </p>
          <p className="ds-faint">
            {t('footer-made', {
              defaultValue: 'Made at RMH Studios · Best viewed with a bowl of popcorn',
            })}
          </p>
        </footer>
      </main>

      <Balloons items={balloons} onClose={closeBalloon} />
      <Buddy
        plan={plan}
        state={state}
        actions={actions}
        today={today}
        remainingMinutes={remainingMinutes}
      />
    </div>
  );
}

/** Where the hours go: MCU films vs series vs Dune vs extras, as glossy bars. */
function TitleMix({ state }: { state: DunesdayState }) {
  const { t } = useTranslation('c-dunesday');
  const rows = useMemo(() => {
    const included = allTitles(state).filter((x) => isIncluded(state, x));
    const sum = (f: (x: (typeof included)[number]) => boolean) =>
      included.filter(f).reduce((a, x) => a + (state.runtimeOverrides[x.id] ?? x.minutes), 0);
    return [
      {
        key: 'films',
        label: t('mix-films', { defaultValue: 'MCU films' }),
        minutes: sum((x) => x.franchise === 'mcu' && x.kind === 'film'),
      },
      {
        key: 'series',
        label: t('mix-series', { defaultValue: 'MCU series & specials' }),
        minutes: sum((x) => x.franchise === 'mcu' && x.kind !== 'film'),
      },
      {
        key: 'dune',
        label: t('mix-dune', { defaultValue: 'Dune' }),
        minutes: sum((x) => x.franchise === 'dune'),
      },
      {
        key: 'extra',
        label: t('mix-extra', { defaultValue: 'Your extras' }),
        minutes: sum((x) => x.franchise === 'extra'),
      },
    ].filter((r) => r.minutes > 0);
  }, [state, t]);
  const total = rows.reduce((a, r) => a + r.minutes, 0) || 1;
  const skipped = TITLES.filter((x) => !isIncluded(state, x)).length;

  return (
    <section className="ds-window" aria-labelledby="ds-mix-title">
      <div className="ds-titlebar">
        <h2 id="ds-mix-title">{t('mix-title', { defaultValue: 'Where the hours go' })}</h2>
      </div>
      <div className="ds-window-body ds-stack" style={{ gap: 10 }}>
        {rows.map((r) => (
          <div key={r.key}>
            <div className="ds-row" style={{ justifyContent: 'space-between', fontSize: 14 }}>
              <span>{r.label}</span>
              <strong>{Math.round(r.minutes / 60)}h</strong>
            </div>
            <div className="ds-meter" aria-hidden="true">
              <motion.span
                initial={{ width: 0 }}
                animate={{ width: `${(r.minutes / total) * 100}%` }}
                transition={{ duration: DURATION.slow * 3, ease: EASE.standard }}
              />
            </div>
          </div>
        ))}
        {skipped > 0 && (
          <span className="ds-hint">
            {t('mix-skipped', {
              count: skipped,
              defaultValue: '{{count}} titles left out of the plan.',
              defaultValue_one: '{{count}} title left out of the plan.',
              defaultValue_other: '{{count}} titles left out of the plan.',
            })}
          </span>
        )}
      </div>
    </section>
  );
}
