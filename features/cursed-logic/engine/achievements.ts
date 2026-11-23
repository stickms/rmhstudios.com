/**
 * Which of Cursed Logic's achievements one finished run earns. Pure and client-safe, so the rules are tested
 * without a database; the score route applies the result with `grantAchievement` / `progressAchievement` after the
 * run has been validated. The definitions (names, tiers, coins) are the "Cursed Logic" group in
 * `lib/achievements/catalog.ts`; ids are permanent.
 */
import { PACT_IDS, type CursedLogicScoreBody } from './score-schema';

export const CL_ACHIEVEMENTS = {
  firstDuel: 'game.cursed-logic.first_duel',
  sector3: 'game.cursed-logic.sector_3',
  sector5: 'game.cursed-logic.sector_5',
  rootAccess: 'game.cursed-logic.root_access',
  flawless: 'game.cursed-logic.flawless',
  flawless3: 'game.cursed-logic.flawless_3',
  quick: 'game.cursed-logic.quick',
  ironWill: 'game.cursed-logic.iron_will',
  pact: 'game.cursed-logic.pact',
  cursedRun: 'game.cursed-logic.cursed_run',
  score50k: 'game.cursed-logic.score_50k',
  duels50: 'game.cursed-logic.duels_50',
  runs10: 'game.cursed-logic.runs_10',
} as const;

/** A won duel this short earns Fast Execution. */
export const QUICK_DUEL_ROUNDS = 4;

export interface RunAchievements {
  grant: string[];
  progress: { id: string; by: number }[];
}

export function achievementsForRun(run: CursedLogicScoreBody): RunAchievements {
  const grant: string[] = [];
  const won = run.duelsWon > 0;
  if (won) grant.push(CL_ACHIEVEMENTS.firstDuel);
  if (run.sector >= 3) grant.push(CL_ACHIEVEMENTS.sector3);
  if (run.sector >= 5) grant.push(CL_ACHIEVEMENTS.sector5);
  if (run.victory) grant.push(CL_ACHIEVEMENTS.rootAccess);
  if (run.flawlessDuels >= 1) grant.push(CL_ACHIEVEMENTS.flawless);
  if (run.flawlessDuels >= 3) grant.push(CL_ACHIEVEMENTS.flawless3);
  if (won && run.fastestDuel > 0 && run.fastestDuel <= QUICK_DUEL_ROUNDS) grant.push(CL_ACHIEVEMENTS.quick);
  if (run.victory && run.neverBelowHalf) grant.push(CL_ACHIEVEMENTS.ironWill);
  if (won && run.pacts.length > 0) grant.push(CL_ACHIEVEMENTS.pact);
  if (run.victory && PACT_IDS.every((p) => run.pacts.includes(p))) grant.push(CL_ACHIEVEMENTS.cursedRun);
  if (run.score >= 50_000) grant.push(CL_ACHIEVEMENTS.score50k);

  const progress: RunAchievements['progress'] = [{ id: CL_ACHIEVEMENTS.runs10, by: 1 }];
  if (run.duelsWon > 0) progress.push({ id: CL_ACHIEVEMENTS.duels50, by: run.duelsWon });
  return { grant, progress };
}
