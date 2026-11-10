/**
 * Where a skin's model files are: the asset channel's `mdl/index.json` (written by scripts/tf2-game/models.py), a map
 * `models/<path>.mdl -> { glb, anims, ... }` whose values are content-addressed files `mdl/<sha1>.glb`. The index is
 * fetched once per game through the same-origin asset route (`gameAssetUrl`, which the CSP already allows), cached,
 * and tolerant of everything: no R2 behind the route (local dev), a 404 for a channel that has not been synced, a
 * network error, bad JSON. All of those mean "no index", which means the skin keeps its procedural figure.
 *
 * Only the pure URL helpers of lib/tf2-game/assets are imported (no server module, nothing heavy).
 */

import { gameAssetUrl } from '@/lib/tf2-game/assets/urls';
import type { GameId, ModelEntry } from './model-manifest';

/** The part of an index entry Hearthworks reads. */
export interface IndexedModel {
  /** Mesh + skeleton + textures: `mdl/<glb>`. */
  glb: string;
  /** Anim pack (skeleton + every Source sequence as a glTF animation): `mdl/<anims>`. */
  anims?: string;
  /** Number of skin (material) families. */
  skins?: number;
  skinned?: boolean;
  bones?: number;
}

export type ModelIndex = Record<string, IndexedModel>;

/** A file name in the index: `<sha1|sha256>.glb`. Anything else (a path, a URL, `..`) is refused. */
const FILE = /^[a-f0-9]{40,64}\.glb$/;

/** Untrusted JSON → entries that carry a usable `glb` name. Never throws. */
export function parseModelIndex(json: unknown): ModelIndex {
  const out: ModelIndex = Object.create(null) as ModelIndex;
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return out;
  for (const [mdl, v] of Object.entries(json as Record<string, unknown>)) {
    if (typeof v !== 'object' || v === null) continue;
    const e = v as Record<string, unknown>;
    if (typeof e.glb !== 'string' || !FILE.test(e.glb)) continue;
    const anims = typeof e.anims === 'string' && FILE.test(e.anims) ? e.anims : undefined;
    out[mdl] = {
      glb: e.glb,
      anims,
      skins: typeof e.skins === 'number' && Number.isFinite(e.skins) ? e.skins : undefined,
      skinned: typeof e.skinned === 'boolean' ? e.skinned : undefined,
      bones: typeof e.bones === 'number' && Number.isFinite(e.bones) ? e.bones : undefined,
    };
  }
  return out;
}

export interface ModelFiles {
  meshUrl: string;
  /** Null when the model has no anim pack: it cannot be animated, so the loader refuses it. */
  animsUrl: string | null;
  skins: number;
}

/** The two URLs of an entry's model, or null when the index does not list it (or lists it without a mesh). */
export function resolveModelFiles(index: ModelIndex | null, entry: Pick<ModelEntry, 'game' | 'mdl'>): ModelFiles | null {
  const found = index?.[entry.mdl];
  if (!found) return null;
  try {
    return {
      meshUrl: gameAssetUrl(`mdl/${found.glb}`, entry.game),
      animsUrl: found.anims ? gameAssetUrl(`mdl/${found.anims}`, entry.game) : null,
      skins: found.skins ?? 1,
    };
  } catch {
    return null;
  }
}

// --- loading (the only impure part) ---------------------------------------------------------------------------------

interface Slot {
  promise: Promise<ModelIndex | null>;
  settledAt: number;
  index: ModelIndex | null;
}

const slots = new Map<GameId, Slot>();
/** A game whose index could not be had (404, offline) is asked again after this long, not on every figure. */
const RETRY_MS = 60_000;
const TIMEOUT_MS = 10_000;

export interface LoadIndexOptions {
  fetch?: typeof fetch;
  now?: () => number;
}

/**
 * The game's model index, fetched once and cached. Resolves (never rejects) with the index, or null when the channel
 * has none; a null answer is remembered for `RETRY_MS` so a build with no R2 behind it asks once, not per figure.
 */
export function loadModelIndex(game: GameId, opts: LoadIndexOptions = {}): Promise<ModelIndex | null> {
  const now = opts.now ?? Date.now;
  const known = slots.get(game);
  if (known && (known.index || known.settledAt === 0 || now() - known.settledAt < RETRY_MS)) return known.promise;
  const doFetch = opts.fetch ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!doFetch) return Promise.resolve(null);

  const slot: Slot = { promise: null as unknown as Promise<ModelIndex | null>, settledAt: 0, index: null };
  slot.promise = (async () => {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
    try {
      const res = await doFetch(gameAssetUrl('mdl/index.json', game), {
        signal: ctl?.signal,
        headers: { accept: 'application/json' },
      });
      if (!res.ok) return null;
      const parsed = parseModelIndex(await res.json());
      slot.index = Object.keys(parsed).length > 0 ? parsed : null;
      return slot.index;
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
      slot.settledAt = now();
    }
  })();
  slots.set(game, slot);
  return slot.promise;
}

/** Test seam. */
export function resetModelIndexForTests(): void {
  slots.clear();
}
