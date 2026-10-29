/**
 * A custom HUD's in-game scene, built by the HUD editor's own scene builder
 * (lib/tf2-hud/scene/build.ts) — so panel positions, sizes, visibility,
 * colours, fonts, images and labels resolve exactly as the editor previews
 * them — but incrementally.
 *
 * Building the whole HUD costs ~10 ms (measured: 15 files, 204 panels, in
 * Node and Chromium), far too much to repeat at the HUD's 20–30 Hz. Each panel
 * file is therefore built on its own (the builder is per-file anyway: a file
 * is one frame and its children) and cached under a key made of exactly the
 * inputs that file reads: the `%variables%` its text names, the game's
 * decisions for its panels (visible / fill / injected text), the running
 * animation values on its panels, the player's class and team, the screen.
 * A health change rebuilds `hudplayerhealth.res` and nothing else. The merged
 * scene is ordered exactly like `buildScene` orders it (frame `zpos`, then
 * file order), which the fidelity test checks.
 */

import type { KvNode } from '@/lib/tf2-hud/kv/types';
import { activeEntries } from '@/lib/tf2-hud/kv/props';
import {
  buildScene,
  HUD_LAYOUT_FILE,
  layoutFileFor,
  parseCached,
  type SceneContext,
} from '@/lib/tf2-hud/scene/build';
import type { PanelNode, Scene } from '@/lib/tf2-hud/scene/types';
import type { Rect, Screen } from '@/lib/tf2-hud/layout/geometry';
import type { CondEnv } from '@/lib/tf2-hud/scheme/cond';
import type { Scheme } from '@/lib/tf2-hud/scheme/scheme';
import type { AnimSnapshot, StyleFor } from '@/lib/tf2-hud/anim/style';
import type { TestState } from '@/lib/tf2-hud/fixtures';
import type { Bindings } from './bindings';

/** What a panel file reads, worked out once per file text. */
interface FileInfo {
  /** Lower-case names of every block (panels and conditionals) at any depth. */
  names: string[];
  /** Key paths of every block, as the scene builder reports them (`[root, …names]`). */
  keyPaths: string[][];
  /** Lower-case `%variable%` names in the text. */
  vars: string[];
  /** The file's top block key. */
  root: string;
}

const infoCache = new Map<string, FileInfo>();

function fileInfo(text: string, env: CondEnv): FileInfo {
  const hit = infoCache.get(text);
  if (hit) return hit;
  const doc = parseCached(text);
  const top = doc.roots.find((n) => n.children) ?? doc.roots[0];
  const names = new Set<string>();
  const keyPaths: string[][] = [];
  const walk = (entries: readonly KvNode[], path: string[]) => {
    for (const e of entries) {
      if (!e.children) continue;
      const p = [...path, e.key.text];
      names.add(e.key.text.toLowerCase());
      keyPaths.push(p);
      walk(activeEntries(e, env), p);
    }
  };
  if (top?.children) walk(activeEntries(top, env), [top.key.text]);
  const vars = new Set<string>();
  for (const m of text.matchAll(/%([A-Za-z0-9_]+)%/g)) vars.add(m[1].toLowerCase());
  const info: FileInfo = {
    names: [...names],
    keyPaths,
    vars: [...vars],
    root: top?.key.text ?? '',
  };
  infoCache.set(text, info);
  if (infoCache.size > 128) infoCache.delete(infoCache.keys().next().value as string);
  return info;
}

/** The inputs of one frame of the in-game HUD. */
export interface FrameInput {
  files: readonly string[];
  test: TestState;
  vars: ReadonlyMap<string, string>;
  bindings: Bindings;
  screen: Screen;
  styleFor?: StyleFor;
  anim?: AnimSnapshot;
}

export interface SceneSource {
  readText(path: string): string | undefined;
  scheme: Scheme;
  env: CondEnv;
  minmode: boolean;
  strings: ReadonlyMap<string, string>;
}

interface Built {
  key: string;
  z: number;
  nodes: PanelNode[];
  images: string[];
  /** Bounds of everything the file draws (shown panels with draw ops). */
  bounds: Rect | null;
}

export interface SceneResult {
  scene: Scene;
  /** Screen areas that changed since the last result (empty: nothing to repaint). */
  dirty: Rect[];
  /** Files rebuilt for this result. */
  rebuilt: number;
}

const EMPTY: ReadonlySet<string> = new Set();

