/**
 * Bum's Rush — `lib/bums-rush/levels` barrel.
 *
 * Everything a caller (the game bootstrap, the world map, the dev-only level
 * editor of §6.5, tests) needs to load and trust level data, re-exported from
 * one place: schemas for parsing untrusted JSON, the loader-time assertions
 * that catch a level that parses but doesn't make sense, the manifest helpers,
 * and the loader that ties fetch + parse + validate + cache together.
 */

export {
  vec2Schema,
  rectSchema,
  shapeSchema,
  materialIdSchema,
  renderStyleSchema,
  signalIdSchema,
  signalOpSchema,
  propSchema,
  hazardSchema,
  snapshotPredicateSchema,
  objectiveSchema,
  levelPaletteSchema,
  checkpointSchema,
  geometryPieceSchema,
  decorationSchema,
  levelSchema,
  type ParsedLevel,
} from './schema';

export {
  checkContrast,
  checkSpawnCount,
  checkGoalInBounds,
  checkPropSpawnOverlap,
  checkObjectiveReferences,
  checkSignalProducers,
  checkBodyBudget,
  checkCheckpointSpacing,
  checkLaserFlashSafety,
  getLevelIssues,
  validateLevel,
} from './validate';

export {
  showdownRoundKindSchema,
  levelManifestEntrySchema,
  worldManifestEntrySchema,
  levelManifestSchema,
  parseLevelManifest,
  isSoloViable,
  soloViableLevels,
  findLevelEntry,
  nextLevel,
  prevLevel,
  worldCompletion,
  type WorldCompletion,
} from './manifest';

export { loadManifest, loadLevel, loadShowdownArena, loadWorld, clearLevelCache } from './loader';
