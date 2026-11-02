/**
 * A bare page that runs the Harmonic client without the site (no SSR, no database): a canvas, the
 * HUD store and input state, `createHarmonicClient`. Used by `models-smoke.ts` to check the entity
 * renderer drawing the procedural models. Exposes `window.__rmhGame` like the play page does.
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import '../../../components/shared/app-theme.css';
import '../../../components/harmonic-game/harmonic.css';
import HarmonicHud from '../../../components/harmonic-game/HarmonicHud';
import { isHarmonicHud } from '../../../lib/harmonic-game/client/hud-state';
import { createHarmonicClient } from '../../../lib/harmonic-game/client/harmonic-client';
import { createHudStore } from '../../../lib/tf2-game/client/hud-store';
import { createInputState } from '../../../lib/tf2-game/client/input';
import { loadSettings } from '../../../lib/tf2-game/client/settings';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const level = new URLSearchParams(location.search).get('level') ?? undefined;
const store = createHudStore({ game: 'hl2' });
const client = createHarmonicClient({
  canvas,
  inputTarget: canvas,
  store,
  input: createInputState(),
  settings: loadSettings('hl2'),
  callbacks: {
    onPhase: (p) => {
      document.title = `harmonic:${p}`;
    },
    onError: (e) => {
      document.title = 'harmonic:error';
      console.error('client error', e);
    },
  },
  level,
});
(window as unknown as { __rmhGame: unknown }).__rmhGame = client;
void client.start();

// The HUD overlay (English defaults), so screenshots show the meters and the frost edge.
void i18next.use(initReactI18next).init({ lng: 'en', resources: {} });
const hudRoot = createRoot(document.getElementById('hud') as HTMLElement);
store.subscribe(() => {
  const ext = store.getSnapshot().ext;
  hudRoot.render(
    isHarmonicHud(ext)
      ? createElement(HarmonicHud, {
          hud: ext,
          now: 0,
          subtitleSize: 'medium',
          showSubtitles: true,
        })
      : null,
  );
});
