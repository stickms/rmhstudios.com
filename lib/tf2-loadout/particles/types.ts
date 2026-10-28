/** Browser representation of the game's PCF/DMX graphs and VMT/VTF dependencies. */
export type ParticleValue = number | string | boolean | number[];
export type Params = Record<string, ParticleValue>;
export interface ParticleOperator {
  function: string;
  params: Params;
}
export interface ParticleDefinition {
  name: string;
  options: Params;
  material?: string;
  renderers: ParticleOperator[];
  initializers: ParticleOperator[];
  operators: ParticleOperator[];
  emitters: ParticleOperator[];
  forces: ParticleOperator[];
  constraints: ParticleOperator[];
  children: { system: string; delay: number }[];
}
export type UVRect = [number, number, number, number];
export interface SheetSequence {
  clamp: boolean;
  duration: number;
  frames: { duration: number; uv: UVRect[] }[];
}
export interface ParticleTexture {
  width: number;
  height: number;
  flags: number;
  frames: string[];
  sequences: Record<string, SheetSequence>;
}
export interface MaterialProxy {
  key: string;
  value: string | MaterialProxy[];
}
export interface ParticleMaterial {
  shader: string;
  params: Record<string, string>;
  proxies: MaterialProxy[];
  textures: Record<string, ParticleTexture>;
}
export interface ParticleBundle {
  v: 1;
  id: number;
  system: string;
  schema: Record<string, string>;
  systems: Record<string, ParticleDefinition>;
  materials: Record<string, ParticleMaterial>;
}
export interface ParticleManifest {
  v: 1;
  effects: Record<string, string>;
}

// The converter's scale, shared by particles, model attachments and hitboxes.
export const SOURCE_UNIT = 0.01905;
export const PARTICLE_API = '/api/tf2-loadout/particles/';

/** Only content-addressed assets and the one mutable entry point are public. */
export function isSafeParticlePath(path: string): boolean {
  return (
    path === 'manifest.json' ||
    /^(?:effects\/[a-f0-9]{64}\.json|tex\/[a-f0-9]{64}\.webp)$/.test(path)
  );
}

export const number = (p: Params, key: string, fallback = 0): number => {
  const v = p[key];
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  if (typeof v === 'boolean') return +v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return fallback;
};
export const vector = (
  p: Params,
  key: string,
  fallback: readonly number[] = [0, 0, 0],
): number[] => {
  const v = p[key];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    const parts = v
      .replace(/[[\]{}]/g, '')
      .trim()
      .split(/\s+/)
      .map(Number);
    if (parts.length >= 3 && parts.every(Number.isFinite)) return parts;
  }
  return [...fallback];
};
