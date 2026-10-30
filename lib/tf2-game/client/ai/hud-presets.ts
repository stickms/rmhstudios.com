/**
 * Quick HUD presets: the in-game quick bar's local, non-AI edits ("Bigger health", "Minimal HUD",
 * "Meters by the crosshair", "Keep clear of touch buttons" …). Each preset reads the HUD's own files
 * and returns key-level changes in the HUD assistant's format (`HudChange`, lib/tf2-hud/ai-core.ts),
 * so it goes through the same `applyChanges` validator, is one undo step in the editor's history, and
 * works on any HUD, not just the TF2 Default: it only touches panels and keys that exist, keeps each
 * value's anchoring prefix (`r120` stays bottom-anchored) and picks fonts from the HUD's own scheme.
 *
 * Pure and deterministic — the same files always give the same changes.
 */

import type { HudChange } from '@/lib/tf2-hud/ai-core';
import { parseKv } from '@/lib/tf2-hud/kv/parse';
import { kvAt, kvChild, kvChildren } from '@/lib/tf2-hud/kv/query';
import type { KvDoc, KvNode } from '@/lib/tf2-hud/kv/types';

export type HudPresetId =
  | 'bigger-health'
  | 'bigger-ammo'
  | 'bigger-uber'
  | 'minimal'
  | 'meters-centre'
  | 'ammo-centre'
  | 'clear-touch';

export const HUD_PRESET_IDS: readonly HudPresetId[] = [
  'bigger-health',
  'bigger-ammo',
  'bigger-uber',
  'minimal',
  'meters-centre',
  'ammo-centre',
  'clear-touch',
];

export const HUDLAYOUT = 'scripts/hudlayout.res';
export const HEALTH_FILE = 'resource/ui/hudplayerhealth.res';
export const AMMO_FILE = 'resource/ui/hudammoweapons.res';
export const MEDIC_FILE = 'resource/ui/hudmediccharge.res';
export const CLASS_FILE = 'resource/ui/hudplayerclass.res';
export const SCHEME_FILE = 'resource/clientscheme.res';

/** The files each preset reads (and may change); the caller loads them first. */
export const PRESET_FILES: Readonly<Record<HudPresetId, readonly string[]>> = {
  'bigger-health': [HEALTH_FILE, SCHEME_FILE],
  'bigger-ammo': [HUDLAYOUT, AMMO_FILE, SCHEME_FILE],
  'bigger-uber': [HUDLAYOUT, MEDIC_FILE],
  minimal: [CLASS_FILE, HEALTH_FILE, AMMO_FILE],
  'meters-centre': [HUDLAYOUT],
  'ammo-centre': [HUDLAYOUT],
  'clear-touch': [HUDLAYOUT],
};

/** How much bigger the "bigger" presets make things. */
export const SCALE = { health: 1.35, ammo: 1.25, uber: 1.35 } as const;
/** HUD units (of 480) the right-hand cluster is lifted by to clear the touch buttons. */
export const TOUCH_LIFT = 200;

const LAYOUT_KEYS = ['xpos', 'ypos', 'wide', 'tall'] as const;
/** A layout value we can scale: an optional anchor prefix and a number (`r120`, `c-64`, `f0`, `75`). */
const SCALABLE = /^([rcf]?)(-?\d+(?:\.\d+)?)$/i;

type Files = Readonly<Record<string, string>>;

function rootOf(doc: KvDoc): KvNode | undefined {
  return doc.roots.find((n) => n.open);
}

/** The key path of `panel` in a file (the file's own spelling), or null when it does not exist. */
function panelPath(doc: KvDoc, panel: string): string[] | null {
  const root = rootOf(doc);
  const node = root ? kvChild(root, panel) : undefined;
  return root && node?.open ? [root.key.text, node.key.text] : null;
}

const valueAt = (doc: KvDoc, path: readonly string[]): string | undefined =>
  kvAt(doc, path)?.value?.text;

function scaleValue(v: string, f: number): string | null {
  const m = SCALABLE.exec(v.trim());
  if (!m) return null;
  const n = Math.round(Number(m[2]) * f);
  return `${m[1]}${n}`;
}

