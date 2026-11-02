/**
 * A bare page that runs the Harmonic client without the site (no SSR, no database): a canvas, the
 * HUD store and input state, `createHarmonicClient`. Used by `models-smoke.ts` to check the entity
 * renderer drawing the procedural models. Exposes `window.__rmhGame` like the play page does.
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import HarmonicHud from '../../../components/harmonic-game/HarmonicHud';
import '../../../components/harmonic-game/harmonic.css';
import { isHarmonicHud } from '../../../lib/harmonic-game/client/hud-state';
import { createHarmonicClient } from '../../../lib/harmonic-game/client/harmonic-client';
import { createHudStore } from '../../../lib/tf2-game/client/hud-store';
import { createInputState } from '../../../lib/tf2-game/client/input';
import { loadSettings } from '../../../lib/tf2-game/client/settings';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const level = new URLSearchParams(location.search).get('level') ?? undefined;
const store = createHudStore({ game: 'hl2' });
const input = createInputState();
const client = createHarmonicClient({
  canvas,
  inputTarget: canvas,
  store,
  input,
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
(window as unknown as { __rmhInput: unknown }).__rmhInput = input;
void client.start();

// `?hud=1` also mounts the React HUD over the canvas (subtitles, hints) without the site shell.
if (new URLSearchParams(location.search).get('hud')) {
  const host = document.getElementById('hud')!;
  const root = createRoot(host);
  const draw = () => {
    const s = store.getSnapshot();
    if (!isHarmonicHud(s.ext)) return;
    root.render(
      createElement(HarmonicHud, {
        hud: s.ext,
        now: s.now,
        subtitleSize: 'medium',
        showSubtitles: true,
      }),
    );
  };
  store.subscribe(draw);
}
