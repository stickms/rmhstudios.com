/**
 * Draws a custom HUD over the game with the HUD editor's own painter
 * (lib/tf2-hud/scene/paint.ts), fed by the live game.
 *
 *   const prepared = await prepareHud(loaded);        // files, fonts, textures, animations — all async
 *   const r = new CustomHudRenderer(canvas);
 *   r.setHud(prepared);                               // swaps only once everything is ready
 *   r.resize(cssW, cssH);                              // on resize only (never per frame)
 *   store.subscribe(() => r.update(store.getSnapshot()));   // the HUD store's ≤30 Hz publishes
 *
 * Per update it adapts the state (adapter.ts), starts the HUD animation events
 * the change implies (events.ts) and advances them, rebuilds only the panel
 * files whose inputs changed (scene.ts), and repaints only the screen areas
 * those files cover. No timers and no frame loop of its own: it runs inside
 * the store's publish, which the game's one frame loop drives.
 */

import { ensureBundledFonts } from '@/lib/tf2-hud/assets/fonts';
import { syncCustomFonts } from '@/lib/tf2-hud/assets/font-sync';
import { ImageStore } from '@/lib/tf2-hud/assets/images';
import { animEnvFor, panelProps } from '@/lib/tf2-hud/anim/base';
import { AnimController } from '@/lib/tf2-hud/anim/controller';
import {
  manifestFiles,
  mergeScripts,
  parseAnimScript,
  type AnimScript,
} from '@/lib/tf2-hud/anim/parse';
import {
  animStyle,
  EMPTY_SNAPSHOT,
  snapshotOf,
  type AnimSnapshot,
  type StyleFor,
} from '@/lib/tf2-hud/anim/style';
import { DEFAULT_TEST_STATE, type TestState } from '@/lib/tf2-hud/fixtures';
import type { Rect, Screen } from '@/lib/tf2-hud/layout/geometry';
import { buildTokens, languageFilePath } from '@/lib/tf2-hud/localisation';
import { baseCache } from '@/lib/tf2-hud/project/base-cache';
import { buildScene, HUD_LAYOUT_FILE } from '@/lib/tf2-hud/scene/build';
import { paintScene } from '@/lib/tf2-hud/scene/paint';
import type { Scene } from '@/lib/tf2-hud/scene/types';
import { PC_ENV } from '@/lib/tf2-hud/scheme/cond';
import { EMPTY_SCHEME, parseScheme, type Scheme } from '@/lib/tf2-hud/scheme/scheme';
import { gameSurfaceDpr } from '@/lib/display-scale';
import type { HudState } from '../hud-state';
import { liveVars, toTestState } from './adapter';
import { ALL_INGAME_FILES, bindingsFor, inGameFiles } from './bindings';
import { hudAnimEvents } from './events';
import { InGameScene, type SceneSource } from './scene';
import { HudFiles, type LoadedHud } from './source';

const SCHEME_FILE = 'resource/clientscheme.res';
const CORE_FILES = [SCHEME_FILE, 'resource/sourcescheme.res', HUD_LAYOUT_FILE] as const;
const ANIM_MANIFEST = 'scripts/hudanimations_manifest.txt';
/** Longest a HUD switch waits for textures before swapping anyway (missing ones draw the checkerboard). */
const PRELOAD_TIMEOUT_MS = 6000;

/** A HUD with everything it draws already loaded. */
export interface PreparedHud {
  hud: LoadedHud;
  files: HudFiles;
  source: SceneSource;
  script: AnimScript | null;
  images: ImageStore;
  /** Called when a texture arrives after the swap (the renderer repaints). */
  onImage: (() => void) | null;
  /** The HUD customises the Engineer's building panels (see `InGameOptions.buildings`). */
  drawsBuildings: boolean;
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | undefined> =>
  Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);

/** A sample state per team, to find the textures a HUD can draw before it is shown. */
function sampleTests(): TestState[] {
  return [
    { ...DEFAULT_TEST_STATE, team: 'red' },
    { ...DEFAULT_TEST_STATE, team: 'blue' },
  ];
}

