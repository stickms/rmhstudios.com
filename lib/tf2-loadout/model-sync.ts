/**
 * Deciding what the model sync has to do — the part that keeps it cheap.
 *
 * Every R2 write and every minute of CI time is money, so the sync is built to
 * do nothing when nothing changed:
 *
 *  1. **The Steam build id gates the whole run.** Valve ships a new build id with
 *     every game update; if it matches the one recorded in the state file (and the
 *     converter has not changed) the run ends before downloading anything.
 *  2. **A per-model source hash gates each upload.** The state file (one small
 *     object in the bucket) maps each published GLB to the hash of the game files
 *     it was built from. A model whose hash is unchanged is neither converted nor
 *     uploaded again; only new and changed models are.
 *  3. **The state file replaces listing the bucket.** One GET, no `ListObjects`.
 *
 * Pure and dependency-free so the CI scripts and the tests share it.
 */

/** Bump when the converter's output changes for the same game files: every model is then rebuilt once. */
export const MODEL_BUILDER_VERSION = 14;

export const STATE_KEY = 'tf2-models/_state.json';

export interface PublishedModel {
  /** Hash of everything the GLB was built from (game files + builder version). */
  src: string;
  /** Bytes stored in the bucket (after compression). */
  size: number;
}

export interface ModelState {
  v: 1;
  builder: number;
  /** Steam build id of the game the models were last synced from. */
  steamBuild: string | null;
  updatedAt: string;
  models: Record<string, PublishedModel>;
}

export interface WantedModel {
  /** The object's path under its channel prefix: `940.glb`, `940_soldier.glb`, `resource/ui/hudplayerhealth.res`. */
  name: string;
  /** Hash of the game files this model is built from. */
  src: string;
}

export interface SyncPlan {
  /** New or changed: convert and upload these. */
  upload: WantedModel[];
  /** Already published from identical source: leave alone. */
  unchanged: number;
  /** Published but no longer wanted (item left the schema). Never deleted unless pruning is asked for. */
  stale: string[];
}

export function emptyState(builder = MODEL_BUILDER_VERSION): ModelState {
  return { v: 1, builder, steamBuild: null, updatedAt: new Date(0).toISOString(), models: {} };
}

export function parseState(json: string | null | undefined): ModelState {
  if (!json) return emptyState();
  try {
    const raw = JSON.parse(json) as Partial<ModelState>;
    if (raw && raw.v === 1 && raw.models && typeof raw.models === 'object') {
      return {
        v: 1,
        builder: typeof raw.builder === 'number' ? raw.builder : 0,
        steamBuild: typeof raw.steamBuild === 'string' ? raw.steamBuild : null,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
        models: raw.models as Record<string, PublishedModel>,
      };
    }
  } catch {
    /* a corrupt state file means "start over", which is safe (just not cheap) */
  }
  return emptyState();
}

export interface RunDecision {
  run: boolean;
  reason: string;
}

/**
 * Should the expensive part (download the game, convert) run at all?
 * `steamBuild` is the current public build id; null when it could not be read,
 * which is treated as "unknown", never as "unchanged".
 */
export function shouldRun(
  state: ModelState,
  steamBuild: string | null,
  { force = false, builder = MODEL_BUILDER_VERSION }: { force?: boolean; builder?: number } = {},
): RunDecision {
  if (force) return { run: true, reason: 'forced' };
  if (Object.keys(state.models).length === 0) return { run: true, reason: 'nothing published yet' };
  if (state.builder !== builder) {
    return { run: true, reason: `converter changed (v${state.builder} → v${builder})` };
  }
  if (!steamBuild) return { run: true, reason: 'Steam build id unavailable' };
  if (state.steamBuild !== steamBuild) {
    return {
      run: true,
      reason: `game updated (build ${state.steamBuild ?? 'none'} → ${steamBuild})`,
    };
  }
  return { run: false, reason: `game build ${steamBuild} already synced` };
}

/**
 * `force` uploads everything wanted, even a file whose source hash is already published: the hash says
 * what the file was built from, not that the stored copy is good (a bad conversion, a lost object).
 */
export function planSync(
  state: ModelState,
  wanted: readonly WantedModel[],
  { force = false }: { force?: boolean } = {},
): SyncPlan {
  const upload: WantedModel[] = [];
  let unchanged = 0;
  const wantedNames = new Set<string>();
  for (const w of wanted) {
    wantedNames.add(w.name);
    if (!force && state.models[w.name]?.src === w.src) unchanged++;
    else upload.push(w);
  }
  const stale = Object.keys(state.models)
    .filter((n) => !wantedNames.has(n))
    .sort();
  return { upload, unchanged, stale };
}

/** The state after publishing `published` (and, if pruned, without `removed`). */
export function nextState(
  state: ModelState,
  published: Record<string, PublishedModel>,
  steamBuild: string | null,
  removed: readonly string[] = [],
  builder = MODEL_BUILDER_VERSION,
  now = new Date(),
): ModelState {
  const models = { ...state.models, ...published };
  for (const name of removed) delete models[name];
  return { v: 1, builder, steamBuild, updatedAt: now.toISOString(), models };
}
