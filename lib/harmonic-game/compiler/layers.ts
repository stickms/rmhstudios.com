/**
 * Phase layers in the compiler (plan H2.1). `expandLayers` rewrites a `LevelSource` so that the
 * engine, which knows nothing of layers, still sees plain brushes and entities:
 *
 * - World brushes tagged `past` / `present` leave the world and become the brushes of two
 *   auto-generated `func_brush` entities, `harmonic_layer_past` and `harmonic_layer_present` —
 *   ONE brush model per layer (decision: per-room models only pay off once there is room culling,
 *   H5.2; the model's PVS clusters come from its bounds either way). Brush order inside a model is
 *   source order, so the output is deterministic.
 * - An entity's brushes honour `layer` too: when every layered brush of an entity carries the same
 *   layer (and the rest are `both`/untagged), the entity takes it; `EntitySource.layer` states it
 *   outright. Conflicting layers inside one entity are an error — split the entity.
 * - Every entity whose layer is not `both` gets a `layer` key (absent = `both`).
 * - A level with any layered content gets one `harmonic_phase_controller` (`targetname`
 *   `harmonic_phase`, key `startlayer`) unless the source already placed one. Its spawn attaches the
 *   `PhaseService` (sim/phase.ts), so no client hook is needed and the start checkpoint is taken
 *   with the right collision.
 *
 * Pure data in, pure data out; nothing here touches the DOM.
 */
import type { BrushSource, EntitySource, LevelSource, PhaseLayer } from './types';

export const PHASE_CONTROLLER_CLASS = 'harmonic_phase_controller';
export const PHASE_CONTROLLER_NAME = 'harmonic_phase';
export const LAYER_BRUSH_NAMES = {
  past: 'harmonic_layer_past',
  present: 'harmonic_layer_present',
} as const;

function layerOf(b: { layer?: PhaseLayer | 'both' }): PhaseLayer | null {
  return b.layer === 'past' || b.layer === 'present' ? b.layer : null;
}

function entityLayer(e: EntitySource, where: string): PhaseLayer | null {
  let layer = layerOf(e);
  for (const b of e.brushes ?? []) {
    const l = layerOf(b);
    if (!l) continue;
    if (layer && layer !== l)
      throw new Error(
        `${where}: ${e.classname} mixes layers "${layer}" and "${l}" (split it into one entity per layer)`,
      );
    layer = l;
  }
  return layer;
}

export function expandLayers(src: LevelSource): LevelSource {
  const plain: BrushSource[] = [];
  const byLayer: Record<PhaseLayer, BrushSource[]> = { past: [], present: [] };
  for (const b of src.world) {
    const l = layerOf(b);
    if (l) byLayer[l].push(b);
    else plain.push(b);
  }
  let any = byLayer.past.length > 0 || byLayer.present.length > 0 || src.startLayer !== undefined;
  const entities: EntitySource[] = src.entities.map((e, i) => {
    const l = entityLayer(e, `${src.id}: entity #${i}`);
    if (!l) return e;
    any = true;
    return { ...e, keys: { ...e.keys, layer: l } };
  });
  if (!any) return src;

  if (!entities.some((e) => e.classname === PHASE_CONTROLLER_CLASS)) {
    entities.push({
      classname: PHASE_CONTROLLER_CLASS,
      keys: { targetname: PHASE_CONTROLLER_NAME, startlayer: src.startLayer ?? 'present' },
    });
  }
  for (const l of ['past', 'present'] as const) {
    if (byLayer[l].length === 0) continue;
    entities.push({
      classname: 'func_brush',
      keys: { targetname: LAYER_BRUSH_NAMES[l], layer: l },
      brushes: byLayer[l],
    });
  }
  return { ...src, world: plain, entities };
}
