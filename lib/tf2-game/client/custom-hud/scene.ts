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
  embeddedFilesOf,
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
  /**
   * The touch controls' buttons (scene coordinates), or none. A panel file that would draw under one
   * rides up just above it — the custom-HUD counterpart of the default HUD's touch layout
   * (`touchOverrides`), so the ammo of a HUD made for a mouse is not under the fire button.
   */
  reserve?: readonly Rect[] | null;
}

export interface SceneSource {
  readText(path: string): string | undefined;
  scheme: Scheme;
  env: CondEnv;
  minmode: boolean;
  strings: ReadonlyMap<string, string>;
}

/** One file as the scene builder made it, before any move. */
interface Raw {
  key: string;
  nodes: PanelNode[];
  images: string[];
  bounds: Rect | null;
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

/** Gap kept between a moved panel and the touch controls above which it rides. */
const RESERVE_GAP = 6;

/** Copies of `nodes` moved down by `dy` (rects are shared between a node and its ops, so everything is copied). */
function translateNodes(nodes: readonly PanelNode[], dy: number): PanelNode[] {
  return nodes.map((n) => ({
    ...n,
    rect: shift(n.rect, dy),
    clip: n.clip ? shift(n.clip, dy) : undefined,
    ops: n.ops.map((o) => ({ ...o, rect: shift(o.rect, dy) })),
  }));
}

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w - 2 && a.x + a.w > b.x + 2 && a.y < b.y + b.h - 2 && a.y + a.h > b.y + 2;

/**
 * How far up (≤ 0) a file drawn at `bounds` moves to clear the touch buttons in `reserve`: 0 when it
 * overlaps none, or when it is too tall to move (a file spanning half the screen is a container, not a
 * panel); otherwise just above the buttons it would sit on (and above any it then meets), never above
 * the top of the screen.
 */
export function clearOfReserve(bounds: Rect | null, reserve: readonly Rect[] | null | undefined, screen: Screen): number {
  if (!bounds || !reserve?.length || bounds.h > screen.h / 2) return 0;
  let dy = 0;
  for (let i = 0; i < 8; i++) {
    const at = shift(bounds, dy);
    const hits = reserve.filter((r) => overlaps(at, r));
    if (!hits.length) break;
    dy = Math.min(...hits.map((r) => r.y)) - RESERVE_GAP - (bounds.y + bounds.h);
  }
  return Math.min(0, Math.max(dy, -bounds.y));
}

export class InGameScene {
  private raw = new Map<string, Raw>();
  private cache = new Map<string, Built>();
  private lastFiles: readonly string[] = [];
  private layoutNames = new Map<string, string[]>();

  constructor(private source: SceneSource) {}

  /** A different HUD (or scheme, language, platform): everything is rebuilt next time. */
  setSource(source: SceneSource): void {
    this.source = source;
    this.raw.clear();
    this.cache.clear();
    this.layoutNames.clear();
    this.lastFiles = [];
  }

  /** Forget cached files (all of them, e.g. after the screen size changed). */
  invalidate(): void {
    this.raw.clear();
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
    const read = (f: string, i: FileInfo) => {
      for (const v of i.vars) parts.push(input.vars.get(v));
      for (const n of i.names) parts.push(b.gate(f, n), b.progressFor(f, n));
      for (const p of i.keyPaths) {
        const o = b.overridesFor(f, p);
        if (o) parts.push(JSON.stringify(o));
      }
    };
    read(file, info);
    // Panel files the file's panels load into themselves at run time (the freeze cam's killer health).
    for (const sub of embeddedFilesOf(text, this.source.env)) {
      const subText = this.source.readText(sub);
      if (subText === undefined) continue;
      parts.push(sub, subText.length);
      read(sub, fileInfo(subText, this.source.env));
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
      const rawKey = this.keyFor(file, text, input);
      let raw = this.raw.get(file);
      if (!raw || raw.key !== rawKey) {
        const scene = buildScene(ctx, [file]);
        raw = { key: rawKey, nodes: scene.nodes, images: scene.images, bounds: boundsOf(scene.nodes) };
        this.raw.set(file, raw);
      }
      // The Engineer's building panels stack top to bottom, as the game's status container lays them out.
      const stacked = isStacked(file);
      const stackDy = stacked ? stackY : 0;
      // Then clear of the touch controls, if any.
      const dy =
        stackDy + clearOfReserve(raw.bounds && shift(raw.bounds, stackDy), input.reserve, input.screen);
      const key = `${rawKey}\u0001${dy}`;
      let built = this.cache.get(file);
      if (!built || built.key !== key) {
        const nodes = dy ? translateNodes(raw.nodes, dy) : raw.nodes;
        const first = nodes[0];
        const next: Built = {
          key,
          z: first?.isFrame ? first.z : 0,
          nodes,
          images: raw.images,
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
