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
import { saveToServer, useAutoSave } from '@/lib/temple-of-joy/persistence';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import type { GameState } from '@/lib/temple-of-joy/types';
import { useTempleValue } from './hooks';
import { TempleHud } from './TempleHud';
import { TempleSanctum } from './TempleSanctum';
import { TempleTabs } from './TempleTabs';
import { TemplePanel } from './panels/TemplePanel';
import { TempleDialogs } from './TempleDialogs';

export function TempleOfJoyGame({ initialSave }: { initialSave?: Partial<GameState> | null }) {
  const theme = useTempleValue((s) => s.theme);
  const flourish = useTempleValue((s) => s.reducedFlourish);
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

  /* ── Save on the way out ─────────────────────────────────────────────── */

  // Deliberately no `beforeunload` confirmation: it fires the browser's native
  // "Leave site?" dialog on every navigation — unstyled, untranslatable, and
  // pointless for a game that autosaves continuously — and it blocks bfcache,
  // so coming back re-downloads and re-initialises everything.
  //
  // `pagehide` and a hidden `visibilitychange` are the two events that actually
  // fire when a tab closes on mobile Safari, where `beforeunload` often does not.
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
    <div
      ref={rootRef}
      className="toj"
      data-theme={theme}
      data-flourish={flourish ? 'off' : undefined}
      data-no-twemoji
    >
      <div className="toj-frame">
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
    </div>
  );
}
