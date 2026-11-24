/**
 * Frozen violations of the steel-rules gate (lib/__tests__/steel-rules.test.ts), a ratchet per file: `count` is the
 * number of bordered group boxes, retired surface roles and ui/card imports the file has now, and `wave` is the Steel
 * wave that removes them (docs/superpowers/specs/2026-11-24-steel-dividers-design.md). A file may not gain a violation
 * past its count, a file not listed may not have one, a count that falls must be lowered here, and an entry whose file
 * is clean must be deleted. Nothing new goes in.
 */
export const STEEL_RULES_BASELINE: Record<string, { wave: string; count: number }> = {
  'components/kaikai-debt/AddDebtForm.tsx': { wave: 'wave 4', count: 2 },
  'components/kaikai-debt/AskDebtPanel.tsx': { wave: 'wave 4', count: 2 },
  'components/kaikai-debt/DebtDesks.tsx': { wave: 'wave 4', count: 2 },
  'components/kaikai-debt/DebtLogRow.tsx': { wave: 'wave 4', count: 1 },
  'components/kaikai-debt/KaikaiDebtCounter.tsx': { wave: 'wave 4', count: 3 },
  'components/kaikai-debt/stats/CreditScore.tsx': { wave: 'wave 4', count: 2 },
  'components/kaikai-debt/stats/DebtAnalytics.tsx': { wave: 'wave 4', count: 1 },
  'components/kaikai-debt/stats/Leaderboards.tsx': { wave: 'wave 4', count: 1 },
  'components/kaikai-debt/stats/StatTiles.tsx': { wave: 'wave 4', count: 1 },
  'components/kaikai-debt/stats/StatsTable.tsx': { wave: 'wave 4', count: 1 },
  'components/kaikai-debt/stats/chart-kit.tsx': { wave: 'wave 4', count: 2 },
  'components/optimization/OptimizationClosingSections.tsx': { wave: 'wave 4', count: 2 },
  'components/optimization/OptimizationHero.tsx': { wave: 'wave 4', count: 1 },
  'components/optimization/OptimizationResultSections.tsx': { wave: 'wave 4', count: 2 },
  'components/optimization/OptimizationRuntimeSections.tsx': { wave: 'wave 4', count: 4 },
  'components/party/ConnectionsPages.tsx': { wave: 'wave 4', count: 1 },
  'components/party/ControllerPad.tsx': { wave: 'wave 4', count: 1 },
  'components/party/PacksPage.tsx': { wave: 'wave 4', count: 1 },
  'components/rebar-rutabaga/Masthead.tsx': { wave: 'wave 4', count: 1 },
  'components/security/BreachesSection.tsx': { wave: 'wave 4', count: 9 },
  'components/security/SecurityPage.tsx': { wave: 'wave 4', count: 13 },
  'components/settings/ShortcutCapture.tsx': { wave: 'wave 2', count: 1 },
  'components/settings/TwoFactorSetup.tsx': { wave: 'wave 2', count: 1 },
  'components/studio/SampleBrowser.tsx': { wave: 'wave 4', count: 1 },
  'components/studio/creative/ChallengePanel.tsx': { wave: 'wave 4', count: 5 },
  'components/studio/creative/JamPanel.tsx': { wave: 'wave 4', count: 1 },
  'features/casino/ui/BaccaratControls.tsx': { wave: 'wave 4', count: 1 },
  'features/casino/ui/BaccaratGame.tsx': { wave: 'wave 4', count: 2 },
  'features/casino/ui/BaccaratLobby.tsx': { wave: 'wave 4', count: 2 },
  'features/casino/ui/BaccaratTable.tsx': { wave: 'wave 4', count: 2 },
  'features/casino/ui/BlackjackGame.tsx': { wave: 'wave 4', count: 2 },
  'features/casino/ui/BlackjackLobby.tsx': { wave: 'wave 4', count: 2 },
  'features/casino/ui/BlackjackSessionStats.tsx': { wave: 'wave 4', count: 1 },
  'features/casino/ui/HoldemGame.tsx': { wave: 'wave 4', count: 2 },
  'features/casino/ui/HoldemLobby.tsx': { wave: 'wave 4', count: 2 },
  'features/casino/ui/HoldemSessionStats.tsx': { wave: 'wave 4', count: 1 },
  'features/casino/ui/RouletteControls.tsx': { wave: 'wave 4', count: 1 },
  'features/casino/ui/RouletteGame.tsx': { wave: 'wave 4', count: 2 },
  'features/casino/ui/RouletteLobby.tsx': { wave: 'wave 4', count: 2 },
};