/** Load everything a HUD draws in game: its panel files, scheme, fonts, animations and textures. */
export async function prepareHud(hud: LoadedHud): Promise<PreparedHud> {
  const files = new HudFiles(hud.overlay);
  await baseCache.loadIndex();
  await files.ensure([
    ...CORE_FILES,
    ...ALL_INGAME_FILES,
    ANIM_MANIFEST,
    languageFilePath('english'),
  ]);
  const scripts = manifestFiles(files.readText(ANIM_MANIFEST));
  await files.ensure(scripts);

  const schemeText = files.readText(SCHEME_FILE);
  const scheme: Scheme = schemeText === undefined ? EMPTY_SCHEME : parseScheme(schemeText, PC_ENV);
  const source: SceneSource = {
    readText: files.readText,
    scheme,
    env: PC_ENV,
    minmode: false,
    strings: buildTokens('english', files.readBytes),
  };
  const parsed = scripts.map((f) => files.readText(f)).filter((t): t is string => t !== undefined);
  const script = parsed.length ? mergeScripts(parsed.map(parseAnimScript)) : null;

  const prepared: PreparedHud = {
    hud,
    files,
    source,
    script,
    images: null as unknown as ImageStore,
    onImage: null,
    drawsBuildings: [...hud.overlay.keys()].some((p) => /\/hud_obj_[^/]*\.res$/i.test(p)),
  };
  const images = new ImageStore(
    files.readBytes,
    () => prepared.onImage?.(),
    (paths) => baseCache.ensure(paths),
  );
  images.setLookup(files.readBytes);
  prepared.images = images;

  // Fonts first (the textures' decode does not need them), then every texture the HUD's in-game files name.
  await ensureBundledFonts();
  await syncCustomFonts(files.fontFiles(), scheme).catch(() => false);
  const paths = new Set<string>();
  for (const test of sampleTests()) {
    const scene = buildScene(
      {
        readText: files.readText,
        scheme,
        env: PC_ENV,
        screen: { w: 1920, h: 1080 },
        minmode: false,
        showHidden: true,
        forceShown: new Set(),
        forceHidden: new Set(),
        vars: new Map(),
        strings: source.strings,
        progress: 1,
        player: { playerClass: test.playerClass, team: test.team },
      },
      ALL_INGAME_FILES,
    );
    for (const p of scene.images) paths.add(p);
  }
  await withTimeout(images.preload([...paths]), PRELOAD_TIMEOUT_MS);
  return prepared;
}

export interface RendererStats {
  updates: number;
  /** Updates that rebuilt at least one file / repainted something. */
  rebuilds: number;
  repaints: number;
  /** Files rebuilt in total. */
  filesRebuilt: number;
  /** Exponential moving averages and worst cases, ms. */
  buildMs: number;
  paintMs: number;
  worstBuildMs: number;
  worstPaintMs: number;
}

const ema = (prev: number, next: number) => (prev === 0 ? next : prev * 0.9 + next * 0.1);

const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Merge overlapping rectangles (few: one or two per changed file). */
function mergeRects(rects: Rect[]): Rect[] {
  const out: Rect[] = [];
  for (const r of rects) {
    let cur = { ...r };
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < out.length; i++) {
        if (intersects(out[i], cur)) {
          const o = out.splice(i, 1)[0];
          const x = Math.min(o.x, cur.x);
          const y = Math.min(o.y, cur.y);
          cur = {
            x,
            y,
            w: Math.max(o.x + o.w, cur.x + cur.w) - x,
            h: Math.max(o.y + o.h, cur.y + cur.h) - y,
          };
          merged = true;
          break;
        }
      }
    }
    out.push(cur);
  }
  return out;
}

export class CustomHudRenderer {
  private prepared: PreparedHud | null = null;
  private scene: InGameScene | null = null;
  private current: Scene | null = null;
  private screen: Screen = { w: 0, h: 0 };
  private dpr = 1;
  private lastState: HudState | null = null;
  private prev: { state: HudState; test: TestState } | null = null;
  private anim: AnimController | null = null;
  private snapshot: AnimSnapshot = EMPTY_SNAPSHOT;
  private styleFor: StyleFor | undefined;
  private fullPaint = true;
  readonly stats: RendererStats = {
    updates: 0,
    rebuilds: 0,
    repaints: 0,
    filesRebuilt: 0,
    buildMs: 0,
    paintMs: 0,
    worstBuildMs: 0,
    worstPaintMs: 0,
  };

  constructor(private readonly canvas: HTMLCanvasElement) {}

  get hud(): PreparedHud | null {
    return this.prepared;
  }

  private fallbackTokens: ReadonlyMap<string, string> = new Map();

  /**
   * English (or the player's language) for the `#tokens` the in-game panels use, where the HUD and the
   * base have no `tf_<language>.txt` to say them (the base does not ship Valve's language files).
   */
  setFallbackTokens(tokens: ReadonlyMap<string, string>): void {
    this.fallbackTokens = tokens;
    if (this.prepared && this.scene) {
      this.scene.setSource(this.sourceOf(this.prepared));
      this.fullPaint = true;
      if (this.lastState) this.update(this.lastState, true);
    }
  }

  private sourceOf(prepared: PreparedHud): SceneSource {
    if (this.fallbackTokens.size === 0) return prepared.source;
    const strings = new Map(this.fallbackTokens);
    for (const [k, v] of prepared.source.strings) strings.set(k, v);
    return { ...prepared.source, strings };
  }

