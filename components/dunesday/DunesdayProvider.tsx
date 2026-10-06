'use client';

/**
 * Everything the Dunesday desktop's apps share: the plan and its actions, the
 * derived schedule and progress, cloud sync, sounds, and achievement balloons.
 *
 * One provider instead of prop-drilling through a window manager: an app
 * window can open anywhere, in any order, and each one reads exactly what it
 * needs from `useDunesday()`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useCelebration } from '@/hooks/useCelebration';
import { buildPlan, localToday, type Plan, type PlanSettings } from '@/lib/dunesday/schedule';
import {
  allTitles,
  effectiveSettings,
  isIncluded,
  isWatched,
  progressOf,
  remainingWork,
  type DunesdayState,
  type Progress,
} from '@/lib/dunesday/state';
import type { Balloon } from './Balloons';
import { isMuted, setMuted, sfx } from './sound';
import { useCloudSync, type CloudSync } from './useCloudSync';
import { useDunesdayState, type DunesdayActions } from './useDunesdayState';

export interface DunesdayContextValue {
  state: DunesdayState;
  actions: DunesdayActions;
  ready: boolean;
  sync: CloudSync;
  today: string;
  settings: PlanSettings;
  plan: Plan;
  progress: Progress;
  remainingMinutes: number;
  pct: number;
  tonight: Plan['days'][number] | null;
  fitMinutes: number | null;
  essentialsFinish: string | null;
  muted: boolean;
  toggleMuted: () => void;
  balloons: Balloon[];
  notify: (b: Omit<Balloon, 'id'>) => void;
  closeBalloon: (id: string) => void;
}

const Ctx = createContext<DunesdayContextValue | null>(null);

export function useDunesday(): DunesdayContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDunesday() outside <DunesdayProvider>');
  return v;
}

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

export function DunesdayProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation('c-dunesday');
  const { state, ready, importedShare, actions } = useDunesdayState();
  const celebrate = useCelebration();
  const [muted, setMutedState] = useState(false);
  const [today, setToday] = useState(() => localToday());
  const [balloons, setBalloons] = useState<Balloon[]>([]);

  useEffect(() => setMutedState(isMuted()), []);
  const toggleMuted = useCallback(() => {
    const next = !isMuted();
    setMuted(next);
    setMutedState(next);
    if (!next) sfx.bloop();
  }, []);

  const notify = useCallback((b: Omit<Balloon, 'id'>) => {
    setBalloons((cur) =>
      [...cur, { ...b, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }].slice(-3),
    );
  }, []);
  const closeBalloon = useCallback(
    (id: string) => setBalloons((cur) => cur.filter((b) => b.id !== id)),
    [],
  );

  const sync = useCloudSync(state, ready, actions.replace, () =>
    toast.error(
      t('sync-lost', {
        defaultValue:
          'Your synced copy no longer exists, so sync was turned off. Your plan is still here.',
      }),
    ),
  );

  useEffect(() => {
    if (sync.restored)
      toast.success(t('sync-restored', { defaultValue: 'Synced plan loaded on this device.' }));
  }, [sync.restored, t]);

  // Roll "today" over at midnight for anyone who leaves the tab open.
  useEffect(() => {
    setToday(localToday());
    const id = window.setInterval(() => setToday(localToday()), 60_000);
    return () => window.clearInterval(id);
  }, []);

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
  const pct = progress.totalMinutes
    ? Math.round((progress.watchedMinutes / progress.totalMinutes) * 100)
    : 0;
  const tonight = plan.days.find((d) => d.date === today) ?? null;

  const fitMinutes = useMemo(() => {
    if (plan.onTime) return null;
    const fit = buildPlan(work, { ...settings, mode: 'fit' });
    return fit.impossible ? null : fit.minutesPerDay;
  }, [plan.onTime, work, settings]);
  const essentialsFinish = useMemo(() => {
    if (plan.onTime) return null;
    const essentials = work.filter((w) => w.title.essential);
    if (essentials.length === work.length) return null;
    return buildPlan(essentials, { ...settings, mode: 'pace', minutesPerDay: plan.minutesPerDay })
      .finishDate;
  }, [plan.onTime, plan.minutesPerDay, work, settings]);

  // Achievement balloons: only for achievements earned during this visit.
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
    for (const key of fresh) {
      const copy = balloonCopy(key);
      if (copy) notify(copy);
    }
    if (
      fresh.includes('all') ||
      fresh.some((k) => k.startsWith('phase-')) ||
      fresh.includes('dune')
    ) {
      sfx.fanfare();
      void celebrate({
        kind: fresh.includes('all') ? 'fireworks' : undefined,
        colors: ['#19b5f0', '#8ae65c', '#ffd58a', '#ffffff'],
      });
    }
  }, [state, progress.streak, ready, balloonCopy, celebrate, notify]);

  const value: DunesdayContextValue = {
    state,
    actions,
    ready,
    sync,
    today,
    settings,
    plan,
    progress,
    remainingMinutes,
    pct,
    tonight,
    fitMinutes,
    essentialsFinish,
    muted,
    toggleMuted,
    balloons,
    notify,
    closeBalloon,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
