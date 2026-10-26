/**
 * Panel files → `Scene`.
 *
 * Each `.res` file loaded by a HUD element or dialog describes a *frame* (its
 * first block, positioned on the screen) and *children* (every other block,
 * positioned relative to the frame). That matches how `LoadControlSettings`
 * treats them closely enough for layout to agree with the game at any
 * resolution — which is the property the editor's preview depends on.
 */

import { parseKv } from '../kv/parse';
import { activeEntries, mergeProps, propsOf, type Props } from '../kv/props';
import { kvRange } from '../kv/query';
import type { KvDoc, KvNode } from '../kv/types';
import {
  layoutRect,
  pinOf,
  screenScale,
  translate,
  type Rect,
  type Screen,
} from '../layout/geometry';
import { placeholderFor } from '../placeholders';
import type { CondEnv } from '../scheme/cond';
import { borderOf, pickFont, resolveColor, type Rgba, type Scheme } from '../scheme/scheme';
import type { DrawOp, HAlign, ImageOp, PanelNode, Scene, TextOp, VAlign } from './types';

export interface SceneContext {
  /** Text of a project file, or `undefined` when it does not exist. */
  readText(path: string): string | undefined;
  scheme: Scheme;
  env: CondEnv;
  screen: Screen;
  minmode: boolean;
  /** Reveal panels whose own `visible` is 0. */
  showHidden: boolean;
  forceShown: ReadonlySet<string>;
  forceHidden: ReadonlySet<string>;
  /** `%name%` substitutions (lower-case keys). */
  vars: ReadonlyMap<string, string>;
  /** `#Token` localisation (keys lower-case, without the `#`). */
  strings: ReadonlyMap<string, string>;
  /** Fill fraction for progress bars, 0–1. */
  progress: number;
  /** Forces a panel on (`true`) or off (`false`) for the current class/weapon/situation; `undefined` = its own `visible`. */
  gate?: (file: string, name: string) => boolean | undefined;
  /** Fill (0–1) for a specific progress bar, or `undefined` for `progress`. */
  progressFor?: (file: string, name: string) => number | undefined;
  /** Who is playing, for team-coloured backgrounds and class images. */
  player?: { playerClass: string; team: 'red' | 'blue' };
}

/* ───────────────────────── parse cache ───────────────────────── */

const PARSE_CACHE_MAX = 96;
const parseCache = new Map<string, KvDoc>();

export function parseCached(text: string): KvDoc {
  const hit = parseCache.get(text);
  if (hit) {
    parseCache.delete(text);
    parseCache.set(text, hit);
    return hit;
  }
  const doc = parseKv(text);
  parseCache.set(text, doc);
  if (parseCache.size > PARSE_CACHE_MAX) {
    const oldest = parseCache.keys().next().value;
    if (oldest !== undefined) parseCache.delete(oldest);
  }
  return doc;
}

/* ───────────────────────── control kinds ───────────────────────── */

type Kind =
  'label' | 'image' | 'button' | 'progress' | 'check' | 'radio' | 'input' | 'dynamic' | 'panel';

const DYNAMIC =
  /^(cavatarimagepanel|cmodelpanel|citemmodelpanel|ctfplayermodelpanel|cstorepreview\w*|html|sectionedlistpanel|cexrichtext|richtext|cquest\w*|cnavigationpanel|cctfstaticbadgepanel|ctfstaticbadgepanel|scrollbar|menu|listpanel)$/i;

export function kindOf(control: string): Kind {
  const c = control.toLowerCase();
  if (DYNAMIC.test(c)) return 'dynamic';
  if (c === 'checkbutton') return 'check';
  if (c === 'radiobutton') return 'radio';
  if (c === 'textentry' || c === 'combobox') return 'input';
  if (c.includes('progressbar')) return 'progress';
  if (c.includes('button')) return 'button';
  if (c.endsWith('label') || c === 'label') return 'label';
  if (
    c === 'imagepanel' ||
    c === 'ctfimagepanel' ||
    c === 'ciconpanel' ||
    c === 'scalableimagepanel' ||
    c === 'ctfclassimage' ||
    c === 'cschinticon'
  )
    return 'image';
  return 'panel';
}