const union = (a: Rect | null, b: Rect | null): Rect | null => {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

function boundsOf(nodes: readonly PanelNode[]): Rect | null {
  let r: Rect | null = null;
  for (const n of nodes) if (n.shown && n.ops.length) r = union(r, n.rect);
  return r;
}

/** The `hudlayout.res` block names that position a file (their animations move the file's frame). */
function layoutNamesFor(source: SceneSource, file: string): string[] {
  const text = source.readText(HUD_LAYOUT_FILE);
  if (text === undefined) return [];
  const root = parseCached(text).roots.find((n) => n.children);
  if (!root) return [];
  const base = file
    .slice(file.lastIndexOf('/') + 1)
    .replace(/\.res$/i, '')
    .toLowerCase();
  const out: string[] = [];
  for (const b of activeEntries(root, source.env)) {
    if (b.children && layoutFileFor(b.key.text) === base) out.push(b.key.text.toLowerCase());
  }
  return out;
}

/** `CHudBuildingStatusContainer`: the building panels, one under the other (sentry, dispenser, entrance, exit). */
export const isStacked = (file: string): boolean =>
  /\/hud_obj_(?:sentrygun|dispenser|tele_entrance|tele_exit)\.res$/i.test(file);

const shift = (r: Rect, dy: number): Rect => ({ x: r.x, y: r.y + dy, w: r.w, h: r.h });

/** Copies of `nodes` moved down by `dy` (rects are shared between a node and its ops, so everything is copied). */
function translateNodes(nodes: readonly PanelNode[], dy: number): PanelNode[] {
  return nodes.map((n) => ({
    ...n,
    rect: shift(n.rect, dy),
    clip: n.clip ? shift(n.clip, dy) : undefined,
    ops: n.ops.map((o) => ({ ...o, rect: shift(o.rect, dy) })),
  }));
}

export class InGameScene {
  private cache = new Map<string, Built>();
  private lastFiles: readonly string[] = [];
  private layoutNames = new Map<string, string[]>();

  constructor(private source: SceneSource) {}

  /** A different HUD (or scheme, language, platform): everything is rebuilt next time. */
  setSource(source: SceneSource): void {
    this.source = source;
    this.cache.clear();
    this.layoutNames.clear();
    this.lastFiles = [];
  }

  /** Forget cached files (all of them, e.g. after the screen size changed). */
  invalidate(): void {
    this.cache.clear();
  }

  private contextFor(input: FrameInput): SceneContext {
    const s = this.source;
    return {
      readText: (p) => s.readText(p),
      scheme: s.scheme,
      env: s.env,
      screen: input.screen,
      minmode: s.minmode,
      showHidden: false,
      forceShown: EMPTY,
      forceHidden: EMPTY,
      vars: input.vars,
      strings: s.strings,
      progress: input.test.progress / 100,
      gate: input.bindings.gate,
      progressFor: input.bindings.progressFor,
      player: { playerClass: input.test.playerClass, team: input.test.team },
      styleFor: input.styleFor,
      overridesFor: input.bindings.overridesFor,
    };
  }

  /** The cache key of one file: every input the scene builder reads for it. */
  private keyFor(file: string, text: string, input: FrameInput): string {
    const info = fileInfo(text, this.source.env);
    const b = input.bindings;
    const parts: (string | number | undefined | boolean)[] = [
      input.screen.w,
      input.screen.h,
      input.test.playerClass,
      input.test.team,
      input.test.progress,
      text.length,
    ];
    for (const v of info.vars) parts.push(input.vars.get(v));
    for (const n of info.names) parts.push(b.gate(file, n), b.progressFor(file, n));
    for (const p of info.keyPaths) {
      const o = b.overridesFor(file, p);
      if (o) parts.push(JSON.stringify(o));
    }
    const anim = input.anim;
    if (anim && anim.size) {
      let names = this.layoutNames.get(file);
      if (!names) this.layoutNames.set(file, (names = layoutNamesFor(this.source, file)));
      for (const n of [...info.names, ...names]) {
        const v = anim.get(n);
        if (v) parts.push(n, JSON.stringify(v));
      }
    }
    return parts.join('\u0001');
  }

  build(input: FrameInput): SceneResult {
    const ctx = this.contextFor(input);
    const dirty: Rect[] = [];
    const mark = (r: Rect | null) => {
      if (r && r.w > 0 && r.h > 0) dirty.push(r);
    };
    let rebuilt = 0;
    const kept = new Set(input.files);
    for (const f of this.lastFiles) {
      if (!kept.has(f)) mark(this.cache.get(f)?.bounds ?? null);
    }
    const groups: { z: number; order: number; nodes: PanelNode[] }[] = [];
    const images = new Set<string>();
    const shownBefore = new Set(this.lastFiles);
    let stackY = 0;
    input.files.forEach((file, order) => {
      const text = this.source.readText(file);
      if (text === undefined) return;
      // The Engineer's building panels stack top to bottom, as the game's status container lays them out.
      const stacked = isStacked(file);
      const dy = stacked ? stackY : 0;
      const key = `${this.keyFor(file, text, input)}\u0001${dy}`;
      let built = this.cache.get(file);
      if (!built || built.key !== key) {
        const scene = buildScene(ctx, [file]);
        const nodes = dy ? translateNodes(scene.nodes, dy) : scene.nodes;
        const first = nodes[0];
        const next: Built = {
          key,
          z: first?.isFrame ? first.z : 0,
          nodes,
          images: scene.images,
          bounds: boundsOf(nodes),
        };
        mark(built?.bounds ?? null);
        mark(next.bounds);
        built = next;
        this.cache.set(file, built);
        rebuilt++;
      } else if (!shownBefore.has(file)) {
        mark(built.bounds);
      }
      if (stacked && built.nodes[0]?.isFrame) stackY += built.nodes[0].rect.h;
      groups.push({ z: built.z, order, nodes: built.nodes });
      for (const i of built.images) images.add(i);
    });
    this.lastFiles = [...input.files];
    groups.sort((a, b) => a.z - b.z || a.order - b.order);
    return {
      scene: { screen: input.screen, nodes: groups.flatMap((g) => g.nodes), images: [...images] },
      dirty,
      rebuilt,
    };
  }
}
