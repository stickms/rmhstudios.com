'use client';

import { useEffect } from 'react';
import { useGameSession } from '@/hooks/useGameSession';
import { hearthworksStore } from '@/lib/hearthworks/store';
import { leaveLobby } from '@/lib/hearthworks/net/lobby';
import { loadWorld, saveWorld } from '@/lib/hearthworks/save';
import { Hud } from './Hud';
import Scene from './scene/Scene';
import './hearthworks.css';

const SLOT = 'main';
const AUTOSAVE_MS = 20_000;

/** Hearthworks — one world, drawn isometrically here (the third-person view arrives with the avatar). */
export default function HearthworksGame() {
  // Wake lock while playing and quiet chrome; the sim itself stops with the tab (no rAF while hidden).
  useGameSession({ id: 'hearthworks', active: true });

  useEffect(() => {
    let cancelled = false;
    void loadWorld(SLOT).then((saved) => {
      if (saved && !cancelled) hearthworksStore.getState().replaceWorld(saved);
    });
    // Joined someone else's world? The personal save is the offline world set aside, never the shared one.
    const save = () => {
      const s = hearthworksStore.getState();
      void saveWorld(SLOT, s.stash?.world ?? s.world);
    };
    const timer = window.setInterval(save, AUTOSAVE_MS);
    const onHide = () => {
      if (document.visibilityState === 'hidden') save();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    return () => {
      cancelled = true;
      // Leaving the page hands a hosted world to its successor (a no-op when multiplayer was never opened).
      leaveLobby();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', save);
      save();
    };
  }, []);

  return (
    <div className="hw" data-jelly-zone="playfield">
      <Scene />
      <Hud />
    </div>
  );
}
