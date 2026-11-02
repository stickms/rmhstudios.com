/**
 * Harmonic's client: the HL2/Portal single-player client (`SpClient`) with Harmonic's content
 * injected through its `content` seam — levels compiled in the browser by `compileLevel`, textures
 * generated on demand, and `SpAssets` from TypeScript. The simulation is the `'hl2'` one (plan D9).
 * Death reloads the level-start checkpoint inside the world (`SpWorld.reloadAfterDeath`).
 *
 * Browser only (it imports the procedural texture cache).
 */
import {
  createSpClient,
  type SpClient,
  type SpClientOptions,
  type SpContent,
} from '../../tf2-game/client/sp-client';
import { compileLevel } from '../compiler';
import { HARMONIC_MATERIAL_LOOKUP, createHarmonicAssets } from '../assets';
import { createHarmonicModelLibrary } from '../assets/models/library';
import { createProceduralTextureCache } from '../assets/texture-cache';
import { HARMONIC_LEVELS, findHarmonicLevel } from '../levels';
import { activeHarmonicSim, attachHarmonicSim } from '../sim';
import { onPhaseLevelReady } from './phase-view';
import { createHarmonicAudio } from '../audio/player';
import { readHudState } from './hud-state';
import { saveLevelStart } from './save';

export type HarmonicClientOptions = Omit<
  SpClientOptions,
  'game' | 'map' | 'content' | 'transition'
> & {
  /** A level id from `HARMONIC_LEVELS`; defaults to the first. */
  level?: string;
};

/** The content seam for Harmonic: no network, no game install. */
export function harmonicContent(): SpContent {
  return {
    maps: HARMONIC_LEVELS.map((l) => ({ name: l.id, title: l.titleDefault })),
    async loadLevel(map, progress) {
      const level = findHarmonicLevel(map);
      if (!level) throw new Error(`unknown Harmonic level "${map}"`);
      progress.begin('map', 1);
      const compiled = compileLevel(level.source(), { materials: HARMONIC_MATERIAL_LOOKUP });
      progress.finish('map');
      saveLevelStart(level.id); // the Continue slot (H1.4)
      return {
        bsp: compiled.bsp,
        manifest: compiled.manifest,
        hulls: null,
        title: level.titleDefault,
      };
    },
    createAssets: async () => createHarmonicAssets(),
    attachWorld: attachHarmonicSim,
    createTextures: (core) =>
      createProceduralTextureCache({
        renderer: core.renderer,
        maxSize: core.plan.maxTextureSize,
        anisotropy: core.plan.anisotropy,
      }),
    // Procedural models: an in-memory index and a stub loader (assets/models/library.ts).
    createModels: () => createHarmonicModelLibrary(),
    // Nothing from the HL2/Portal channels: no suit HUD (Harmonic's own HUD rides `hud`) and no
    // write to the HL2 save slot (Harmonic saves in loadLevel).
    // Sound is Harmonic's own synthesised bank, injected through `createAudio` (H3.3).
    features: { audio: false, suitHud: false, saves: false },
    onLevelReady: (ctx) => onPhaseLevelReady(ctx),
    createAudio: createHarmonicAudio,
    hud: (snap) => readHudState(snap, activeHarmonicSim()),
  };
}

export function createHarmonicClient(opts: HarmonicClientOptions): SpClient {
  const { level, ...mount } = opts;
  return createSpClient({
    ...mount,
    game: 'hl2',
    map: level ?? HARMONIC_LEVELS[0].id,
    content: harmonicContent(),
  });
}
