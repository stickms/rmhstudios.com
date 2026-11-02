/**
 * A bare page that runs the Harmonic client without the site (no SSR, no database): a canvas, the
 * HUD store and input state, `createHarmonicClient`. Used by `models-smoke.ts` to check the entity
 * renderer drawing the procedural models. Exposes `window.__rmhGame` like the play page does.
 */
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
