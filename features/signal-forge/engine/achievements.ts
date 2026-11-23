/**
 * Signal Forge achievement rules: pure and client-safe. Given the facts of one finished run, which one-shot
 * achievement ids (lib/achievements/catalog.ts, group "Signal Forge") it satisfies. The score route grants them
 * (grantAchievement is idempotent), the same way Slice It! does; facts are client-declared like the score.
 */
/** What the client reports about a finished run (validated by score-schema.ts `signalForgeRunFacts`). */
export interface SignalForgeRunFacts {
  won: boolean;
  act: number;
  ascension: number;
  mode: 'timed' | 'steady';
  bursts: number;
  perfects: number;
  maxHit: number;
  elitesWon: number;
  bossesWon: number;
  deckSize: number;
  hpLeft: number;
}

const A = (slug: string) => `game.signal_forge.${slug}`;

export const SIGNAL_FORGE_ACHIEVEMENTS = {
  firstRun: A('first_run'),
  firstBoss: A('first_boss'),
  actThree: A('act_three'),
  victory: A('victory'),
  timedWin: A('timed_win'),
  ascension5: A('ascension_5'),
  ascension10: A('ascension_10'),
  bursts25: A('bursts_25'),
  perfect50: A('perfect_50'),
  bigHit: A('big_hit'),
  eliteHunter: A('elite_hunter'),
  leanDeck: A('lean_deck'),
  closeCall: A('close_call'),
} as const;

/** English names for the end screen (the catalog in lib/achievements is the source; achievements.test.ts keeps them in step). */
export const SIGNAL_FORGE_ACHIEVEMENT_NAMES: Record<string, string> = {
  [SIGNAL_FORGE_ACHIEVEMENTS.firstRun]: 'Strike the Anvil',
  [SIGNAL_FORGE_ACHIEVEMENTS.firstBoss]: 'Foundry Foreman',
  [SIGNAL_FORGE_ACHIEVEMENTS.actThree]: 'Into the Heart',
  [SIGNAL_FORGE_ACHIEVEMENTS.victory]: 'Forgemaster',
  [SIGNAL_FORGE_ACHIEVEMENTS.timedWin]: 'Metronome',
  [SIGNAL_FORGE_ACHIEVEMENTS.ascension5]: 'White Heat',
  [SIGNAL_FORGE_ACHIEVEMENTS.ascension10]: 'Star Forge',
  [SIGNAL_FORGE_ACHIEVEMENTS.bursts25]: 'Chain Reaction',
  [SIGNAL_FORGE_ACHIEVEMENTS.perfect50]: 'On the Beat',
  [SIGNAL_FORGE_ACHIEVEMENTS.bigHit]: 'Hammerfall',
  [SIGNAL_FORGE_ACHIEVEMENTS.eliteHunter]: 'Elite Hunter',
  [SIGNAL_FORGE_ACHIEVEMENTS.leanDeck]: 'Lean Machine',
  [SIGNAL_FORGE_ACHIEVEMENTS.closeCall]: 'Close Call',
};

export const BIG_HIT = 60;
export const LEAN_DECK = 15;

export function signalForgeAchievementsForRun(f: SignalForgeRunFacts): string[] {
  const S = SIGNAL_FORGE_ACHIEVEMENTS;
  const ids: string[] = [S.firstRun];
  if (f.bossesWon >= 1) ids.push(S.firstBoss);
  if (f.act >= 3) ids.push(S.actThree);
  if (f.bursts >= 25) ids.push(S.bursts25);
  if (f.mode === 'timed' && f.perfects >= 50) ids.push(S.perfect50);
  if (f.maxHit >= BIG_HIT) ids.push(S.bigHit);
  if (f.elitesWon >= 5) ids.push(S.eliteHunter);
  if (f.won) {
    ids.push(S.victory);
    if (f.mode === 'timed') ids.push(S.timedWin);
    if (f.ascension >= 5) ids.push(S.ascension5);
    if (f.ascension >= 10) ids.push(S.ascension10);
    if (f.deckSize <= LEAN_DECK) ids.push(S.leanDeck);
    if (f.hpLeft <= 5) ids.push(S.closeCall);
  }
  return ids;
}
