/**
 * Phase layers (plan H2.1; architecture.md §5). The ship exists twice: a 1971 `past` and a 2030
 * `present`. The player stands in one (`currentLayer`); every entity and brush entity has a layer
 * (`past`, `present` or `both`, the `layer` key the compiler writes). Brush models of the OTHER
 * layer are non-solid for the player and for traces; while the player "listens" the renderer draws
 * them as a cold ghost (client/phase-view.ts), otherwise not at all.
 *
 * Nothing here needs a per-tick hook: state changes only through direct calls and the I/O inputs of
 * `harmonic_phase_controller` (the compiler adds one to every level with layered content).
 *
 *   const phase = getPhase(world);            // attached when the controller spawns
 *   phase.setLayer('past');                   // flips collision both ways
 *   phase.setEntityLayer(ent, 'past');        // the Tuner's shift
 *   phase.isInPlayerLayer(enemy);             // combat immunity
 *   phase.setListening(true);                 // ghost the other layer
 *   phase.on('layerChanged', (e) => …);
 *
 * Environment-agnostic: no DOM.
 */
import type { Entity } from '../../tf2-game/sim/entity';
import { registerSp, SpEntity } from '../../sp-game/entities/base';
import type { SpWorld } from '../../sp-game/world/sp-world';
import type { PhaseLayer } from '../compiler/types';

export type { PhaseLayer };
/** `both` = exists in every layer (the default for anything untagged). */
export type EntityLayer = PhaseLayer | 'both';
/** How the renderer draws a layered brush model. */
export type PhaseDrawMode = 'normal' | 'hidden' | 'ghost';

export interface PhaseEvents {
  layerChanged: { from: PhaseLayer; to: PhaseLayer };
  entityShifted: { entity: Entity; from: EntityLayer; to: EntityLayer };
  listenChanged: { listening: boolean };
}
type Listener<K extends keyof PhaseEvents> = (e: PhaseEvents[K]) => void;

export const otherLayer = (l: PhaseLayer): PhaseLayer => (l === 'past' ? 'present' : 'past');

export function parseLayer(s: string | undefined | null): EntityLayer {
  const v = (s ?? '').trim().toLowerCase();
  return v === 'past' || v === 'present' ? v : 'both';
}

interface ModelRecord {
  layer: EntityLayer;
  /** Solidity the model had before the phase service touched it (what "in layer" restores). */
  baseSolid: boolean;
}

export class PhaseService {
  private layer: PhaseLayer;
  private listen = false;
  private readonly start: PhaseLayer;
  private readonly overrides = new Map<number, EntityLayer>();
  /** Brush models the service manages, by model index. */
  private readonly models = new Map<number, ModelRecord>();
  private readonly initialModels = new Map<number, EntityLayer>();
  private readonly listeners: { [K in keyof PhaseEvents]: Set<Listener<K>> } = {
    layerChanged: new Set(),
    entityShifted: new Set(),
    listenChanged: new Set(),
  };

  constructor(
    readonly world: SpWorld,
    startLayer: PhaseLayer = 'present',
  ) {
    this.layer = this.start = startLayer;
    // Layered brush entities straight from the entity lump (they may not have spawned yet).
    for (const e of world.bsp.entities) {
      const model = e.get('model');
      if (!model || model[0] !== '*') continue;
      const layer = parseLayer(e.get('layer'));
      if (layer !== 'both') this.initialModels.set(parseInt(model.slice(1), 10), layer);
    }
    for (const [m, layer] of this.initialModels) this.register(m, layer);
    this.applyAll();
  }

  // --- state ---------------------------------------------------------------------

  /** The layer the player is in. */
  get currentLayer(): PhaseLayer {
    return this.layer;
  }

  /** Whether the Tuner is listening (the other layer is drawn as a ghost). */
  get listening(): boolean {
    return this.listen;
  }

  setLayer(layer: PhaseLayer): void {
    if (layer === this.layer) return;
    const from = this.layer;
    this.layer = layer;
    this.applyAll();
    this.emit('layerChanged', { from, to: layer });
  }

  toggleLayer(): void {
    this.setLayer(otherLayer(this.layer));
  }

  setListening(on: boolean): void {
    if (on === this.listen) return;
    this.listen = on;
    this.emit('listenChanged', { listening: on });
  }

  // --- entities ------------------------------------------------------------------

  /** An entity's layer: a shift override, else its `layer` key, else `both`. */
  getLayer(ent: Entity): EntityLayer {
    if (ent === this.world.player) return this.layer;
    return this.overrides.get(ent.id) ?? parseLayer(ent.kvString('layer'));
  }

  /** The Tuner's shift: moves one entity (or brush entity) to a layer. */
  setEntityLayer(ent: Entity, layer: EntityLayer): void {
    const from = this.getLayer(ent);
    if (from === layer) return;
    this.overrides.set(ent.id, layer);
    if (ent.bspModel > 0) {
      this.register(ent.bspModel, layer);
      this.apply(ent.bspModel);
    }
    this.emit('entityShifted', { entity: ent, from, to: layer });
  }

