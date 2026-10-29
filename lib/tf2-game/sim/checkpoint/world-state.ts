/**
 * A GameWorld written down mid-match and brought back exactly — the core of
 * peer-to-peer host migration (docs/tf2-game.md "Peer-to-peer play"): the host
 * sends one of these to its successor every couple of seconds, and the
 * successor restores it into a world it built from the same map.
 *
 * What is in it: every entity with every field (private ones too, not just
 * what snapshots carry), the rules and the mode's state, timers, scores, the
 * I/O queue, the random streams, lag-compensation history, the brush models'
 * transforms in the collision world, the per-world tables kept beside the
 * world (crit trackers, spy state, the TF object list, objectives, the bots'
 * manager), and whatever the caller adds (`extra`: the match host's players,
 * bot brains and console). What is not: the map and the nav mesh (both sides
 * load them; named by path, ./catalog.ts RootIndex) and module data.
 *
 * The test (checkpoint.test.ts): write a world down mid-match, restore it
 * into a fresh one, run both N ticks with the same inputs — identical.
 *
 * Environment-agnostic.
 */

import type { GameWorld } from '../world';
import type { Player } from '../player';
import { critTrackerTable } from '../weapons/crits';
import { spyStateTable } from '../weapons/spy-state';
import { worldObjectsTable } from '../buildings/base-object';
import { objectives, objectivesTable } from '../entities/objectives';
import { lastPlayedRoundTable } from '../entities/control-points';
import { botManagerTable, getBotManager } from '../../bots/brain/manager';
import { NavGenerator } from '../../bots/nav/generate';
import { reserveActionIds } from '../io';
import type { BrushModelState } from '../../world/map-collision';
import { RootIndex, withRoots, type GraphCatalog } from './catalog';
import { decodeGraph, encodeGraph, type DecodeReport, type EncodedGraph } from './graph';

export const WORLD_CHECKPOINT_VERSION = 1;

interface SideState {
  crit: Array<[Player, unknown]>;
  spy: Array<[Player, unknown]>;
  objects: unknown[] | null;
  objectives: unknown;
  lastRound: string | null;
  bots: unknown;
}

interface Root<X> {
  world: GameWorld;
  side: SideState;
  models: BrushModelState | null;
  extra: X;
}

export interface WorldCheckpoint {
  version: number;
  /** The catalog's fingerprint: a checkpoint from another build is refused. */
  catalog: string;
  map: string | null;
  tick: number;
  hasObjectives: boolean;
  hasBots: boolean;
  maxActionId: number;
  /** The human seats the match host had (hub player id, entity, account) — set by Tf2MatchHost.checkpoint. */
  seats?: Array<{ hubId: number; entity: number; name: string; userId?: string }>;
  graph: EncodedGraph;
}

export class CheckpointError extends Error {}

/** The world's own roots (never copied): its map, collision world, entity lump and the bots' nav mesh. */
function buildRoots(world: GameWorld, nav: object | null): RootIndex {
  const map = world.map;
  return new RootIndex([
    // Deepest first (an object is named by the first root that reaches it, and walking stops there).
    // The entity lump (the map's, or a test world's own): entities keep their keyvalues.
    ['lump', (world as unknown as { mapEntities: object }).mapEntities, 1],
    ['ents', map?.bsp.entities ?? null, 1],
    // Bots hold nav areas, points of interest and their positions.
    ['nav', nav, 3],
    ['collision', world.mapCollision, 0],
    // The map's and the BSP's top level only (the BSP's arrays are not state).
    ['map', map, 1],
    ['bsp', map?.bsp ?? null, 1],
  ]);
}

/** Cached per world (the map and its mesh do not change under a world; a new mesh rebuilds it). */
const rootCache = new WeakMap<GameWorld, { nav: object | null; index: RootIndex }>();
function rootsOf(world: GameWorld): RootIndex {
  const nav = botManagerTable.peek(world)?.mesh ?? null;
  const hit = rootCache.get(world);
  if (hit && hit.nav === nav) return hit.index;
  const index = buildRoots(world, nav);
  rootCache.set(world, { nav, index });
  return index;
}

function maxActionIdOf(world: GameWorld): number {
  let max = 0;
  world.forEachEntity((e) => {
    for (const out of e.outputs.values()) for (const a of out.actions) if (a.id > max) max = a.id;
  });
  return max;
}

