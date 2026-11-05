/**
 * The manifest of skinned character models (public/models/hearthworks/manifest.json) and everything that can be
 * decided from it without touching WebGL: which skins have a model, which animation plays for a logical clip, and
 * what to play when a model lacks a clip. The contract is documented in docs/hearthworks-models.md.
 *
 * Every failure here means "no models": a missing, unreachable or malformed manifest, or a bad entry in it, must
 * never throw and never stop the procedural figure from drawing.
 */

import { z } from 'zod';
import { isSkinId, type SkinId } from './catalog';

export const MODEL_BASE = '/models/hearthworks/';
export const MANIFEST_URL = `${MODEL_BASE}manifest.json`;

export const CLIP_SLOTS = [
  'idle',
  'walk',
  'run',
  'jump',
  'fall',
  'shoot',
  'reload',
  'hurt',
  'death',
  'interact',
] as const;
export type ClipSlot = (typeof CLIP_SLOTS)[number];

/** Clips that play once on top of whatever the body is doing. */
export const ONE_SHOT_SLOTS = ['shoot', 'reload', 'hurt', 'interact'] as const;
export type OneShotSlot = (typeof ONE_SHOT_SLOTS)[number];

/** What stands in for a clip a model does not have, best first. `idle` is required, so every chain ends there. */
export const CLIP_FALLBACKS: Record<ClipSlot, readonly ClipSlot[]> = {
  idle: ['idle'],
  walk: ['walk', 'idle'],
  run: ['run', 'walk', 'idle'],
  jump: ['jump', 'idle'],
  fall: ['fall', 'idle'],
  shoot: ['shoot', 'idle'],
  reload: ['reload', 'idle'],
  hurt: ['hurt', 'idle'],
  death: ['death', 'hurt', 'idle'],
  interact: ['interact', 'idle'],
};

const animName = z.string().min(1).max(200);
const optionalAnim = animName.nullish().transform((v) => v ?? undefined).optional();

const vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);

const clipsSchema = z.object({
  idle: animName,
  walk: animName,
  run: optionalAnim,
  jump: optionalAnim,
  fall: optionalAnim,
  shoot: optionalAnim,
  reload: optionalAnim,
  hurt: optionalAnim,
  death: optionalAnim,
  interact: optionalAnim,
});

export const modelEntrySchema = z.object({
  /** A plain file name beside the manifest: never a path, so a manifest cannot point the loader elsewhere. */
  file: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.glb$/),
  /** Metres the model stands in the GLB. */
  height: z.number().finite().positive().max(100),
  /** Radians added to face +Z. */
  yaw: z.number().finite(),
  handBone: z.string().min(1).max(200).nullable(),
  bytes: z.number().finite().nonnegative(),
  provenance: z.enum(['valve-source', 'stand-in']),
  clips: clipsSchema,
  /**
   * Optional extension (not part of manifest v1's required shape): extra offset for a prop held in the hand, applied
   * after the prop is aligned to the model's own axes. `pos` is in world units, `rot` in radians (XYZ).
   */
  hold: z.object({ pos: vec3.optional(), rot: vec3.optional() }).optional(),
});

export type ModelEntry = z.infer<typeof modelEntrySchema>;

export interface Manifest {
  version: 1;
  models: Partial<Record<SkinId, ModelEntry>>;
}

export const EMPTY_MANIFEST: Manifest = Object.freeze({ version: 1, models: Object.freeze({}) }) as Manifest;

/**
 * Untrusted JSON → a manifest holding only the entries that are valid and name a skin in the catalog. A wrong
 * version, a non-object, or garbage gives the empty manifest; one bad entry drops that entry only.
 */
export function parseManifest(json: unknown): Manifest {
  if (typeof json !== 'object' || json === null) return EMPTY_MANIFEST;
  const raw = json as { version?: unknown; models?: unknown };
  if (raw.version !== 1 || typeof raw.models !== 'object' || raw.models === null || Array.isArray(raw.models))
    return EMPTY_MANIFEST;
  const models: Partial<Record<SkinId, ModelEntry>> = {};
  for (const [id, value] of Object.entries(raw.models)) {
    if (!isSkinId(id)) continue;
    const parsed = modelEntrySchema.safeParse(value);
    if (parsed.success) models[id] = parsed.data;
  }
  return { version: 1, models };
}

