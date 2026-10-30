/**
 * What every game client (TF2, Half-Life 2, Portal) shares: the contract the
 * play page mounts (`GameClient`), loading progress by stage, error states,
 * and the runtime pieces — the WebGL renderer sized by the quality plan and the
 * frame-time governor, the input devices, the audio engine, the asset loaders.
 *
 *   const client = createTf2Client({ canvas, container, … });   // or createSpClient
 *   client.start();          // loads, then runs its one GameLoop
 *   …
 *   client.dispose();        // stops the loop, frees GPU memory, detaches input
 *
 * Browser only (three.js, WebGL, the DOM).
 */

import { SRGBColorSpace, WebGLRenderer } from 'three';
import { emptyTrace } from '../core/types';
import { MASK_SOLID } from '../core/constants';
import type { Vec3 } from '../core/vec';
import { gameAssetUrl } from '../assets/urls';
import type { GameId } from '../assets/versions';
import { mapIndexSchema, mapManifestSchema, parseHullsBin, type MapManifest } from '../assets/map-manifest';
import { parseBsp, type BspFile } from '../formats/bsp';
import { loadParsedMap, type LoadedMap } from '../sim/map-loader';
import { hullResolver } from '../server/tf2-match-host';
import { SourceCamera } from '../render/camera';
import { createTextureCache } from '../render/map-package';
import type { TextureCache } from '../render/texture-cache';
import { AudioEngine } from '../audio/engine';
import type { HudGame } from './hud-state';
import type { HudStore } from './hud-store';
import type { GameSettings } from './settings';
import {
  createInputState,
  GamepadInput,
  KeyboardMouseInput,
  type InputState,
} from './input';
import { detectDevice, FrameGovernor, pixelRatioFor, planQuality, type DeviceInfo, type QualityPlan } from './quality';

// ─── Contract ───────────────────────────────────────────────────────────────

export type LoadStage = 'connect' | 'map' | 'textures' | 'models' | 'sounds' | 'world';
export const LOAD_STAGES: readonly LoadStage[] = ['connect', 'map', 'textures', 'models', 'sounds', 'world'];

export interface StageProgress {
  state: 'pending' | 'active' | 'done' | 'skipped';
  done: number;
  total: number;
}

export interface LoadProgress {
  stages: Record<LoadStage, StageProgress>;
  /** The map's display title once known. */
  title: string;
  /** 0…1 over every stage that is not skipped. */
  fraction: number;
}

export type ClientPhase = 'loading' | 'running' | 'error' | 'ended';

export type ClientErrorCode =
  | 'webgl'
  | 'map-missing'
  | 'map-failed'
  | 'network'
  | 'kicked'
  | 'room'
  /** Peer-to-peer: the host left, so the match ended (there is no host migration). */
  | 'host-left'
  /** Multiplayer needs a signed-in account. */
  | 'auth-required'
  /** Peer-to-peer: no path to the host, direct or through the hub's relay. */
  | 'p2p-connect'
  | 'context-lost'
  | 'unknown';

export interface ClientError {
  code: ClientErrorCode;
  /** Diagnostic detail (English, for the console / a details line). */
  detail: string;
  retryable: boolean;
}

export interface ClientStats {
  fps: number;
  frameMs: number;
  resolutionScale: number;
  tier: QualityPlan['tier'];
  drawCalls: number;
  triangles: number;
  entities: number;
  /** Round trip to the server (online TF2), ms. */
  pingMs: number | null;
  /** Smoothed ms per frame phase (sim, entities, render, hud). */
  phases?: Record<string, number>;
}

export interface GameClientCallbacks {
  onProgress?(p: LoadProgress): void;
  onPhase?(phase: ClientPhase): void;
  onError?(e: ClientError): void;
  onLockChange?(locked: boolean): void;
  /** Online: connection state for the reconnect banner. */
  onConnection?(status: 'connected' | 'connecting' | 'reconnecting' | 'disconnected'): void;
  /** Online: the room's code once joined (the play page offers its invite link). */
  onRoom?(code: string): void;
  /** The client wants to leave (pause menu → disconnect, kicked). */
  onExit?(): void;
}

export interface GameClient {
  readonly game: HudGame;
  readonly store: HudStore;
  readonly input: InputState;
  start(): Promise<void>;
  dispose(): void;
  /** Pointer lock (desktop); resolves to whether the pointer is locked. */
  lockPointer(): Promise<boolean>;
  unlockPointer(): void;
  /** Settings changed (FOV, volumes, binds…). */
  setSettings(s: GameSettings): void;
  stats(): ClientStats;
}

