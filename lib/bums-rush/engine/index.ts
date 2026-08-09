/**
 * The engine's public surface.
 *
 * Everything outside `engine/` — the host loop, the renderer, the HUD, the
 * tests — imports from here and gets `Simulation` (types.ts) plus the handful
 * of pure helpers that have callers of their own. Nothing here exposes a
 * matter.js type, which is the seam that lets a guest client run the renderer
 * with no engine present at all (§9.5).
 */

export { createSimulation, createAccumulator } from './step';
export type { Accumulator, SimulationOptions } from './step';

export {
  createCamera,
  updateCamera,
  snapCamera,
  cameraContains,
  computeCameraTarget,
  computeEdgeIndicators,
} from './camera';
export type { Camera, CameraOptions, CameraSeat, EdgeIndicator } from './camera';

export { createRng, hashSeed, noise2 } from './rng';
export type { Rng } from './rng';

export { createSignalBus } from './signals';
export type { SignalBus } from './signals';

export { evaluateSnapshot, chainSize } from './objectives';
export type { ObjectiveContext, ObjectiveState } from './objectives';

export { ENGINE, P as PHYSICS_EFFECTIVE, RETUNED } from './tuning';