/* ───────────────────────── helpers ───────────────────────── */

const ROUNDED_RADIUS = 8; // virtual units, scaled

/** Resolve a materials path as `ImagePanel` does: rooted at `materials/vgui/`. */
export function imagePath(raw: string): string {
  const parts = ['materials', 'vgui', ...raw.replace(/\\/g, '/').split('/')];
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p && p !== '.') out.push(p);
  }
  return out.join('/').replace(/\.(vtf|vmt|png|tga|jpg)$/i, '');
}

/** Class names as they appear in `class_<name>red` material files. */
const CLASS_FILE: Record<string, string> = { demoman: 'demo', engineer: 'engi' };

/** `TF_IndividualUberCharges` → `Individual Uber Charges`: a readable stand-in for a localisation token with no string. */
export function humanizeToken(token: string): string {
  return token
    .replace(/^(TF|Hud|HUD|Tf)_/, '')
    .replace(/_+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
}

/** Resolve `#Token` localisation and `%var%` substitution the way a label does. */
export function substituteLabel(
  raw: string,
  vars: ReadonlyMap<string, string>,
  strings: ReadonlyMap<string, string>,
): string {
  let text = raw;
  if (text.startsWith('#')) {
    const key = text.slice(1).toLowerCase();
    text = strings.get(key) ?? humanizeToken(text.slice(1));
  }
  return text.replace(
    /%([A-Za-z0-9_]+)%/g,
    (_m, name: string) => vars.get(name.toLowerCase()) ?? placeholderFor(name),
  );
}

function substitute(ctx: SceneContext, raw: string): string {
  return substituteLabel(raw, ctx.vars, ctx.strings);
}

function parseAlignment(raw: string | undefined): { h: HAlign; v: VAlign } {
  const a = (raw ?? 'west').toLowerCase();
  const h: HAlign = a.includes('east') ? 'right' : a.includes('west') ? 'left' : 'center';
  const v: VAlign = a.startsWith('north') ? 'top' : a.startsWith('south') ? 'bottom' : 'middle';
  return { h, v };
}

function colorProp(ctx: SceneContext, props: Props, ...keys: string[]): Rgba | undefined {
  for (const k of keys) {
    const c = resolveColor(ctx.scheme, props.get(k));
    if (c) return c;
  }
  return undefined;
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 255 };

function textOp(ctx: SceneContext, props: Props, rect: Rect, text: string, color: Rgba): TextOp {
  const scale = screenScale(ctx.screen);
  const font = pickFont(ctx.scheme, props.get('font'), ctx.screen.h);
  const { h, v } = parseAlignment(props.get('textalignment'));
  const proportionalInset = props.bool('use_proportional_insets', false);
  const insetScale = proportionalInset ? scale : 1;
  const centerWrap = props.bool('centerwrap', false);
  return {
    t: 'text',
    rect,
    text,
    color,
    fontName: font?.def.name ?? 'Verdana',
    px: font?.px ?? 12 * scale,
    weight: font?.def.weight ?? 400,
    italic: font?.def.italic ?? false,
    underline: font?.def.underline ?? false,
    outline: font?.def.outline ?? false,
    dropshadow: font?.def.dropshadow ?? false,
    align: centerWrap ? 'center' : h,
    valign: v,
    wrap: props.bool('wrap', false) || centerWrap,
    insetX: props.num('textinsetx', 0) * insetScale,
    insetY: props.num('textinsety', 0) * insetScale,
  };
}

function opsFor(
  ctx: SceneContext,
  kind: Kind,
  control: string,
  name: string,
  props: Props,
  rect: Rect,
  isFrame: boolean,
  images: Set<string>,
  progress: number,
): DrawOp[] {
  const ops: DrawOp[] = [];
  const scale = screenScale(ctx.screen);
  const bgType = props.num('paintbackgroundtype', 0);
  const radius = bgType === 2 ? ROUNDED_RADIUS * scale : 0;

  // Background
  const bg =
    kind === 'button'
      ? colorProp(ctx, props, 'defaultbgcolor_override', 'bgcolor_override')
      : colorProp(ctx, props, 'bgcolor_override');
  if (bg && bg.a > 0 && props.bool('paintbackground', true)) {
    ops.push({ t: 'rect', rect, fill: bg, radius });
  } else if (
    !bg &&
    (kind === 'panel' || kind === 'input') &&
    props.bool('paintbackground', false)
  ) {
    const fallback = resolveColor(ctx.scheme, 'Panel.BgColor');
    if (fallback && fallback.a > 0) ops.push({ t: 'rect', rect, fill: fallback, radius });
  }

  // Border
  const border = borderOf(ctx.scheme, props.get('border') ?? props.get('border_default'));
  if (border) {
    const colors = (layers: typeof border.left) =>
      layers.map((l) => resolveColor(ctx.scheme, l.color) ?? { r: 0, g: 0, b: 0, a: 0 });
    ops.push({
      t: 'border',
      rect,
      border,
      colors: {
        left: colors(border.left),
        right: colors(border.right),
        top: colors(border.top),
        bottom: colors(border.bottom),
      },
      scale,
    });
  }

  const addImage = (raw: string | undefined, extra?: Partial<ImageOp>) => {
    // Some panels reuse `image`-ish keys for colours ("235 140 140 255"); those are not textures.
    if (!raw || /^\s*-?\d+(?:\.\d+)?(?:\s+-?\d+(?:\.\d+)?){2,3}\s*$/.test(raw)) return;
    const path = imagePath(raw);
    images.add(path);
    ops.push({ t: 'image', rect, path, ...extra });
  };

  switch (kind) {
    case 'image': {
      const fill = colorProp(ctx, props, 'fillcolor');
      if (fill) ops.push({ t: 'rect', rect, fill, radius: 0 });
      // CTFImagePanel swaps in `teambg_<n>` (2 = RED, 3 = BLU); CTFClassImage shows the player's class.
      const team = ctx.player?.team;
      const teamImage = team ? props.get(team === 'red' ? 'teambg_2' : 'teambg_3') : undefined;
      const classImage =
        control.toLowerCase() === 'ctfclassimage' && ctx.player
          ? `../hud/class_${CLASS_FILE[ctx.player.playerClass] ?? ctx.player.playerClass}${ctx.player.team === 'red' ? 'red' : 'blue'}`
          : undefined;
      addImage(classImage ?? teamImage ?? props.get('image') ?? props.get('icon'), {
        tint: colorProp(ctx, props, 'drawcolor'),
        native: !props.bool('scaleimage', false),
      });
      break;
    }
    case 'progress': {
      addImage(props.get('bg_image'));
      const frac = Math.max(0, Math.min(1, progress));
      const fg = props.get('fg_image');
      if (fg) {
        const path = imagePath(fg);
        images.add(path);
        ops.push({ t: 'image', rect, path, clipX: frac });
      } else {
        const fc = colorProp(ctx, props, 'fgcolor', 'fgcolor_override') ?? WHITE;
        ops.push({ t: 'rect', rect: { ...rect, w: rect.w * frac }, fill: fc, radius: 0 });
      }
      break;
    }
    case 'button':
    case 'label': {
      if (kind === 'button') addImage(props.get('image') ?? props.get('image_default'));
      const raw = props.get('labeltext');
      if (raw !== undefined && raw !== '') {
        const color =
          colorProp(ctx, props, 'defaultfgcolor_override', 'fgcolor_override', 'fgcolor') ??
          resolveColor(ctx.scheme, 'Label.TextColor') ??
          WHITE;
        ops.push(textOp(ctx, props, rect, substitute(ctx, raw), color));
      }
      break;
    }
    case 'check':
    case 'radio': {
      const box = Math.min(rect.h, 14 * scale);
      const by = rect.y + (rect.h - box) / 2;
      ops.push({
        t: 'outline',
        rect: { x: rect.x, y: by, w: box, h: box },
        color: { r: 200, g: 187, b: 161, a: 255 },
        dashed: false,
      });
      const raw = props.get('labeltext');
      if (raw) {
        const color = colorProp(ctx, props, 'fgcolor_override', 'fgcolor') ?? WHITE;
        ops.push(
          textOp(
            ctx,
            props,
            { ...rect, x: rect.x + box + 4 * scale, w: rect.w - box - 4 * scale },
            substitute(ctx, raw),
            color,
          ),
        );
      }
      break;
    }
    case 'input': {
      ops.push({
        t: 'outline',
        rect,
        color: { r: 200, g: 187, b: 161, a: 200 },
        dashed: false,
      });
      break;
    }
    case 'dynamic': {
      ops.push({ t: 'dynamic', rect, label: control });
      break;
    }
    default:
      break;
  }

  void name;
  void isFrame;
  return ops;
}

/* ───────────────────────── scene ───────────────────────── */

/** Layout-block names whose panel file does not share their name. */
const LAYOUT_FILE_OVERRIDES: Record<string, string> = {
  hudweaponammo: 'hudammoweapons',
  chealthaccountpanel: 'hudhealthaccount',
  cdamageaccountpanel: 'huddamageaccount',
  cmaintargetid: 'targetid',
  hudkothtimestatus: 'hudobjectivekothtimepanel',
  disguisestatus: 'disguisestatuspanel',
  hudflamerocketcharge: 'hudrocketpack',
};

/** The panel file (base name, no extension) a `hudlayout.res` block positions. */
function layoutFileFor(blockName: string): string {
  const k = blockName.toLowerCase();
  return LAYOUT_FILE_OVERRIDES[k] ?? k.replace(/^c(?=hud)/, '');
}

function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x),
    h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y),
  };
}