export interface ClientMount {
  canvas: HTMLCanvasElement;
  /** The element that receives mouse input (the canvas). */
  inputTarget: HTMLElement;
  store: HudStore;
  /** The input state the devices (and the HUD's touch overlay) write; the page creates it so the HUD can mount first. */
  input: InputState;
  settings: GameSettings;
  callbacks: GameClientCallbacks;
}

// ─── Progress ───────────────────────────────────────────────────────────────

export class ProgressTracker {
  private readonly p: LoadProgress;
  constructor(
    private readonly emit: (p: LoadProgress) => void,
    skipped: readonly LoadStage[] = [],
  ) {
    const stages = {} as Record<LoadStage, StageProgress>;
    for (const s of LOAD_STAGES) stages[s] = { state: skipped.includes(s) ? 'skipped' : 'pending', done: 0, total: 1 };
    this.p = { stages, title: '', fraction: 0 };
  }

  set title(t: string) {
    this.p.title = t;
    this.push();
  }

  begin(stage: LoadStage, total = 1): void {
    const s = this.p.stages[stage];
    s.state = 'active';
    s.total = Math.max(1, total);
    s.done = 0;
    this.push();
  }

  step(stage: LoadStage, done: number, total?: number): void {
    const s = this.p.stages[stage];
    if (total !== undefined) s.total = Math.max(1, total);
    s.done = Math.min(s.total, done);
    if (s.state === 'pending') s.state = 'active';
    this.push();
  }

  finish(stage: LoadStage): void {
    const s = this.p.stages[stage];
    s.state = 'done';
    s.done = s.total;
    this.push();
  }

  get progress(): LoadProgress {
    return this.p;
  }

  private push(): void {
    let sum = 0;
    let n = 0;
    for (const s of LOAD_STAGES) {
      const st = this.p.stages[s];
      if (st.state === 'skipped') continue;
      n++;
      sum += st.state === 'done' ? 1 : st.total ? st.done / st.total : 0;
    }
    this.p.fraction = n ? sum / n : 1;
    this.emit({ ...this.p, stages: { ...this.p.stages } });
  }
}

// ─── Rendering ──────────────────────────────────────────────────────────────

export class RenderCore {
  readonly renderer: WebGLRenderer;
  readonly cam = new SourceCamera();
  readonly device: DeviceInfo;
  readonly plan: QualityPlan;
  readonly governor: FrameGovernor;
  private ro: ResizeObserver | null = null;
  private cssW = 1;
  private cssH = 1;
  private lost = false;
  /** Frame timing (EMA, ms) for the stats line. */
  frameMs = 16.7;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    settings: Pick<GameSettings, 'quality' | 'video'>,
    private readonly onContextLost: () => void,
  ) {
    const { quality, video } = settings;
    const probe = detectDevice(null);
    const early = planQuality(probe, quality, video);
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        canvas,
        antialias: early.antialias,
        powerPreference: 'high-performance',
        stencil: true,
      });
    } catch (e) {
      throw new ClientFailure({ code: 'webgl', detail: e instanceof Error ? e.message : String(e), retryable: false });
    }
    this.renderer = renderer;
    renderer.outputColorSpace = SRGBColorSpace;
    this.device = detectDevice(renderer.getContext());
    if (!this.device.webgl2) {
      renderer.dispose();
      throw new ClientFailure({ code: 'webgl', detail: 'WebGL 2 is not available', retryable: false });
    }
    this.plan = planQuality(this.device, quality, video);
    this.governor = new FrameGovernor(this.plan);
    canvas.addEventListener('webglcontextlost', this.onLost, false);
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas);
    }
  }

  private onLost = (e: Event): void => {
    e.preventDefault();
    if (this.lost) return;
    this.lost = true;
    this.onContextLost();
  };

  get aspect(): number {
    return this.cssW / Math.max(1, this.cssH);
  }

  /** CSS size × the capped DPR × the governor's scale. Never per frame unless something changed. */
  resize(): void {
    const w = Math.max(1, Math.round(this.canvas.clientWidth || this.canvas.width));
    const h = Math.max(1, Math.round(this.canvas.clientHeight || this.canvas.height));
    this.cssW = w;
    this.cssH = h;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.renderer.setPixelRatio(pixelRatioFor(this.plan, dpr, this.governor.scale));
    this.renderer.setSize(w, h, false);
    this.cam.setAspect(w / h);
  }

  /** One frame's timing into the governor (resizes the buffer when the scale moves). */
  sample(rawMs: number): void {
    if (rawMs > 0 && rawMs < 250) this.frameMs += (rawMs - this.frameMs) * 0.05;
    if (this.governor.sample(rawMs)) this.resize();
  }

  textureCache(game: GameId): TextureCache {
    return createTextureCache(game, this.renderer, { maxTextureSize: this.plan.maxTextureSize, anisotropy: this.plan.anisotropy });
  }

  dispose(): void {
    this.ro?.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.onLost, false);
    this.renderer.dispose();
  }
}