  /** Whether the entity exists in the player's layer (`both` always does). */
  isInPlayerLayer(ent: Entity): boolean {
    const l = this.getLayer(ent);
    return l === 'both' || l === this.layer;
  }

  /** Whether a layer is the player's. */
  isLayerActive(l: EntityLayer): boolean {
    return l === 'both' || l === this.layer;
  }

  // --- rendering contract (client/phase-view.ts) ------------------------------------

  /** Brush models whose draw mode can differ from `'normal'`. */
  layeredModels(): number[] {
    return [...this.models.keys()];
  }

  drawMode(modelIndex: number): PhaseDrawMode {
    const r = this.models.get(modelIndex);
    if (!r || this.isLayerActive(r.layer)) return 'normal';
    return this.listen ? 'ghost' : 'hidden';
  }

  // --- checkpoint ----------------------------------------------------------------

  /** Level-start state (after a death reload): start layer, no listening, no shifts. */
  resetToStart(): void {
    const from = this.layer;
    this.overrides.clear();
    this.layer = this.start;
    const wasListening = this.listen;
    this.listen = false;
    for (const [m, r] of this.models) r.layer = this.initialModels.get(m) ?? 'both';
    this.applyAll();
    if (from !== this.layer) this.emit('layerChanged', { from, to: this.layer });
    if (wasListening) this.emit('listenChanged', { listening: false });
  }

  // --- events --------------------------------------------------------------------

  on<K extends keyof PhaseEvents>(type: K, fn: Listener<K>): () => void {
    this.listeners[type].add(fn);
    return () => this.listeners[type].delete(fn);
  }

  private emit<K extends keyof PhaseEvents>(type: K, e: PhaseEvents[K]): void {
    for (const fn of this.listeners[type]) fn(e);
  }

  // --- collision -----------------------------------------------------------------

  private register(model: number, layer: EntityLayer): void {
    const r = this.models.get(model);
    if (r) r.layer = layer;
    else
      this.models.set(model, {
        layer,
        baseSolid: this.world.mapCollision.isModelSolid(model),
      });
  }

  private applyAll(): void {
    for (const m of this.models.keys()) this.apply(m);
  }

  /** Solidity of one model: its own base solidity, and only while in the player's layer. */
  private apply(model: number): void {
    const r = this.models.get(model);
    if (!r) return;
    const solid = r.baseSolid && this.isLayerActive(r.layer);
    let owner: Entity | null = null;
    this.world.forEachEntity((e) => {
      if (e.bspModel === model) owner = e;
    });
    const brush = owner as (Entity & { setSolid?: (on: boolean) => void }) | null;
    if (brush && typeof brush.setSolid === 'function') brush.setSolid(solid);
    else this.world.mapCollision.setModelSolid(model, solid);
  }
}

const services = new WeakMap<SpWorld, PhaseService>();

/** The world's phase service, or null before it is attached. */
export function getPhase(world: SpWorld): PhaseService | null {
  return services.get(world) ?? null;
}

/** Attaches the phase service to a world (idempotent; the controller does it on spawn). */
export function attachPhase(world: SpWorld, startLayer: PhaseLayer = 'present'): PhaseService {
  let s = services.get(world);
  if (!s) {
    s = new PhaseService(world, startLayer);
    services.set(world, s);
  }
  return s;
}

/**
 * `harmonic_phase_controller` — the level's handle on the phase service.
 * Keys: `startlayer` (past|present). Inputs: `SetLayer past|present`, `Toggle`, `SetListen 0|1`,
 * `ToggleListen`. Outputs: `OnPast` / `OnPresent` (fired when the player's layer changes).
 */
export class HarmonicPhaseController extends SpEntity {
  private phase: PhaseService | null = null;

  override spawn(): void {
    super.spawn();
    const start = parseLayer(this.kvString('startlayer'));
    this.phase = attachPhase(this.sp, start === 'both' ? 'present' : start);
    this.phase.on('layerChanged', (e) =>
      this.fireOutput(e.to === 'past' ? 'OnPast' : 'OnPresent', this.sp.player),
    );
  }

  /** Called by the checkpoint restore (sp-game/level/checkpoint.ts). */
  afterRestore(): void {
    this.phase?.resetToStart();
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    const p = this.phase;
    if (!p) return super.acceptInput(input, value, activator, caller);
    switch (input.toLowerCase()) {
      case 'setlayer': {
        const l = parseLayer(value);
        if (l !== 'both') p.setLayer(l);
        return true;
      }
      case 'toggle':
        p.toggleLayer();
        return true;
      case 'setlisten':
        p.setListening(value.trim() !== '0' && value.trim().toLowerCase() !== 'false');
        return true;
      case 'togglelisten':
        p.setListening(!p.listening);
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

registerSp(HarmonicPhaseController, 'harmonic_phase_controller');
