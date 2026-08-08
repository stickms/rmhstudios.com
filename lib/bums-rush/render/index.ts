/**
 * Bum's Rush — the render pipeline's public surface.
 *
 * The component layer needs exactly one thing from this directory:
 * {@link createRenderer}. Everything else exported here is either the pure
 * geometry the tests and the HUD need (the stage fit, the camera transform) or
 * the palette, which the DOM chrome reads so a world tint moves the whole
 * screen and not just the canvas.
 *
 * Nothing here starts a loop. `frame()` draws once; the component owns the
 * `requestAnimationFrame` and its cancel-on-unmount.
 */

export {
  createRenderer,
  fitStage,
  worldTransform,
  visibleWorldRect,
  stageDpr,
  QualityLadder,
  DPR_LADDER,
  LOW_END_DPR_CAP,
  QUALITY_FULL,
  QUALITY_NO_BOIL,
  QUALITY_FEWER_PARTICLES,
  QUALITY_LOWER_DPR,
  QUALITY_HALF_RATE,
  type BumsRushRenderer,
  type RendererOptions,
  type RenderStats,
  type StageFit,
  type Transform2D,
  type CameraView,
  type DprOptions,
} from './renderer';

export {
  readBumPalette,
  withLevelPalette,
  seatInk,
  isDarkPaper,
  mixColor,
  withAlpha,
  parseColor,
  luminance,
  FALLBACK_PALETTE,
  type BumPalette,
} from './theme';

export { createBoil, vertexId, saltFromId, type BoilField } from './boil';
export { taperWidth, type StrokeOptions, type ShapeOptions } from './ink';
export { materialPatternId, PatternCache, type PatternId } from './patterns';
export {
  drawNote,
  measureNote,
  paintNote,
  bakeScaleFor,
  MAX_BAKE_PIXELS,
  type NoteLayout,
  type NoteOptions,
} from './worldbake';
export { FxSystem, type RenderSplat } from './fx';
export { drawSeat, type ActorContext } from './actors';
export { PAPER_TILE, RULE_SPACING, MARGIN_INSET, type Surface } from './paper';