// ─── Input ──────────────────────────────────────────────────────────────────

export class InputCore {
  readonly km: KeyboardMouseInput;
  readonly pad: GamepadInput;

  constructor(
    target: HTMLElement,
    game: HudGame,
    getSettings: () => GameSettings,
    onLockChange?: (locked: boolean) => void,
    readonly input: InputState = createInputState(),
  ) {
    this.km = new KeyboardMouseInput({ target, state: this.input, getSettings, onLockChange });
    this.pad = new GamepadInput(this.input, game, getSettings);
    this.km.attach();
  }

  poll(dt: number): void {
    this.pad.poll(dt);
  }

  dispose(): void {
    this.km.detach();
  }
}

// ─── Audio ──────────────────────────────────────────────────────────────────

/** The game's mixer with the player's volumes. */
export function createAudio(
  game: GameId,
  settings: GameSettings,
  entityPosition: (id: number) => Vec3 | null,
  occlusion?: (from: Vec3, to: Vec3) => boolean,
): AudioEngine {
  return new AudioEngine({
    game,
    entityPosition,
    occlusion,
    volumes: { master: settings.volume.master, sfx: settings.volume.sfx, voice: settings.volume.voice, music: settings.volume.music },
  });
}

export function applyVolumes(audio: AudioEngine, s: GameSettings): void {
  audio.setVolume('master', s.volume.master);
  audio.setVolume('sfx', s.volume.sfx);
  audio.setVolume('voice', s.volume.voice);
  audio.setVolume('music', s.volume.music);
}

// ─── Maps ───────────────────────────────────────────────────────────────────

export interface LoadedPackage {
  game: GameId;
  name: string;
  title: string;
  manifest: MapManifest;
  bsp: BspFile;
  /** The sim's view of the map (collision with prop hulls); null when the caller builds its own (single-player). */
  loaded: LoadedMap | null;
  hulls: ReturnType<typeof parseHullsBin> | null;
}

/** An error the clients throw with a code the play page can show. */
export class ClientFailure extends Error {
  constructor(readonly info: ClientError) {
    super(info.detail);
  }
}

async function fetchOk(url: string, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    throw new ClientFailure({ code: 'network', detail: `${url}: ${e instanceof Error ? e.message : String(e)}`, retryable: true });
  }
  if (res.status === 404) throw new ClientFailure({ code: 'map-missing', detail: `${url}: 404`, retryable: false });
  if (!res.ok) throw new ClientFailure({ code: 'network', detail: `${url}: HTTP ${res.status}`, retryable: true });
  return res;
}

