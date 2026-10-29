/**
 * Render-harness page (browser entry, bundled by shoot.ts with esbuild — not part of the
 * app). Loads a map package from the harness server (`/pkg/<game>/…`, the layout
 * scripts/tf2-game/build-maps.ts writes) or, without one, an original BSP from the game
 * install (`/orig/<game>/<map>.bsp`, colour-only materials), and exposes `window.harness`
 * for the Playwright driver.
 */
import { SRGBColorSpace, WebGLRenderer } from 'three';
import type { MapIndex, MapManifest } from '@/lib/tf2-game/assets/map-manifest';
import { parseBsp, type BspFile } from '@/lib/tf2-game/formats/bsp';
import { MapCollision } from '@/lib/tf2-game/world/map-collision';
import { emptyTrace } from '@/lib/tf2-game/core/types';
import { MASK_OPAQUE, SURF_SKY } from '@/lib/tf2-game/core/constants';
import { Tf2GLTFLoader } from '@/lib/tf2-loadout/gltf-loader';
import { SourceCamera, type SourceView } from '@/lib/tf2-game/render/camera';
import { TextureCache } from '@/lib/tf2-game/render/texture-cache';
import { GlbModelProvider } from '@/lib/tf2-game/render/props';
import { WorldRenderer, type GameName } from '@/lib/tf2-game/render/world-renderer';
import { measureHdrScale } from '@/lib/tf2-game/render/lightmap';

interface LoadResult {
  source: 'package' | 'original';
  parseMs: number;
  fetchMs: number;
  stats: WorldRenderer['stats'];
  hdr: boolean;
  lightScale: number;
  measuredHdrScale: number | null;
}

const canvas = document.getElementById('c') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);
const W = Number(params.get('w') ?? 960);
const H = Number(params.get('h') ?? 540);
canvas.width = W;
canvas.height = H;
const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = SRGBColorSpace;
const cam = new SourceCamera(W / H);
let world: WorldRenderer | null = null;
let textures: TextureCache | null = null;
let bsp: BspFile | null = null;
const t0 = performance.now();

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  const r = await fetch(url);
  if (!r.ok) return null;
  return new Uint8Array(await r.arrayBuffer());
}

async function loadMap(game: GameName, map: string, mode: 'auto' | 'package' | 'original' = 'auto'): Promise<LoadResult> {
  world?.dispose();
  world = null;
  const pkg = `/pkg/${game}/`;
  let manifest: MapManifest | null = null;
  let bytes: Uint8Array | null = null;
  const f0 = performance.now();
  if (mode !== 'original') {
    const index = (await fetch(pkg + 'maps/index.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)) as MapIndex | null;
    const entry = index?.maps[map];
    if (entry) {
      manifest = (await fetch(pkg + entry.manifest).then((r) => r.json())) as MapManifest;
      bytes = await fetchBytes(pkg + manifest.bsp);
    }
    if (!bytes && mode === 'package') throw new Error(`no package for ${game}/${map}`);
  }
  if (!bytes) {
    manifest = null;
    bytes = await fetchBytes(`/orig/${game}/${map}.bsp`);
    if (!bytes) throw new Error(`no BSP for ${game}/${map}`);
  }
  const f1 = performance.now();
  bsp = parseBsp(bytes);
  const f2 = performance.now();
  textures ??= new TextureCache({ url: (f) => pkg + f, renderer, maxSize: Number(params.get('maxtex') ?? 0) || undefined });
  const collision = new MapCollision(bsp);
  const tr = emptyTrace();
  const sun = { x: 0, y: 0, z: 0 };
  const loader = new Tf2GLTFLoader();
  world = new WorldRenderer({
    bsp,
    manifest,
    game,
    textures: manifest ? textures : null,
    lighting: (params.get('lighting') as 'hdr' | 'ldr' | null) ?? undefined,
    debugView: (params.get('debug') as 'lightmap' | 'blend' | null) ?? null,
    models: new GlbModelProvider({ url: (p) => pkg + p, loader }),
    sunVisible: (p) => {
      const s = world?.sun ?? null;
      if (!s) return false;
      sun.x = p.x + s.dir[0] * 16384;
      sun.y = p.y + s.dir[1] * 16384;
      sun.z = p.z + s.dir[2] * 16384;
      collision.traceLine(p, sun, MASK_OPAQUE, null, tr);
      return tr.fraction >= 1 || (tr.surfaceFlags & SURF_SKY) !== 0;
    },
  });
  return {
    source: manifest ? 'package' : 'original',
    fetchMs: f1 - f0,
    parseMs: f2 - f1,
    stats: world.stats,
    hdr: world.hdr,
    lightScale: world.lightScale,
    measuredHdrScale: measureHdrScale(bsp),
  };
}

function setView(v: SourceView & { pvs?: boolean }): void {
  cam.set(v);
  if (world) world.pvsEnabled = v.pvs !== false;
}

function render(): { ms: number; stats: WorldRenderer['stats']; propMeshes: number; brushModels: number } {
  if (!world) throw new Error('no map');
  const a = performance.now();
  world.update(cam, (performance.now() - t0) / 1000);
  world.render(renderer, cam);
  const gl = renderer.getContext();
  gl.finish();
  let propMeshes = 0;
  world.props?.group.traverseVisible((o) => {
    if ((o as { isInstancedMesh?: boolean }).isInstancedMesh) propMeshes++;
  });
  let brushModels = 0;
  for (let i = 1; i < bsp!.models.length; i++) if (world.brushModel(i)?.visible) brushModels++;
  return { ms: performance.now() - a, stats: JSON.parse(JSON.stringify(world.stats)) as WorldRenderer['stats'], propMeshes, brushModels };
}

async function waitLoaded(): Promise<void> {
  await world?.whenLoaded();
}

function entities(prefix: string): Array<Record<string, string>> {
  if (!bsp) return [];
  return bsp.entities
    .filter((e) => e.classname.startsWith(prefix))
    .map((e) => Object.fromEntries(e.props.map(([k, v]) => [k.toLowerCase(), v])));
}

function ambientAt(x: number, y: number, z: number): number[] {
  return world ? Array.from(world.sampleAmbient({ x, y, z })) : [];
}

function propsNear(x: number, y: number, r: number): Array<{ model: string; origin: number[]; skin: number; flags: number }> {
  const sp = bsp?.staticProps;
  if (!sp) return [];
  return sp.props
    .filter((p) => Math.hypot(p.origin.x - x, p.origin.y - y) < r)
    .map((p) => ({ model: p.model, origin: [p.origin.x, p.origin.y, p.origin.z], skin: p.skin, flags: p.flags }));
}

declare global {
  interface Window {
    harness: {
      loadMap: typeof loadMap;
      setView: typeof setView;
      render: typeof render;
      waitLoaded: typeof waitLoaded;
      entities: typeof entities;
      ambientAt: typeof ambientAt;
      propsNear: typeof propsNear;
      ready: boolean;
    };
  }
}

window.harness = { loadMap, setView, render, waitLoaded, entities, ambientAt, propsNear, ready: true };
