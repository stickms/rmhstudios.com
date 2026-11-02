/**
 * Renders Harmonic's synthesised sounds to WAV files and prints peak / RMS / duration (plan H3.3).
 *
 *   pnpm exec tsx scripts/harmonic/audio-export.ts <out-dir> [name ...]
 *
 * No browser: `lib/harmonic-game/audio/dsp.ts` is pure, so the same samples play in the game.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  encodeWav,
  measure,
  recipeFor,
  renderRecipe,
  SOUND_NAMES,
  type HarmonicSoundName,
} from '../../lib/harmonic-game/audio';

const out = process.argv[2];
if (!out) {
  console.error('usage: audio-export.ts <out-dir> [sound-name ...]');
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const names = (
  process.argv.length > 3 ? process.argv.slice(3) : SOUND_NAMES
) as HarmonicSoundName[];
for (const name of names) {
  const pcm = renderRecipe(recipeFor(name, 0));
  const m = measure(pcm);
  writeFileSync(path.join(out, `${name}.wav`), encodeWav(pcm));
  process.stdout.write(
    `${`${name.padEnd(20)} peak ${m.peak.toFixed(3)}  rms ${m.rms.toFixed(3)}  ${m.seconds.toFixed(2)}s  ${pcm.rate} Hz x${pcm.channels.length}`}\n`,
  );
}