/** Scale the layout keys of one panel block (only keys it has, only plain or prefixed numbers). */
function scalePanel(file: string, doc: KvDoc, panel: string[], f: number, out: HudChange[]): void {
  for (const key of LAYOUT_KEYS) {
    const v = valueAt(doc, [...panel, key]);
    if (v === undefined) continue;
    const next = scaleValue(v, f);
    if (next !== null && next !== v) out.push({ file, op: 'set', path: [...panel, key], value: next });
  }
}

/** Every panel block of a file, scaled by `f` about its anchors. */
function scaleFile(file: string, text: string, f: number, out: HudChange[]): void {
  const doc = parseKv(text);
  const root = rootOf(doc);
  if (!root) return;
  for (const node of kvChildren(root)) {
    if (!node.open) continue;
    scalePanel(file, doc, [root.key.text, node.key.text], f, out);
  }
}

/** A scheme font's first face height, or null. */
function fontTall(scheme: KvDoc, name: string): { tall: number; face: string } | null {
  const fonts = kvAt(scheme, ['Scheme', 'Fonts']);
  const font = fonts ? kvChild(fonts, name) : undefined;
  const face = font ? kvChildren(font).find((n) => n.open) : undefined;
  const tall = face ? Number(kvChild(face, 'tall')?.value?.text) : NaN;
  if (!face || !Number.isFinite(tall) || tall <= 0) return null;
  return { tall, face: (kvChild(face, 'name')?.value?.text ?? '').toLowerCase() };
}

/**
 * The HUD's own font in the same face nearest to `factor` × the current one's height (within 0.9–1.4× of
 * the target). Null when the scheme has none, so the preset leaves the font alone.
 */
export function biggerFont(schemeText: string | undefined, current: string, factor: number): string | null {
  if (!schemeText) return null;
  const scheme = parseKv(schemeText);
  const cur = fontTall(scheme, current);
  const fonts = kvAt(scheme, ['Scheme', 'Fonts']);
  if (!cur || !fonts) return null;
  const want = cur.tall * factor;
  let best: { name: string; score: number } | null = null;
  for (const node of kvChildren(fonts)) {
    if (!node.open || node.key.text.toLowerCase() === current.toLowerCase()) continue;
    const f = fontTall(scheme, node.key.text);
    // Same face only: a different face would change the HUD's look, not just its size.
    if (!f || f.face !== cur.face || f.tall < want * 0.9 || f.tall > want * 1.4) continue;
    const score = Math.abs(f.tall - want);
    if (!best || score < best.score || (score === best.score && node.key.text < best.name))
      best = { name: node.key.text, score };
  }
  return best?.name ?? null;
}

function setFont(file: string, doc: KvDoc, panel: string, scheme: string | undefined, f: number, out: HudChange[]) {
  const path = panelPath(doc, panel);
  const font = path ? valueAt(doc, [...path, 'font']) : undefined;
  if (!path || !font) return;
  const next = biggerFont(scheme, font, f);
  if (next) out.push({ file, op: 'set', path: [...path, 'font'], value: next });
}

function setIfPanel(file: string, doc: KvDoc, panel: string, key: string, value: string, out: HudChange[]) {
  const path = panelPath(doc, panel);
  if (!path) return;
  if (valueAt(doc, [...path, key]) === value) return;
  out.push({ file, op: 'set', path: [...path, key], value });
}

/** Meter frames placed round the crosshair (640×480 units; `c` = from the centre). */
const METERS_BY_CROSSHAIR: ReadonlyArray<{ panel: string; xpos: string; ypos: string }> = [
  { panel: 'HudDemomanCharge', xpos: 'c-30', ypos: 'c18' },
  { panel: 'HudBowCharge', xpos: 'c-30', ypos: 'c18' },
  { panel: 'HudMedicCharge', xpos: 'c-65', ypos: 'c30' },
  { panel: 'HudDemomanPipes', xpos: 'c-50', ypos: 'c30' },
  { panel: 'HudItemEffectMeter', xpos: 'c-50', ypos: 'c70' },
];

/** The bottom-right cluster the touch buttons sit over. */
const RIGHT_CLUSTER = [
  'HudWeaponAmmo',
  'HudItemEffectMeter',
  'HudMedicCharge',
  'HudDemomanPipes',
  'HudDemomanCharge',
  'HudBowCharge',
  'CHudAccountPanel',
] as const;

