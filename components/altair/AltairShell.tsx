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
import { altairSfx } from '@/lib/altair/audio/sfx';
import { useAltairToastStore } from '@/lib/altair/stores/toast-store';
import ToastContainer from '@/components/altair/ToastContainer';

function isDisabled(el: Element): boolean {
  return (
    el.hasAttribute('disabled') ||
    el.getAttribute('aria-disabled') === 'true'
  );
}

function findInteractive(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  return target.closest(
    'button, a[href], [role="button"], input[type="checkbox"], input[type="radio"], input[type="range"], select, label[for]',
  );
}

export default function AltairShell({ children }: { children: React.ReactNode }) {
  const theme = useAltairSettingsStore((s) => s.theme) ?? 'dark';

  // Load meta progression from DB on mount so it's ready before any game screen.
  useEffect(() => {
    useAltairMetaStore.getState().loadFromServer();
    if (altairSfx.isEnabled() && !altairSfx.supportsOgg()) {
      useAltairToastStore.getState().addToast(
        'Your browser may not support OGG audio. Try Chrome/Firefox or provide MP3 SFX assets.',
        'warning',
      );
    }
  }, []);

  // Start background music on mount and sync volume with settings.
  // Lives here (not in page.tsx) so music persists across all /altair/* routes.
  useEffect(() => {
    altairMusic.start();
    let prev = {
      master: useAltairSettingsStore.getState().masterVolume,
      music: useAltairSettingsStore.getState().musicVolume,
      sfx: useAltairSettingsStore.getState().sfxVolume,
    };
    const unsub = useAltairSettingsStore.subscribe((s) => {
      const masterOrMusicChanged = s.masterVolume !== prev.master || s.musicVolume !== prev.music;
      const masterOrSfxChanged = s.masterVolume !== prev.master || s.sfxVolume !== prev.sfx;
      if (masterOrMusicChanged) {
        altairMusic.updateVolume();
      }
      if (masterOrSfxChanged) {
        altairSfx.updateVolume();
      }
      prev = { master: s.masterVolume, music: s.musicVolume, sfx: s.sfxVolume };
    });
    return () => {
      unsub();
      altairMusic.stop();
      altairSfx.unload();
    };
  }, []);

  // Global UI SFX for click/toggle interactions across Altair screens.
  useEffect(() => {
    if (!altairSfx.isEnabled()) return;

    const unlockOnce = () => {
      altairSfx.prime();
      document.removeEventListener('pointerdown', unlockOnce, true);
      document.removeEventListener('keydown', unlockOnce, true);
      document.removeEventListener('touchstart', unlockOnce, true);
    };
    document.addEventListener('pointerdown', unlockOnce, true);
    document.addEventListener('keydown', unlockOnce, true);
    document.addEventListener('touchstart', unlockOnce, true);

    const onClick = (e: MouseEvent) => {
      const el = findInteractive(e.target);
      if (!el || isDisabled(el)) return;
      altairSfx.play('ui_click');
    };

    const onInputLike = (e: Event) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (
        target.matches('input[type="range"], input[type="checkbox"], input[type="radio"], select')
      ) {
        altairSfx.play('menu_toggle');
      }
    };

    document.addEventListener('click', onClick, true);
    document.addEventListener('input', onInputLike, true);
    document.addEventListener('change', onInputLike, true);
    return () => {
      document.removeEventListener('pointerdown', unlockOnce, true);
      document.removeEventListener('keydown', unlockOnce, true);
      document.removeEventListener('touchstart', unlockOnce, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('input', onInputLike, true);
      document.removeEventListener('change', onInputLike, true);
    };
  }, []);

  return (
    <div className={`altair-theme ${theme === 'light' ? 'altair-light' : ''}`}>
      <ToastContainer />
      {children}
    </div>
  );
}
