/**
 * Temple of Joy — the shell.
 *
 * Owns what is true for the whole session: loading the save, running the
 * vigil catch-up, driving the tick, wiring the audio, and saving on the way
 * out. The interface itself is the four components below it.
 */
'use client';

import { useEffect, useRef } from 'react';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { applyVigil } from '@/lib/temple-of-joy/tick';
import { doAudit } from '@/lib/temple-of-joy/actions';
import { useAutoSave } from '@/lib/temple-of-joy/persistence';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import type { GameState } from '@/lib/temple-of-joy/types';
import { useTempleValue } from './hooks';
import { TempleHud } from './TempleHud';
import { TempleSanctum } from './TempleSanctum';
import { TempleTabs } from './TempleTabs';
import { TemplePanel } from './panels/TemplePanel';
import { TempleDialogs } from './TempleDialogs';
import { BowlOverlay } from './bowl/BowlOverlay';

export function TempleOfJoyGame({ initialSave }: { initialSave?: Partial<GameState> | null }) {
  const theme = useTempleValue((s) => s.theme);
  const flourish = useTempleValue((s) => s.reducedFlourish);
  // Any modal open makes the game behind it inert. `aria-modal` alone does not:
  // it is a hint to assistive tech and nothing at all to the Tab key, so every
  // source row, tab and Sinner behind an open dialog stayed focusable and
  // clickable through the scrim.
  const modal = useTempleValue(
    (s) => s.showBowl || s.showVigilDialog || s.showAscendDialog || s.showMannaDialog,
  );
  const rootRef = useRef<HTMLDivElement>(null);

  /* ── Load, then catch up on the absence ──────────────────────────────── */

  useEffect(() => {
    const now = Date.now();

    if (initialSave) {
      useTempleStore.setState({ ...initialSave, lastTick: now, openedAt: now });

      // The vigil runs against the *loaded* state, so everything it reads —
      // the rate, the Sinners' appetite, the garden's soil — is what the
      // player actually left behind.
      const vigil = applyVigil(useTempleStore.getState(), now);
      useTempleStore.setState({
        ...vigil.state,
        openedAt: now,
        touchesAtOpen: vigil.state.totalTouches,
        showVigilDialog: vigil.state.vigil.pending,
      });
    } else {
      useTempleStore.setState({ lastTick: now, lastSaved: now, openedAt: now });
    }

    // Catch up any trophy this build added since the save was written.
    useTempleStore.setState(doAudit(useTempleStore.getState()));
    useTempleStore.setState({ initialized: true });
    // Load runs once, against the save this component was handed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── The loop ────────────────────────────────────────────────────────── */

  useEffect(() => {
    let frame = 0;
    const step = () => {
      useTempleStore.getState().tick();
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    // The loop is bounded by this component's lifetime: unmounting cancels it.
    return () => cancelAnimationFrame(frame);
  }, []);

  /* ── Waking from the background ──────────────────────────────────────── */

  // A hidden tab stops receiving animation frames, so the game simply stops —
  // and `applyTick` clamps a single step to a minute, which would credit one
  // minute of a nine-hour afternoon spent in another tab. Coming back runs the
  // same vigil the loader does, measured from the last tick rather than the
  // last save.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;

      const state = useTempleStore.getState();
      if (!state.initialized) return;

      const now = Date.now();
      const asleep = (now - state.lastTick) / 1000;
      // Under a couple of minutes the tick's own clamp covers it, and a
      // "welcome back" for a glance at another tab would be absurd.
      if (asleep < 120) return;

      const vigil = applyVigil(state, now, state.lastTick);
      useTempleStore.setState({
        ...vigil.state,
        // Only worth interrupting for a real absence.
        showVigilDialog: asleep > 600,
      });
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useAutoSave();

  /* ── Sound ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    templeAudio.init();
    const { soundEnabled, musicVolume, sfxVolume } = useTempleStore.getState();
    templeAudio.setMusicVolume(musicVolume);
    templeAudio.setSfxVolume(sfxVolume);
    templeAudio.setEnabled(soundEnabled);

    const off = [
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

    return () => off.forEach((unsubscribe) => unsubscribe());
  }, []);

  // Browsers refuse to start audio until the user has interacted with the
  // page. `pointerdown` covers mouse, touch and pen in one listener.
  useEffect(() => {
    const unlock = () => templeAudio.markInteracted();
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []);

  // Saving on the way out belongs to `useAutoSave` and lives there alone: this
  // component used to register its own `pagehide` and `visibilitychange`
  // handlers too, which meant every tab switch fired two identical POSTs at an
  // endpoint rate-limited to twenty a minute.
  //
  // Deliberately no `beforeunload` confirmation anywhere: it fires the
  // browser's native "Leave site?" dialog on every navigation — unstyled,
  // untranslatable, and pointless for a game that autosaves continuously — and
  // it blocks bfcache, so coming back re-downloads and re-initialises
  // everything.

  return (
    // `data-no-twemoji` keeps the site-wide observer out of a tree React
    // re-renders constantly; emoji here go through `<Glyph>` instead.
    <div
      ref={rootRef}
      className="toj"
      data-theme={theme}
      data-flourish={flourish ? 'off' : undefined}
      data-no-twemoji
    >
      <div className="toj-frame" inert={modal}>
        <TempleHud />
        <div className="toj-body">
          <div className="toj-stage">
            <TempleSanctum />
          </div>
          <div className="toj-dock">
            <TempleTabs />
            <TemplePanel />
          </div>
        </div>
      </div>
      <TempleDialogs />
      {/* The alley renders nothing until it is opened, and the three.js and
          Rapier chunks behind it are only fetched then — most sessions never
          bowl, and none of them should pay for it. */}
      <BowlOverlay />
    </div>
  );
}
