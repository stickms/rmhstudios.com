'use client';

/**
 * Dunesday 7 — the marathon planner as a Windows 7-style desktop.
 *
 * Lifecycle, like the real thing:
 *   boot → log on → desktop ⇄ locked
 *                    desktop → log off / switch user → log on
 *                    desktop → shut down → "safe to turn off" → (power) → boot
 *                    desktop → restart → boot → log on
 *
 * Everything runs in the browser. The file system, window placements and
 * personalization persist per browser; being "logged on" lasts for the tab's
 * session, so a reload goes straight back to the desktop.
 */

import { AnimatePresence, MotionConfig, m as motion } from 'framer-motion';
import { Power } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { APP_ROUTE_THEME_BG, paintDocumentGround } from '@/stores/themeStore';
import { cn } from '@/lib/utils';
import { BootSplash } from '../BootSplash';
import { useDunesday } from '../DunesdayProvider';
import { sfx } from '../sound';
import { useAeroFeedback } from '../useAeroFeedback';
import { openApp, showMessage, useCompact } from './actions';
import { DESKTOP_SHORTCUTS } from './apps';
import { BubbleField } from './BubbleField';
import { BusySpinner } from './BusySpinner';
import { Desktop } from './Desktop';
import { setDropErrorHandler, setTitleDropHandler } from './dnd';
import { Login } from './Login';
import { useOs } from './store';
import { Taskbar } from './Taskbar';
import { profileFolderName, useProfile } from './useProfile';
import { WindowLayer } from './Window';

type Phase = 'login' | 'desktop' | 'closing' | 'off' | 'boot';
const SESSION_KEY = 'dunesday:session';

export function DunesdayOS() {
  const { t } = useTranslation('c-dunesday');
  const { state, actions, muted, toggleMuted } = useDunesday();
  const profile = useProfile();
  const compact = useCompact();
  const prefs = useOs((s) => s.prefs);
  const rootRef = useRef<HTMLDivElement>(null);
  useAeroFeedback(rootRef);

  const [phase, setPhase] = useState<Phase>('login');
  const [locked, setLocked] = useState(false);
  const [closing, setClosing] = useState<'shutdown' | 'restart' | 'logoff'>('shutdown');
  const [hydrated, setHydrated] = useState(false);
  const [saver, setSaver] = useState(false);

  // Restore persisted desktop state after mount (the server rendered defaults).
  useEffect(() => {
    void Promise.resolve(useOs.persist.rehydrate()).then(() => {
      setHydrated(true);
      try {
        if (sessionStorage.getItem(SESSION_KEY) === 'in') setPhase('desktop');
      } catch {
        // No session storage: start at the logon screen.
      }
    });
  }, []);

  // Make sure the profile folder exists and is named after whoever is logged on.
  useEffect(() => {
    if (!hydrated || phase !== 'desktop') return;
    useOs.getState().ensureVfs(profileFolderName(profile.name), DESKTOP_SHORTCUTS);
    if (useOs.getState().firstRun) {
      useOs.getState().setFirstRun(false);
      openApp('welcome');
    }
  }, [hydrated, phase, profile.name]);

  // A title dropped on the Recycle Bin leaves the plan; dropped on Videos it returns.
  useEffect(() => {
    setTitleDropHandler((ids, include) => actions.setIncludedMany(ids, include));
    setDropErrorHandler((message) => showMessage({ icon: 'error', text: message }));
    return () => {
      setTitleDropHandler(null);
      setDropErrorHandler(null);
    };
  }, [actions]);

  // The two grounds come from `APP_ROUTE_THEME_BG` rather than being repeated
  // here, because the pre-paint script in `app/routes/__root.tsx` paints from that
  // same map before this effect can run — and when the two disagreed, every first
  // load flashed. They did disagree: this effect painted `#1a4f8f` while the entry
  // named `--ds-ground` (`#bfe6ff`), so the document was pre-painted one blue and
  // repainted another. `components/pf2ecal/theme.ts` reads the map for exactly
  // this reason.
  useEffect(() => {
    const ground = APP_ROUTE_THEME_BG['/dunesday'];
    paintDocumentGround(state.night ? ground.dark : ground.light, state.night);
  }, [state.night]);

  // Screensaver after the chosen idle time on the desktop.
  useEffect(() => {
    if (phase !== 'desktop' || !prefs.screensaverMin) return;
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setSaver(true), prefs.screensaverMin * 60_000);
    };
    const wake = () => {
      setSaver(false);
      arm();
    };
    arm();
    const evs = ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const;
    evs.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      evs.forEach((e) => window.removeEventListener(e, wake));
    };
  }, [phase, prefs.screensaverMin]);

  const logon = useCallback(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, 'in');
    } catch {
      // Fine: the logon just won't survive a reload.
    }
    setLocked(false);
    setPhase('desktop');
  }, []);

  const lock = useCallback(() => {
    setLocked(true);
    setPhase('login');
  }, []);

  const endSession = useCallback((kind: 'shutdown' | 'restart' | 'logoff') => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
    setClosing(kind);
    setPhase('closing');
    sfx.undo();
    window.setTimeout(() => {
      useOs.getState().resetSession();
      setLocked(false);
      if (kind === 'logoff') setPhase('login');
      else if (kind === 'restart') setPhase('boot');
      else setPhase('off');
    }, 1600);
  }, []);

  return (
    <MotionConfig reducedMotion={prefs.reduceMotion ? 'always' : 'user'}>
      <div
        ref={rootRef}
        className={cn(
          'ds ds-os',
          `ds-glass--${prefs.glass}`,
          !prefs.transparency && 'ds-os--opaque',
          prefs.highContrast && 'ds-os--contrast',
          prefs.reduceMotion && 'ds-os--still',
          compact && 'ds-os--compact',
        )}
        data-night={state.night}
        style={{ fontSize: `${prefs.textScale * 100}%` }}
      >
        {phase === 'desktop' && hydrated && (
          <>
            <Desktop compact={compact} />
            <WindowLayer compact={compact} />
            <Taskbar
              compact={compact}
              onLock={lock}
              onLogOff={() => endSession('logoff')}
              onShutdown={() => endSession('shutdown')}
              onRestart={() => endSession('restart')}
              onSwitchUser={lock}
            />
          </>
        )}

        {phase === 'login' && (
          <Login
            locked={locked}
            muted={muted}
            onToggleMuted={toggleMuted}
            onLogin={logon}
            onShutdown={() => endSession('shutdown')}
            onRestart={() => endSession('restart')}
          />
        )}

        {phase === 'closing' && (
          <div className="ds-logon ds-closing" role="status">
            <BusySpinner
              size={44}
              label={
                closing === 'logoff'
                  ? t('logging-off', { defaultValue: 'Logging off…' })
                  : closing === 'restart'
                    ? t('restarting', { defaultValue: 'Restarting…' })
                    : t('shutting-down', { defaultValue: 'Shutting down…' })
              }
            />
          </div>
        )}

        {phase === 'off' && (
          <div className="ds-off">
            <p>{t('safe-off', { defaultValue: 'It’s now safe to turn off your computer.' })}</p>
            <button type="button" className="ds-off-power" onClick={() => setPhase('boot')}>
              <Power size={28} aria-hidden="true" />
              <span>{t('power-on', { defaultValue: 'Turn on Dunesday 7' })}</span>
            </button>
          </div>
        )}

        {phase === 'boot' && <BootSplash force onDone={() => setPhase('login')} />}

        <AnimatePresence>
          {saver && (
            <motion.div
              className="ds-saver"
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <BubbleField count={16} big />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
