/**
 * Frozen violations of the steel-rules gate (lib/__tests__/steel-rules.test.ts), a ratchet per file: `count` is the
 * number of bordered group boxes, retired surface roles and ui/card imports the file has now, and `wave` is the Steel
 * wave that removes them (docs/superpowers/specs/2026-11-24-steel-dividers-design.md). A file may not gain a violation
 * past its count, a file not listed may not have one, a count that falls must be lowered here, and an entry whose file
 * is clean must be deleted. Nothing new goes in.
 */
export const STEEL_RULES_BASELINE: Record<string, { wave: string; count: number }> = {
  'components/rebar-rutabaga/Masthead.tsx': { wave: 'wave 4', count: 1 },
  'components/settings/ShortcutCapture.tsx': { wave: 'wave 2', count: 1 },
  'components/settings/TwoFactorSetup.tsx': { wave: 'wave 2', count: 1 },
  'components/studio/SampleBrowser.tsx': { wave: 'wave 4', count: 1 },
  'components/studio/creative/ChallengePanel.tsx': { wave: 'wave 4', count: 5 },
  'components/studio/creative/JamPanel.tsx': { wave: 'wave 4', count: 1 },
  'components/toolbox/contrast/ContrastTool.tsx': { wave: 'wave 4', count: 1 },
};
