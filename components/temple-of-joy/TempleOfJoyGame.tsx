/**
 * Temple of Joy — the game shell.
 *
 * Owns the things that are true for the whole session: loading the save,
 * running the tick loop, wiring audio, and saving on the way out. The
 * interface itself is the four components below it.
 */
'use client';

import { useEffect, useRef } from 'react';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import {
  saveDataToState,
  computeOfflineProgress,
  useAutoSave,
  saveToServer,
} from '@/lib/temple-of-joy/persistence';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import type { SaveData } from '@/lib/temple-of-joy/types';
import { useTempleValue } from './hooks';
import { TempleHud } from './TempleHud';
import { TempleSanctum } from './TempleSanctum';
import { TempleTabs } from './TempleTabs';
import { TempleCodex } from './codex/TempleCodex';
import { TempleDialogs } from './TempleDialogs';

/** Below this, an absence isn't worth a "welcome back". */
const OFFLINE_REPORT_THRESHOLD_S = 30;

export function TempleOfJoyGame({ initialSaveData }: { initialSaveData?: SaveData | null }) {
  const theme = useTempleValue((s) => s.theme);
  const rootRef = useRef<HTMLDivElement>(null);

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const base = useTempleStore.getState();
    const now = Date.now();

    if (initialSaveData) {
      const merged = {
        ...base,
        ...saveDataToState(initialSaveData, base),
        lastClickTime: now,
        pageOpenTime: now,
        lastTickTime: now,
      };
      const offline = computeOfflineProgress(merged, now);

      useTempleStore.setState({
        ...merged,
        offlineHappinessOnLoad: offline.happiness,
        offlineSecondsOnLoad: offline.seconds,
        happiness: merged.happiness + offline.happiness,
        lifetimeHappiness: merged.lifetimeHappiness + offline.happiness,
        runHappiness: merged.runHappiness + offline.happiness,
        pilgrimageActive: offline.pilgrimageActive,
        pilgrimageTimer: offline.pilgrimageTimer,
        pilgrimageCooldown: offline.pilgrimageCooldown,
        totalPilgrimages: offline.totalPilgrimages,
        showOfflineModal: offline.seconds > OFFLINE_REPORT_THRESHOLD_S,
      });
    } else {
      useTempleStore.setState((s) => ({
        ...s,
        lastClickTime: now,
        pageOpenTime: now,
        lastTickTime: now,
      }));
    }

    useTempleStore.getState().auditAchievements();
    useTempleStore.setState({ gameInitialized: true });
    // Load runs once, against the save this component was handed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Tick ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      useTempleStore.getState().tick();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // ── Events surface as a dialog ──────────────────────────────────────────
  const pendingEvent = useTempleValue((s) => s.pendingEvent);
  useEffect(() => {
    if (pendingEvent != null) useTempleStore.getState().setShowEventModal(true);
  }, [pendingEvent]);

  useAutoSave();

  // ── Audio ───────────────────────────────────────────────────────────────
  useEffect(() => {
    templeAudio.init();
    const { soundEnabled, musicVolume, sfxVolume } = useTempleStore.getState();
    templeAudio.setMusicVolume(musicVolume);
    templeAudio.setSfxVolume(sfxVolume);
    templeAudio.setEnabled(soundEnabled);

    const unsubscribers = [
      useTempleStore.subscribe(
        (s) => s.soundEnabled,
        (enabled) => templeAudio.setEnabled(enabled),
      ),
      useTempleStore.subscribe(
        (s) => s.musicVolume,
        (volume) => templeAudio.setMusicVolume(volume),
      ),
      useTempleStore.subscribe(
        (s) => s.sfxVolume,
        (volume) => templeAudio.setSfxVolume(volume),
      ),
    ];

    return () => unsubscribers.forEach((off) => off());
  }, []);

  // Browsers refuse to start audio until the user has interacted with the page.
  useEffect(() => {
    const unlock = () => templeAudio.markInteracted();
    // `once` handles the removal; `pointerdown` covers mouse, touch and pen in
    // one listener.
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []);

  // ── A click anywhere in the temple should sound like one ────────────────
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onClick = (event: MouseEvent) => {
      const button = (event.target as HTMLElement).closest('button');
      // The sanctum plays its own note on pointerdown; this would double it.
      if (!button || button.disabled || button.classList.contains('toj-temple')) return;
      templeAudio.playClick();
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, []);

  // ── Save on the way out ─────────────────────────────────────────────────
  //
  // Deliberately no `beforeunload` confirmation. The old one fired the
  // browser's native "Leave site?" dialog on every navigation — unstyled,
  // untranslatable, and pointless for a game that autosaves continuously. It
  // also blocks bfcache, so returning re-downloaded and re-initialised
  // everything.
  //
  // `pagehide` and a hidden `visibilitychange` are the two events that
  // actually fire when a tab closes on mobile Safari, where `beforeunload`
  // frequently does not.
  useEffect(() => {
    const flush = () => {
      saveToServer(useTempleStore.getState()).catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, []);

  return (
    // `data-no-twemoji` keeps the site-wide observer out of a tree React
    // re-renders constantly; emoji here go through `<Glyph>` instead.
    <div ref={rootRef} className="toj" data-theme={theme} data-no-twemoji>
      <div className="toj-frame">
        <TempleHud />
        <div className="toj-body">
          <TempleSanctum />
          <TempleTabs />
          <TempleCodex />
        </div>
      </div>
      <TempleDialogs />
    </div>
  );
}
