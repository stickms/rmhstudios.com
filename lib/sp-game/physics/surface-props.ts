/**
 * Physics surface properties (scripts/surfaceproperties*.txt, listed by
 * scripts/surfaceproperties_manifest.txt): friction, elasticity, density and
 * the impact/scrape sound names per surface, with `base` inheritance — the
 * SDK's CPhysicsSurfaceProps (vphysics, interface in public/vphysics_interface.h
 * surfacedata_t). Movement reads friction / jumpfactor / maxspeedfactor from
 * the same table (CGameMovement::CategorizeGroundSurface).
 */

import { parseKeyValues, type KvNode } from '../../tf2-game/formats/keyvalues';
import type { GameFileSystem } from '../../tf2-game/formats/vpk';
import type { SurfaceProps } from '../../tf2-game/sim/movement-types';

export interface SurfaceData extends SurfaceProps {
  name: string;
  elasticity: number;
  /** kg/m³. */
  density: number;
  thickness: number;
  dampening: number;
  /** Sound script names ('' when none). */
  stepLeft: string;
  stepRight: string;
  impactHard: string;
  impactSoft: string;
  scrapeRough: string;
  scrapeSmooth: string;
  bulletImpact: string;
  breakSound: string;
  /** gamematerial character (e.g. 'M' metal, 'C' concrete). */
  gameMaterial: string;
  climbable: boolean;
}

const KEYS = [
  'friction',
  'elasticity',
  'density',
  'thickness',
  'dampening',
  'jumpfactor',
  'maxspeedfactor',
  'stepleft',
  'stepright',
  'impacthard',
  'impactsoft',
  'scraperough',
  'scrapesmooth',
  'bulletimpact',
  'break',
  'gamematerial',
  'climbable',
] as const;

const DEFAULT_RAW: Record<string, string> = {
  friction: '0.8',
  elasticity: '0.25',
  density: '2000',
  thickness: '0',
  dampening: '0',
  jumpfactor: '1',
  maxspeedfactor: '1',
};

function build(name: string, raw: Record<string, string>): SurfaceData {
  const n = (k: string, d: number): number => {
    const v = parseFloat(raw[k] ?? '');
    return Number.isFinite(v) ? v : d;
  };
  return {
    name,
    friction: n('friction', 0.8),
    jumpFactor: n('jumpfactor', 1),
    maxSpeedFactor: n('maxspeedfactor', 1),
    elasticity: n('elasticity', 0.25),
    density: n('density', 2000),
    thickness: n('thickness', 0),
    dampening: n('dampening', 0),
    stepLeft: raw.stepleft ?? '',
    stepRight: raw.stepright ?? '',
    impactHard: raw.impacthard ?? '',
    impactSoft: raw.impactsoft ?? '',
    scrapeRough: raw.scraperough ?? '',
    scrapeSmooth: raw.scrapesmooth ?? '',
    bulletImpact: raw.bulletimpact ?? '',
    breakSound: raw.break ?? '',
    gameMaterial: raw.gamematerial ?? 'C',
    climbable: (parseInt(raw.climbable ?? '0', 10) || 0) !== 0,
  };
}

/** Surface name → resolved properties; unknown names resolve to "default". */
export class SurfacePropsTable {
  private readonly raw = new Map<string, Record<string, string>>();
  private readonly resolved = new Map<string, SurfaceData>();

  /** Adds every top-level block of one surfaceproperties file (later files override). */
  addFile(text: string): void {
    const { root } = parseKeyValues(text);
    for (const node of root.children) if (node.isBlock) this.addBlock(node);
  }

  private addBlock(node: KvNode): void {
    const raw: Record<string, string> = {};
    for (const c of node.children) if (c.value !== null) raw[c.key.toLowerCase()] = c.value;
    this.raw.set(node.key.toLowerCase(), raw);
    this.resolved.clear();
  }

  has(name: string): boolean {
    return this.raw.has(name.toLowerCase());
  }

  /** Resolved properties for a surface (base chain applied). Cached; never allocates on a hit. */
  get(name: string): SurfaceData {
    const key = (name || 'default').toLowerCase();
    const hit = this.resolved.get(key);
    if (hit) return hit;
    const chain: Record<string, string>[] = [];
    let cur: string | undefined = this.raw.has(key) ? key : 'default';
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const r = this.raw.get(cur);
      if (!r) break;
      chain.push(r);
      cur = r.base?.toLowerCase();
    }
    const merged: Record<string, string> = { ...DEFAULT_RAW };
    const def = this.raw.get('default');
    if (def) for (const k of KEYS) if (def[k] !== undefined) merged[k] = def[k];
    for (let i = chain.length - 1; i >= 0; i--) for (const k of KEYS) if (chain[i][k] !== undefined) merged[k] = chain[i][k];
    const out = build(key, merged);
    this.resolved.set(key, out);
    return out;
  }
}

/** Loads the manifest's files through a game file system (the first copy of each file wins, like the engine). */
export function loadSurfaceProps(fs: GameFileSystem): SurfacePropsTable {
  const table = new SurfacePropsTable();
  const manifest = fs.readText('scripts/surfaceproperties_manifest.txt');
  const files: string[] = [];
  if (manifest) {
    const { root } = parseKeyValues(manifest);
    const block = root.children.find((c) => c.isBlock);
    for (const c of block?.children ?? []) if (c.key.toLowerCase() === 'file' && c.value) files.push(c.value);
  } else files.push('scripts/surfaceproperties.txt');
  for (const f of files) {
    const t = fs.readText(f);
    if (t) table.addFile(t);
  }
  return table;
}