export interface ResolvedClip {
  /** The logical clip that was actually found (`walk` when `run` was asked for and missing). */
  slot: ClipSlot;
  /** The animation's name inside the GLB. */
  animation: string;
}

/**
 * The animation to play for a logical clip, following the fallback chain. When `available` (the animation names that
 * really exist in the loaded GLB) is given, a manifest name the file does not contain counts as missing too.
 * `idle` is required, so this always answers; if even idle is not in `available` the answer is still idle's name,
 * and the caller (the loader) is expected to have refused such a model.
 */
export function resolveClip(
  entry: Pick<ModelEntry, 'clips'>,
  clip: ClipSlot,
  available?: ReadonlySet<string>,
): ResolvedClip {
  for (const slot of CLIP_FALLBACKS[clip]) {
    const animation = entry.clips[slot];
    if (animation && (!available || available.has(animation))) return { slot, animation };
  }
  return { slot: 'idle', animation: entry.clips.idle };
}

/** True when the entry has a real clip for this slot (not a fallback). */
export function hasClip(entry: Pick<ModelEntry, 'clips'>, clip: ClipSlot, available?: ReadonlySet<string>): boolean {
  return resolveClip(entry, clip, available).slot === clip;
}

/** The two clips every model must have; without them the model cannot be shown. */
export function missingRequiredClips(entry: Pick<ModelEntry, 'clips'>, available: ReadonlySet<string>): ClipSlot[] {
  const out: ClipSlot[] = [];
  for (const slot of ['idle', 'walk'] as const) if (!available.has(entry.clips[slot])) out.push(slot);
  return out;
}

export function modelUrl(entry: Pick<ModelEntry, 'file'>): string {
  return `${MODEL_BASE}${entry.file}`;
}

// --- loading (the only impure part) ------------------------------------------------------------------------------

type Listener = () => void;

let current: Manifest = EMPTY_MANIFEST;
let inflight: Promise<Manifest> | null = null;
let settledAt = 0;
let succeeded = false;
const listeners = new Set<Listener>();

/** A failed fetch is retried after this long, so a transient outage does not hide the models for the whole visit. */
const RETRY_MS = 30_000;
const FETCH_TIMEOUT_MS = 8_000;

export interface LoadManifestOptions {
  fetch?: typeof fetch;
  /** Ignore the cache. */
  force?: boolean;
  now?: () => number;
}

/** Fetch the manifest once and cache it. Resolves (never rejects) with the manifest, or the empty one on any failure. */
export function loadManifest(opts: LoadManifestOptions = {}): Promise<Manifest> {
  const now = opts.now ?? Date.now;
  if (!opts.force) {
    if (inflight) return inflight;
    if (settledAt !== 0 && (succeeded || now() - settledAt < RETRY_MS)) return Promise.resolve(current);
  }
  const doFetch = opts.fetch ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!doFetch || (!opts.fetch && typeof window === 'undefined')) return Promise.resolve(current);

  const run = (async (): Promise<Manifest> => {
    let next = EMPTY_MANIFEST;
    let ok = false;
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS) : null;
    try {
      const res = await doFetch(MANIFEST_URL, { signal: ctl?.signal, headers: { accept: 'application/json' } });
      if (res.ok) {
        next = parseManifest(await res.json());
        ok = true;
      }
    } catch {
      /* offline, 404 as HTML, invalid JSON, timeout: no models */
    } finally {
      if (timer) clearTimeout(timer);
    }
    current = next;
    succeeded = ok;
    settledAt = now();
    inflight = null;
    for (const l of [...listeners]) l();
    return current;
  })();
  inflight = run;
  return run;
}

/** The manifest as loaded so far (empty until `loadManifest` resolves). Stable between loads, for `useSyncExternalStore`. */
export function getManifest(): Manifest {
  return current;
}

export function subscribeManifest(listener: Listener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Test seam: forget everything loaded. */
export function resetManifestForTests(next: Manifest = EMPTY_MANIFEST): void {
  current = next;
  inflight = null;
  settledAt = next === EMPTY_MANIFEST ? 0 : Date.now();
  succeeded = next !== EMPTY_MANIFEST;
  for (const l of [...listeners]) l();
}