  setHud(prepared: PreparedHud | null): void {
    if (this.prepared && this.prepared !== prepared) this.prepared.onImage = null;
    this.prepared = prepared;
    this.scene = prepared ? new InGameScene(this.sourceOf(prepared)) : null;
    this.prev = null;
    this.snapshot = EMPTY_SNAPSHOT;
    this.styleFor = undefined;
    this.anim = null;
    if (prepared?.script) {
      const env = animEnvFor(
        panelProps(ALL_INGAME_FILES, prepared.files.readText, PC_ENV, false),
        prepared.source.scheme,
      );
      this.anim = new AnimController(prepared.script, env);
    }
    if (prepared) prepared.onImage = () => this.repaintAll();
    this.fullPaint = true;
    if (this.lastState) this.update(this.lastState, true);
    else this.clear();
  }

  /** The game area changed size (CSS pixels). Reallocates the canvas only on a real change. */
  resize(cssW: number, cssH: number): void {
    const w = Math.max(1, Math.round(cssW));
    const h = Math.max(1, Math.round(cssH));
    const dpr = typeof window === 'undefined' ? 1 : gameSurfaceDpr(window);
    if (w === this.screen.w && h === this.screen.h && dpr === this.dpr) return;
    this.screen = { w, h };
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.scene?.invalidate();
    this.fullPaint = true;
    if (this.lastState) this.update(this.lastState, true);
  }

  /** Repaint everything (a texture or font arrived). */
  repaintAll(): void {
    this.fullPaint = true;
    if (this.current) this.paint(this.current, null);
  }

  /** A new HUD snapshot from the store. Cheap when nothing the HUD shows changed. */
  update(state: HudState, force = false): void {
    this.lastState = state;
    const prepared = this.prepared;
    const scene = this.scene;
    if (!prepared || !scene || this.screen.w <= 1) return;
    const t0 = performance.now();
    this.stats.updates++;

    const test = toTestState(state);
    const now = t0 / 1000;
    const anim = this.anim;
    if (anim) {
      const next = { state, test };
      for (const name of hudAnimEvents(this.prev, next)) anim.fire(name, now);
      this.prev = next;
      if (anim.advance(now)) {
        this.snapshot = snapshotOf(anim);
        this.styleFor = animStyle(this.snapshot);
      }
    } else {
      this.prev = { state, test };
    }

    const result = scene.build({
      files: inGameFiles(state, test, { buildings: prepared.drawsBuildings }),
      test,
      vars: liveVars(state, test),
      bindings: bindingsFor(state, test),
      screen: this.screen,
      styleFor: this.styleFor,
      anim: this.snapshot,
    });
    const t1 = performance.now();
    if (result.rebuilt > 0) {
      this.stats.rebuilds++;
      this.stats.filesRebuilt += result.rebuilt;
      this.stats.buildMs = ema(this.stats.buildMs, t1 - t0);
      this.stats.worstBuildMs = Math.max(this.stats.worstBuildMs, t1 - t0);
    }
    this.current = result.scene;
    if (this.fullPaint || force) this.paint(result.scene, null);
    else if (result.dirty.length) this.paint(result.scene, result.dirty);
  }

  private clear(): void {
    const g = this.canvas.getContext('2d');
    g?.setTransform(1, 0, 0, 1, 0, 0);
    g?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Paint `scene`, everywhere (`dirty` null) or only inside the changed areas. */
  private paint(scene: Scene, dirty: Rect[] | null): void {
    const prepared = this.prepared;
    const g = this.canvas.getContext('2d');
    if (!g || !prepared) return;
    const t0 = performance.now();
    const k = this.dpr;
    // Run-time content (3D models, avatars, lists) has no stand-in box in game: the editor's dashed placeholders stay out.
    const opts = { images: prepared.images, skipDynamic: () => true, hideMissing: true };
    if (!dirty) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, this.canvas.width, this.canvas.height);
      g.setTransform(k, 0, 0, k, 0, 0);
      paintScene(g, scene, opts);
      this.fullPaint = false;
    } else {
      for (const r of mergeRects(dirty)) {
        // Whole device pixels, one pixel of margin for anti-aliased edges.
        const x0 = Math.max(0, Math.floor(r.x - 1));
        const y0 = Math.max(0, Math.floor(r.y - 1));
        const area: Rect = {
          x: x0,
          y: y0,
          w: Math.ceil(r.x + r.w + 1) - x0,
          h: Math.ceil(r.y + r.h + 1) - y0,
        };
        g.save();
        g.setTransform(k, 0, 0, k, 0, 0);
        g.beginPath();
        g.rect(area.x, area.y, area.w, area.h);
        g.clip();
        g.clearRect(area.x, area.y, area.w, area.h);
        paintScene(
          g,
          { ...scene, nodes: scene.nodes.filter((n) => n.shown && intersects(n.rect, area)) },
          opts,
        );
        g.restore();
      }
    }
    const ms = performance.now() - t0;
    this.stats.repaints++;
    this.stats.paintMs = ema(this.stats.paintMs, ms);
    this.stats.worstPaintMs = Math.max(this.stats.worstPaintMs, ms);
  }

  dispose(): void {
    if (this.prepared) this.prepared.onImage = null;
    this.prepared = null;
    this.scene = null;
    this.current = null;
  }
}