export const HUD_LAYOUT_FILE = 'scripts/hudlayout.res';

export function buildScene(ctx: SceneContext, files: readonly string[]): Scene {
  const scale = screenScale(ctx.screen);
  const screenRect: Rect = { x: 0, y: 0, w: ctx.screen.w, h: ctx.screen.h };
  const images = new Set<string>();
  const opts = { env: ctx.env, minmode: ctx.minmode };
  const propsFor = (e: KvNode) => propsOf(e, opts);

  // `scripts/hudlayout.res` re-states where each HUD element sits. Its block for
  // an element wins over whatever the element's own file says, and it is also
  // what a drag in the preview edits.
  const layoutByName = new Map<string, KvNode>();
  const layoutByFile = new Map<string, KvNode>();
  let layoutRootKey = 'Resource/HudLayout.res';
  const layoutText = ctx.readText(HUD_LAYOUT_FILE);
  if (layoutText !== undefined) {
    const layoutRoot = parseCached(layoutText).roots.find((n) => n.children);
    if (layoutRoot) {
      layoutRootKey = layoutRoot.key.text;
      for (const b of activeEntries(layoutRoot, ctx.env)) {
        if (!b.children) continue;
        const name = b.key.text.toLowerCase();
        if (!layoutByName.has(name)) layoutByName.set(name, b);
        const fileBase = layoutFileFor(b.key.text);
        if (!layoutByFile.has(fileBase)) layoutByFile.set(fileBase, b);
      }
    }
  }
  const groups: { z: number; order: number; nodes: PanelNode[] }[] = [];

  files.forEach((file, order) => {
    const text = ctx.readText(file);
    if (text === undefined) return;
    const doc = parseCached(text);
    const top = doc.roots.find((n) => n.children) ?? doc.roots[0];
    if (!top?.children) return;
    const entries = activeEntries(top, ctx.env).filter((e) => e.children);
    if (entries.length === 0) return;

    const first = entries[0];
    const fileBase = file
      .slice(file.lastIndexOf('/') + 1)
      .replace(/\.res$/i, '')
      .toLowerCase();
    const layoutBlock =
      layoutByFile.get(fileBase) ?? layoutByName.get(first.key.text.toLowerCase());
    const layoutProps = layoutBlock ? propsFor(layoutBlock) : undefined;
    const firstIsElement =
      layoutBlock !== undefined &&
      first.key.text.toLowerCase() === layoutBlock.key.text.toLowerCase();

    // Work out what the frame is: the file's first block, the layout block on its
    // own, or (for a file with neither) the whole screen.
    let frameProps: Props | undefined;
    let frameEntry: KvNode | null = null;
    if (layoutBlock && layoutProps && firstIsElement) {
      frameProps = mergeProps(propsFor(first), layoutProps);
      frameEntry = first;
    } else if (layoutBlock && layoutProps && layoutProps.has('wide') && layoutProps.has('tall')) {
      frameProps = layoutProps;
    } else {
      const own = propsFor(first);
      if (own.has('wide') && own.has('tall')) {
        frameProps = own;
        frameEntry = first;
      }
    }
    const hasFrame = frameProps !== undefined;
    const frameLocal = frameProps
      ? layoutRect({ props: frameProps, parent: screenRect, scale })
      : screenRect;
    const frameName = (frameEntry ?? layoutBlock ?? first).key.text;
    const children = frameEntry ? entries.slice(1) : entries;
    // Edits to the frame go to hudlayout.res when it has a block for this element.
    const frameFile = layoutBlock ? HUD_LAYOUT_FILE : file;
    const frameKeyPath = layoutBlock
      ? [layoutRootKey, layoutBlock.key.text]
      : [top.key.text, frameName];
    const frameSource = kvRange(layoutBlock ?? frameEntry ?? first);

    const seen = new Map<string, number>();
    const frameId = hasFrame ? `${file}#${frameName}` : null;
    const originX = hasFrame ? frameLocal.x : 0;
    const originY = hasFrame ? frameLocal.y : 0;

    /** What a panel needs to know about the panel it sits in. */
    interface Host {
      id: string | null;
      shown: boolean;
      keyPath: string[];
      /** Ancestors' bounds the panel is clipped to (VGUI clips children to their parent). */
      clip?: Rect;
    }
    interface Placed {
      node: PanelNode;
      order: number;
      kids: Placed[];
    }

    const make = (
      e: KvNode | null,
      props: Props,
      rect: Rect,
      isFrame: boolean,
      host: Host,
    ): PanelNode => {
      const name = e ? e.key.text : frameName;
      const control = props.get('controlname') ?? (e ? 'Panel' : 'HudElement');
      const baseId = `${file}#${name}`;
      const dup = seen.get(baseId) ?? 0;
      seen.set(baseId, dup + 1);
      const id = dup ? `${baseId}~${dup}` : baseId;
      const visible = props.bool('visible', true);
      let shown = visible || ctx.showHidden;
      // The game decides what is on screen for this class/weapon (unless the author asked to see everything).
      const gated = ctx.gate?.(file, name);
      if (gated !== undefined && !ctx.showHidden) shown = gated;
      if (ctx.forceShown.has(id)) shown = true;
      if (ctx.forceHidden.has(id)) shown = false;
      // A hidden panel hides everything inside it.
      if (!isFrame && !host.shown && (hasFrame || host.id !== null)) shown = false;
      const kind = kindOf(control);
      const progress = ctx.progressFor?.(file, name) ?? ctx.progress;
      const ops = shown
        ? opsFor(ctx, kind, control, name, props, rect, isFrame, images, progress)
        : [];
      return {
        id,
        file: isFrame ? frameFile : file,
        keyPath: isFrame ? frameKeyPath : [...host.keyPath, name],
        name: props.get('fieldname') ?? name,
        control,
        rect,
        z: props.num('zpos', 0),
        visible,
        shown,
        isFrame,
        parentId: isFrame ? null : host.id,
        clip: isFrame ? undefined : host.clip,
        source: isFrame ? frameSource : kvRange(e!),
        ops,
      };
    };

    /** Lay out `siblings` inside a parent of `parentSize` whose top-left is `origin`. */
    const place = (
      siblings: KvNode[],
      origin: { x: number; y: number },
      parentSize: Rect,
      host: Host,
    ): Placed[] => {
      const byName = new Map<string, KvNode>();
      for (const e of siblings) {
        const k = e.key.text.toLowerCase();
        if (!byName.has(k)) byName.set(k, e);
      }
      const memo = new Map<KvNode, Rect>();
      const resolving = new Set<KvNode>();
      const localRect = (e: KvNode): Rect => {
        const cached = memo.get(e);
        if (cached) return cached;
        const props = propsFor(e);
        let sibling: Rect | undefined;
        const pin = pinOf(props);
        if (pin && !resolving.has(e)) {
          const target = byName.get(pin.sibling.toLowerCase());
          if (target && target !== e) {
            resolving.add(e);
            sibling = localRect(target);
            resolving.delete(e);
          }
        }
        const r = layoutRect({ props, parent: parentSize, scale, sibling });
        memo.set(e, r);
        return r;
      };

      return siblings.map((e, order) => {
        const local = localRect(e);
        const abs = translate(local, origin.x, origin.y);
        const node = make(e, propsFor(e), abs, false, host);
        // Nested blocks that name a control are child panels; others (`if_vr`, …) are conditionals.
        const nested = activeEntries(e, ctx.env).filter(
          (c) => c.children && propsFor(c).has('controlname'),
        );
        const kids = nested.length
          ? place(
              nested,
              { x: abs.x, y: abs.y },
              { x: 0, y: 0, w: local.w, h: local.h },
              {
                id: node.id,
                shown: node.shown,
                keyPath: node.keyPath,
                clip: host.clip ? intersect(host.clip, abs) : abs,
              },
            )
          : [];
        return { node, order, kids };
      });
    };

    // Siblings paint lowest `zpos` first, ties in file order; a panel's children paint after it.
    const flatten = (placed: Placed[], into: PanelNode[]) => {
      [...placed]
        .sort((a, b) => a.node.z - b.node.z || a.order - b.order)
        .forEach((p) => {
          into.push(p.node);
          flatten(p.kids, into);
        });
    };

    const frameHost: Host = { id: frameId, shown: true, keyPath: [top.key.text] };
    const nodes: PanelNode[] = [];
    if (frameProps) {
      const frame = make(frameEntry, frameProps, frameLocal, true, frameHost);
      nodes.push(frame);
      frameHost.shown = frame.shown;
    }
    flatten(
      place(
        children,
        { x: originX, y: originY },
        { x: 0, y: 0, w: frameLocal.w, h: frameLocal.h },
        frameHost,
      ),
      nodes,
    );

    groups.push({ z: frameProps ? frameProps.num('zpos', 0) : 0, order, nodes });
  });

  groups.sort((a, b) => a.z - b.z || a.order - b.order);
  const out: PanelNode[] = groups.flatMap((g) => g.nodes);
  return { screen: ctx.screen, nodes: out, images: [...images] };
}

/** Topmost shown panel under a point (in scene pixels), excluding full-bleed frames. */
export function hitTest(scene: Scene, x: number, y: number): PanelNode | undefined {
  for (let i = scene.nodes.length - 1; i >= 0; i--) {
    const n = scene.nodes[i];
    if (!n.shown) continue;
    const r = n.rect;
    if (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h) {
      if (n.isFrame && r.w >= scene.screen.w - 1 && r.h >= scene.screen.h - 1) continue;
      return n;
    }
  }
  return undefined;
}
