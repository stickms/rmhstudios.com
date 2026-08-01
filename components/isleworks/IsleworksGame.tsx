'use client';

/**
 * Isleworks — the game shell.
 *
 * Mounts the 3D scene once and layers the HUD over it. The scene stays mounted
 * behind the title screen on purpose: the island is generated and rendering
 * before the player presses anything, so "Found a city" reveals a world rather
 * than loading one.
 *
 * This component also owns the keyboard shortcuts that are *game* commands
 * rather than camera commands (the camera's own keys live in `CameraRig`), and
 * the autosave.
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useIsleworks } from '@/lib/isleworks/store';

import { BuildPalette } from './hud/BuildPalette';
import { Rail } from './hud/Rail';
import { StartScreen } from './hud/StartScreen';
import { Toasts } from './hud/Toasts';
import { TopBar } from './hud/TopBar';
import { CityScene } from './scene/CityScene';
import type { RigHandle } from './scene/CameraRig';
import './isleworks.css';

/** How often the city is written to localStorage while playing, in ms. */
const AUTOSAVE_MS = 20_000;

export default function IsleworksGame() {
  const { t } = useTranslation('c-isleworks');
  const started = useIsleworks((s) => s.started);
  const rigRef = useRef<RigHandle | null>(null);

  /* Game keys. The camera's Q/E/WASD are handled inside the rig. */
  useEffect(() => {
    if (!started) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.isContentEditable)) return;
      const store = useIsleworks.getState();
      switch (event.key.toLowerCase()) {
        case 'escape':
          store.cancelTool();
          store.select(null);
          break;
        case 'r':
          store.rotateTool(1);
          break;
        case ' ':
          event.preventDefault();
          store.setSpeed(store.speed === 0 ? 1 : 0);
          break;
        case '1':
          store.setSpeed(1);
          break;
        case '2':
          store.setSpeed(2);
          break;
        case '3':
          store.setSpeed(3);
          break;
        case 'x':
          store.setTool(store.tool.kind === 'bulldoze' ? { kind: 'none' } : { kind: 'bulldoze' });
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started]);

  /* Autosave, plus one final save when the tab goes away. */
  useEffect(() => {
    if (!started) return;
    const save = () => useIsleworks.getState().save();
    const timer = window.setInterval(save, AUTOSAVE_MS);
    const onHide = () => {
      if (document.visibilityState === 'hidden') save();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', save);
      save();
    };
  }, [started]);

  /* Right-click is "put the tool down", not "open the browser menu". */
  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      useIsleworks.getState().cancelTool();
    };
    const node = document.querySelector('.isw');
    node?.addEventListener('contextmenu', onContextMenu as EventListener);
    return () => node?.removeEventListener('contextmenu', onContextMenu as EventListener);
  }, []);

  return (
    <div className="isw">
      <div className="isw-canvas">
        <CityScene rigRef={rigRef} />
      </div>

      {started ? (
        <div className="isw-hud">
          <TopBar rigRef={rigRef} />
          <Rail />
          <BuildPalette />
          <Toasts />
        </div>
      ) : (
        <StartScreen />
      )}

      <span className="sr-only">
        {t('sr-summary', {
          defaultValue:
            'Isleworks is an isometric city builder played with a pointer. Use the build palette to place roads and buildings on the island grid.',
        })}
      </span>
    </div>
  );
}
