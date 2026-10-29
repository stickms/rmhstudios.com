/**
 * Fetches a published map package (scripts/tf2-game/build-maps.ts → `<game>-game/maps/`)
 * and wires the default loaders a WorldRenderer needs: the shared texture cache and the
 * model channel's GLBs, all through lib/tf2-game/assets/urls.ts. Browser only.
 */
import type { WebGLRenderer } from 'three';
import {
  mapManifestSchema,
  type MapIndex,
  type MapManifest,
} from '@/lib/tf2-game/assets/map-manifest';
import { fetchGameJson, gameAssetUrl } from '@/lib/tf2-game/assets/urls';
import type { GameId } from '@/lib/tf2-game/assets/versions';
import { Tf2GLTFLoader } from '@/lib/tf2-loadout/gltf-loader';
import { parseBsp, type BspFile } from '../formats/bsp';
import { GlbModelProvider } from './props';
import { TextureCache } from './texture-cache';

export interface MapPackage {
  manifest: MapManifest;
  bsp: BspFile;
}

/** Loads `maps/index.json` → the map's manifest (validated) → its BSP (parsed). */
export async function fetchMapPackage(game: GameId, map: string, signal?: AbortSignal): Promise<MapPackage> {
  const index = await fetchGameJson<MapIndex>('maps/index.json', game);
  const entry = index?.maps[map];
  if (!entry) throw new Error(`map package ${game}/${map} is not published`);
  const mres = await fetch(gameAssetUrl(entry.manifest, game), { signal });
  if (!mres.ok) throw new Error(`map manifest ${entry.manifest}: HTTP ${mres.status}`);
  const parsed = mapManifestSchema.safeParse(await mres.json());
  if (!parsed.success) throw new Error(`map manifest ${entry.manifest}: ${parsed.error.message}`);
  const manifest = parsed.data;
  const bres = await fetch(gameAssetUrl(manifest.bsp, game), { signal });
  if (!bres.ok) throw new Error(`map ${manifest.bsp}: HTTP ${bres.status}`);
  const bsp = parseBsp(new Uint8Array(await bres.arrayBuffer()));
  return { manifest, bsp };
}

/** The texture cache for a game's `tex/` channel (one per renderer, shared by maps and models). */
export function createTextureCache(
  game: GameId,
  renderer: WebGLRenderer,
  quality: { maxTextureSize?: number; anisotropy?: number } = {},
): TextureCache {
  return new TextureCache({
    url: (file) => gameAssetUrl(file, game),
    renderer,
    maxSize: quality.maxTextureSize,
    anisotropy: quality.anisotropy,
  });
}

/** Static-prop GLBs from the game's model channel (`mdl/index.json`). */
export function createModelProvider(game: GameId): GlbModelProvider {
  return new GlbModelProvider({ url: (p) => gameAssetUrl(p, game), loader: new Tf2GLTFLoader() });
}
