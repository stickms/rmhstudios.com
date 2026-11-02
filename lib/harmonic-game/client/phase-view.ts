/**
 * Phase view (plan H2.1): the adapter from the simulation's `PhaseService` to the world renderer.
 * Event-driven (no per-frame work): when the layer, a shift or the listen flag changes, every
 * layered brush model is told how to draw (`WorldRenderer.setModelVisibility`): the player's
 * layer normally, the other layer a cold ghost while listening and not at all otherwise.
 *
 * Structural types only, so it runs under Node tests with a fake renderer.
 */
import type { SpWorld } from '../../sp-game/world/sp-world';
import { attachPhase, getPhase, type PhaseDrawMode, type PhaseService } from '../sim/phase';

/** The slice of `WorldRenderer` this needs. */
export interface PhaseRenderTarget {
  setModelVisibility(modelIndex: number, mode: PhaseDrawMode): void;
}

/** Applies the current state now and on every change; returns the unsubscribe. */
export function bindPhaseView(phase: PhaseService, target: PhaseRenderTarget): () => void {
  const sync = (): void => {
    for (const m of phase.layeredModels()) target.setModelVisibility(m, phase.drawMode(m));
  };
  sync();
  const offs = [
    phase.on('layerChanged', sync),
    phase.on('entityShifted', sync),
    phase.on('listenChanged', sync),
  ];
  return () => offs.forEach((off) => off());
}

/** `SpContent.onLevelReady` for Harmonic: binds the world's phase service. */
export function onPhaseLevelReady(ctx: { sim: SpWorld; world: PhaseRenderTarget }): () => void {
  const phase = getPhase(ctx.sim) ?? attachPhase(ctx.sim);
  return bindPhaseView(phase, ctx.world);
}
