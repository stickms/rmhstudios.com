/**
 * The level source DSL (architecture.md §3.1): what a Harmonic chapter is written in.
 *
 * A level is convex brushes plus entities, in Source units (inches), Z up. The compiler
 * (`compileLevel`) turns it into an in-memory `BspFile` the unchanged engine runs on.
 * Environment-agnostic: no DOM.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Texture placement on one face. */
export interface Face {
  material: string;
  /**
   * World size of one texture repeat, as a multiple of the material's `unitsPerRepeat`
   * (2 = the texture drawn twice as large). Default 1.
   */
  uScale?: number;
  vScale?: number;
  /** Offset in texels (Source `textureVecs` offset). Default 0. */
  uShift?: number;
  vShift?: number;
  /** Degrees, rotating the texture axes inside the face's projection. Default 0. */
  rotation?: number;
}

/** The six faces of a `box` brush. top = +Z, bottom = -Z, north = +Y, south = -Y, east = +X, west = -X. */
export type BoxFaceName = 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west';

export type BrushContents = 'solid' | 'playerclip' | 'water' | 'window' | 'ladder';

export interface PlaneSource {
  /** Outward normal (need not be unit length; normalised by the compiler). */
  normal: Vec3;
  /** `normal · p <= dist` is inside the brush (before normalisation). */
  dist: number;
  /** Per-plane texture override (otherwise the brush's `material`). */
  face?: Face;
}

export interface BrushSource {
  /** Either an AABB or at least 4 half-space planes for a convex solid. */
  box?: { min: Vec3; max: Vec3 };
  planes?: PlaneSource[];
  /** Default face material. */
  material: string;
  /** Box-face overrides. */
  faces?: Partial<Record<BoxFaceName, Face>>;
  /** Default `'solid'`. */
  contents?: BrushContents;
  /** Phase layer (H2.1). Carried, not yet acted on by the compiler. */
  layer?: 'both' | 'past' | 'present';
}

export interface EntitySource {
  classname: string;
  origin?: Vec3;
  angles?: Vec3;
  keys?: Record<string, string>;
  /**
   * Brushes owned by this entity (func_door, func_brush, trigger_*): compiled to models[n]
   * and the key `model "*n"`. Brushes are in world coordinates (the model's rest position);
   * give `origin` only to offset the whole model, as `MapCollision` applies it.
   */
  brushes?: BrushSource[];
  /** Source I/O outputs: `"OnTrigger target,Input,param,delay,times"` (output name, a space, the value). */
  outputs?: string[];
}

export interface FogSource {
  /** 0..255 RGB. */
  color: [number, number, number];
  start: number;
  end: number;
  /** 0..1, default 1. */
  maxDensity?: number;
}

export interface LevelSource {
  id: string;
  title: string;
  /** Sky name written to worldspawn `skyname`. */
  sky?: string;
  /** Emitted as an `env_fog_controller` the renderer reads. */
  fog?: FogSource;
  world: BrushSource[];
  entities: EntitySource[];
}