/** Writes the world (and `extra`, which may reference its entities) down. */
export function captureWorld<X>(world: GameWorld, extra: X, catalog: GraphCatalog & { fingerprint?: string }): WorldCheckpoint {
  const crit: SideState['crit'] = [];
  const spy: SideState['spy'] = [];
  world.forEachPlayer((p) => {
    const c = critTrackerTable.peek(p);
    if (c) crit.push([p, c]);
    const s = spyStateTable.peek(p);
    if (s) spy.push([p, s]);
  });
  const obj = objectivesTable.peek(world) ?? null;
  const root: Root<X> = {
    world,
    side: {
      crit,
      spy,
      objects: worldObjectsTable.peek(world) ?? null,
      objectives: obj,
      lastRound: obj ? (lastPlayedRoundTable.peek(obj) ?? null) : null,
      bots: botManagerTable.peek(world) ?? null,
    },
    models: world.brushes ? world.brushes.captureModelState() : null,
    extra,
  };
  const graph = encodeGraph(root, withRoots(catalog, rootsOf(world)), {
    // A nav mesh still being generated is not copied: the successor generates its own.
    transient: (o) => o instanceof NavGenerator,
  });
  return {
    version: WORLD_CHECKPOINT_VERSION,
    catalog: catalog.fingerprint ?? '',
    map: world.map?.name ?? null,
    tick: world.tickCount,
    hasObjectives: obj !== null,
    hasBots: root.side.bots !== null,
    maxActionId: maxActionIdOf(world),
    graph,
  };
}

/**
 * Restores a checkpoint into `fresh` — a world just built on the same map with the same options and
 * mode (and the nav mesh provided when the original had one). `extraTemplate` is what `extra`
 * merges into (objects there are adopted, as the world's are). Returns the restored extra.
 */
export function restoreWorld<X>(
  fresh: GameWorld,
  cp: WorldCheckpoint,
  catalog: GraphCatalog & { fingerprint?: string; strict?: boolean },
  extraTemplate: X,
): { extra: X; report: DecodeReport } {
  if (cp.version !== WORLD_CHECKPOINT_VERSION) throw new CheckpointError(`checkpoint version ${cp.version}`);
  if (catalog.fingerprint !== undefined && catalog.strict !== false && cp.catalog !== catalog.fingerprint) {
    throw new CheckpointError('the checkpoint comes from another build');
  }
  if ((fresh.map?.name ?? null) !== cp.map) throw new CheckpointError(`map ${fresh.map?.name} ≠ ${cp.map}`);
  // The per-world tables the original had: built now, so they are adopted (their constructors' closures
  // are bound to this world).
  const obj = cp.hasObjectives ? objectives(fresh) : null;
  const bots = cp.hasBots ? getBotManager(fresh) : null;
  const template: Root<X> = {
    world: fresh,
    side: { crit: [], spy: [], objects: worldObjectsTable.peek(fresh) ?? null, objectives: obj, lastRound: null, bots },
    models: null,
    extra: extraTemplate,
  };
  const { root, report } = decodeGraph(cp.graph, withRoots(catalog, rootsOf(fresh)), template);
  if (root.world !== fresh) throw new CheckpointError('the world was not adopted');
  for (const [p, c] of root.side.crit) critTrackerTable.set(p, c as Parameters<typeof critTrackerTable.set>[1]);
  for (const [p, s] of root.side.spy) spyStateTable.set(p, s as Parameters<typeof spyStateTable.set>[1]);
  if (root.side.objects) worldObjectsTable.set(fresh, root.side.objects as Parameters<typeof worldObjectsTable.set>[1]);
  if (obj && root.side.objectives !== obj) throw new CheckpointError('the objectives were not adopted');
  if (obj && root.side.lastRound !== null) lastPlayedRoundTable.set(obj, root.side.lastRound);
  if (bots && root.side.bots !== bots) throw new CheckpointError("the bots' manager was not adopted");
  if (root.models && fresh.brushes && !fresh.brushes.restoreModelState(root.models)) {
    throw new CheckpointError('the brush models do not fit this map');
  }
  reserveActionIds(cp.maxActionId);
  return { extra: root.extra, report };
}
