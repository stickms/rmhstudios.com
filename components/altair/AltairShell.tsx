/**
 * AltairShell — Client-side wrapper for the Altair theme system.
 *
 * Wraps children with the themed container and toast notifications.
 * Manages light/dark theme class based on persisted settings.
 * Also manages background music lifecycle so it persists across route changes
 * (including multiplayer lobby/game pages).
 */
'use client';

import { useEffect } from 'react';
import { useAltairSettingsStore } from '@/lib/altair/stores/settings-store';
import { useAltairMetaStore } from '@/lib/altair/stores/meta-store';
import { altairMusic } from '@/lib/altair/audio/music';
import ToastContainer from '@/components/altair/ToastContainer';

export default function AltairShell({ children }: { children: React.ReactNode }) {
  const theme = useAltairSettingsStore((s) => s.theme) ?? 'dark';

  // Load meta progression from DB on mount so it's ready before any game screen.
  useEffect(() => {
    useAltairMetaStore.getState().loadFromServer();
  }, []);

  // Start background music on mount and sync volume with settings.
  // Lives here (not in page.tsx) so music persists across all /altair/* routes.
  useEffect(() => {
    altairMusic.start();
    let prev = { m: useAltairSettingsStore.getState().masterVolume, v: useAltairSettingsStore.getState().musicVolume };
    const unsub = useAltairSettingsStore.subscribe((s) => {
      if (s.masterVolume !== prev.m || s.musicVolume !== prev.v) {
        prev = { m: s.masterVolume, v: s.musicVolume };
        altairMusic.updateVolume();
      }
    });
    return () => { unsub(); altairMusic.stop(); };
  }, []);

  return (
    <div className={`altair-theme ${theme === 'light' ? 'altair-light' : ''}`}>
      <ToastContainer />
      {children}
    </div>
  );
}