/** Reads a body with byte progress (Content-Length when the server sends one). */
async function readWithProgress(res: Response, onBytes: (got: number, total: number) => void): Promise<Uint8Array> {
  const total = Number(res.headers.get('content-length') ?? 0);
  if (!res.body || typeof res.body.getReader !== 'function') return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.byteLength;
    onBytes(got, total);
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

/**
 * Loads a published map package (index → manifest → BSP + prop hulls), parses
 * the BSP once and builds the simulation's collision from the same parse.
 */
export async function loadMapPackageForClient(
  game: GameId,
  map: string,
  progress: ProgressTracker,
  signal?: AbortSignal,
  opts: { collision?: boolean } = {},
): Promise<LoadedPackage> {
  progress.begin('map', 4);
  const indexRes = await fetchOk(gameAssetUrl('maps/index.json', game), signal);
  const index = mapIndexSchema.safeParse(await indexRes.json());
  if (!index.success) throw new ClientFailure({ code: 'map-failed', detail: 'maps/index.json is malformed', retryable: false });
  const entry = index.data.maps[map];
  if (!entry) throw new ClientFailure({ code: 'map-missing', detail: `${game}/${map} is not published`, retryable: false });
  if (!progress.progress.title) progress.title = entry.title;
  progress.step('map', 1);
  const manRes = await fetchOk(gameAssetUrl(entry.manifest, game), signal);
  const parsed = mapManifestSchema.safeParse(await manRes.json());
  if (!parsed.success) throw new ClientFailure({ code: 'map-failed', detail: `manifest: ${parsed.error.message}`, retryable: false });
  const manifest = parsed.data;
  progress.step('map', 2);
  const [bspBytes, hullBytes] = await Promise.all([
    fetchOk(gameAssetUrl(manifest.bsp, game), signal).then((r) =>
      readWithProgress(r, (got, total) => {
        if (total > 0) progress.step('map', 2 + Math.min(0.95, got / total));
      }),
    ),
    manifest.hulls
      ? fetchOk(gameAssetUrl(manifest.hulls, game), signal).then(async (r) => new Uint8Array(await r.arrayBuffer()))
      : Promise.resolve(null),
  ]);
  progress.step('map', 3);
  let bsp: BspFile;
  try {
    bsp = parseBsp(bspBytes);
  } catch (e) {
    throw new ClientFailure({ code: 'map-failed', detail: `BSP: ${e instanceof Error ? e.message : String(e)}`, retryable: false });
  }
  const hulls = hullBytes ? parseHullsBin(hullBytes) : null;
  const loaded = opts.collision === false ? null : loadParsedMap(bsp, { name: map, propCollision: hullResolver(manifest, hulls) });
  progress.finish('map');
  return { game, name: map, title: entry.title, manifest, bsp, loaded, hulls };
}

// ─── Small shared helpers ───────────────────────────────────────────────────

/** A ±WALL_OFFSET hull trace through map collision for the camera (view.ts WallTrace). */
export function wallTrace(collision: LoadedMap['collision'], offset = 6) {
  const tr = emptyTrace();
  const mins = { x: -offset, y: -offset, z: -offset };
  const maxs = { x: offset, y: offset, z: offset };
  return (start: Vec3, end: Vec3, out: Vec3): { fraction: number } => {
    collision.traceHull(start, end, mins, maxs, MASK_SOLID, null, tr);
    out.x = tr.endPos.x;
    out.y = tr.endPos.y;
    out.z = tr.endPos.z;
    return { fraction: tr.allSolid ? 0 : tr.fraction };
  };
}

/** Frames per second from real frame durations (not the clamped simulation dt), and phase timings. */
export class FpsMeter {
  fps = 0;
  /** Smoothed milliseconds per phase of the frame (sim, render…). */
  readonly phases: Record<string, number> = {};
  private acc = 0;
  private frames = 0;
  sample(rawMs: number): void {
    if (!(rawMs > 0)) return;
    this.acc += rawMs;
    this.frames++;
    if (this.acc >= 500) {
      this.fps = (this.frames * 1000) / this.acc;
      this.acc = 0;
      this.frames = 0;
    }
  }
  /** Records how long a phase took this frame (EMA). */
  phase(name: string, ms: number): void {
    const prev = this.phases[name];
    this.phases[name] = prev === undefined ? ms : prev + (ms - prev) * 0.1;
  }
}

interface CullableMesh {
  visible: boolean;
  boundingSphere?: { center: { x: number; y: number; z: number }; radius: number } | null;
  computeBoundingSphere?: () => void;
}

/**
 * The quality plan's prop draw distance: hides static-prop meshes (instanced per
 * model and area) whose bounds are farther than `distance` Source units. Call
 * `restore()` before WorldRenderer.update (which owns the props' own fade
 * culling) and `cull()` after it. Reads three bounds only — no layout, no rects.
 */
export class PropDistanceCuller {
  private readonly hidden = new Set<CullableMesh>();

  restore(): void {
    for (const m of this.hidden) m.visible = true;
    this.hidden.clear();
  }

  cull(
    group: { children: ReadonlyArray<unknown> } | null | undefined,
    camera: { position: { x: number; y: number; z: number } },
    distanceUnits: number,
    unitMetres: number,
  ): void {
    if (!group || distanceUnits <= 0) return;
    const limit = distanceUnits * unitMetres;
    for (const c of group.children as ReadonlyArray<CullableMesh>) {
      if (!c.visible) continue;
      if (!c.boundingSphere && typeof c.computeBoundingSphere === 'function') c.computeBoundingSphere();
      const s = c.boundingSphere;
      if (!s) continue;
      const d = Math.hypot(s.center.x - camera.position.x, s.center.y - camera.position.y, s.center.z - camera.position.z) - s.radius;
      if (d > limit) {
        c.visible = false;
        this.hidden.add(c);
      }
    }
  }
}