/**
 * The changes a preset makes to `files` (path → current text; missing files are skipped). Run them
 * through `applyChanges` like the assistant's: what applies is what the player is shown.
 */
export function presetChanges(id: HudPresetId, files: Files): HudChange[] {
  const out: HudChange[] = [];
  const doc = (path: string) => (files[path] === undefined ? null : parseKv(files[path]));
  switch (id) {
    case 'bigger-health': {
      const text = files[HEALTH_FILE];
      if (text === undefined) break;
      scaleFile(HEALTH_FILE, text, SCALE.health, out);
      setFont(HEALTH_FILE, parseKv(text), 'PlayerStatusHealthValue', files[SCHEME_FILE], SCALE.health, out);
      break;
    }
    case 'bigger-ammo': {
      const layout = doc(HUDLAYOUT);
      const frame = layout && panelPath(layout, 'HudWeaponAmmo');
      if (layout && frame) scalePanel(HUDLAYOUT, layout, frame, SCALE.ammo, out);
      const text = files[AMMO_FILE];
      if (text === undefined) break;
      scaleFile(AMMO_FILE, text, SCALE.ammo, out);
      const ammo = parseKv(text);
      for (const p of ['AmmoInClip', 'AmmoInClipShadow', 'AmmoNoClip', 'AmmoNoClipShadow', 'AmmoInReserve', 'AmmoInReserveShadow'])
        setFont(AMMO_FILE, ammo, p, files[SCHEME_FILE], SCALE.ammo, out);
      break;
    }
    case 'bigger-uber': {
      const layout = doc(HUDLAYOUT);
      const frame = layout && panelPath(layout, 'HudMedicCharge');
      if (layout && frame) scalePanel(HUDLAYOUT, layout, frame, SCALE.uber, out);
      if (files[MEDIC_FILE] !== undefined) scaleFile(MEDIC_FILE, files[MEDIC_FILE], SCALE.uber, out);
      break;
    }
    case 'minimal': {
      const cls = doc(CLASS_FILE);
      if (cls)
        for (const p of ['PlayerStatusClassImage', 'PlayerStatusClassImageBG', 'classmodelpanel', 'classmodelpanelBG'])
          setIfPanel(CLASS_FILE, cls, p, 'visible', '0', out);
      const health = doc(HEALTH_FILE);
      if (health) setIfPanel(HEALTH_FILE, health, 'PlayerStatusMaxHealthValue', 'visible', '0', out);
      const ammo = doc(AMMO_FILE);
      if (ammo) setIfPanel(AMMO_FILE, ammo, 'HudWeaponAmmoBG', 'visible', '0', out);
      break;
    }
    case 'meters-centre': {
      const layout = doc(HUDLAYOUT);
      if (!layout) break;
      for (const m of METERS_BY_CROSSHAIR) {
        setIfPanel(HUDLAYOUT, layout, m.panel, 'xpos', m.xpos, out);
        setIfPanel(HUDLAYOUT, layout, m.panel, 'ypos', m.ypos, out);
      }
      break;
    }
    case 'ammo-centre': {
      const layout = doc(HUDLAYOUT);
      if (!layout) break;
      setIfPanel(HUDLAYOUT, layout, 'HudWeaponAmmo', 'xpos', 'c40', out);
      setIfPanel(HUDLAYOUT, layout, 'HudWeaponAmmo', 'ypos', 'c20', out);
      break;
    }
    case 'clear-touch': {
      const layout = doc(HUDLAYOUT);
      if (!layout) break;
      for (const panel of RIGHT_CLUSTER) {
        const path = panelPath(layout, panel);
        const v = path ? valueAt(layout, [...path, 'ypos']) : undefined;
        const m = v ? /^r(\d+)$/i.exec(v.trim()) : null;
        // Only bottom-anchored frames move, and only once: a frame already above the buttons stays.
        if (path && m && Number(m[1]) < TOUCH_LIFT)
          out.push({ file: HUDLAYOUT, op: 'set', path: [...path, 'ypos'], value: `r${Number(m[1]) + TOUCH_LIFT}` });
      }
      break;
    }
  }
  return out;
}
