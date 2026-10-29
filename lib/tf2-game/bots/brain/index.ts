/**
 * TFBots: the brain (./tf-bot-brain.ts), its skill by difficulty
 * (./difficulty.ts), what a world's bots share (./manager.ts) and the
 * scenario logic (./objective.ts).
 */

export {
  TFBotBrain,
  tfBotBrainFactory,
  tfBotBrainFactoryAt,
  type BotStats,
  type TFBotBrainOptions,
} from './tf-bot-brain';
export { BOT_SKILLS, botSkill, type BotSkill } from './difficulty';
export {
  BotManager,
  cachedNavMesh,
  getBotManager,
  provideNavMesh,
  NAV_GEN_TRACES_PER_TICK,
} from './manager';
export { objectiveGoal, botRole, type BotRole, type ObjectiveGoal } from './objective';
