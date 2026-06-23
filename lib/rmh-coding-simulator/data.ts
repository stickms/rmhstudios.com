/**
 * RMH Coding Simulator — game content (data-driven).
 *
 * Generators, upgrades, the Reputation skill tree, Equity perks and
 * achievements. The numbers deliberately track Cookie Clicker's proven economy:
 * fourteen generators whose base prices climb ~14× per tier and whose ×1.15
 * per-unit cost growth, combined with cube-root prestige scaling and a second
 * (Equity) prestige layer, yield a 200h+ progression curve.
 */

import type {
  GeneratorDef,
  UpgradeDef,
  SkillDef,
  PerkDef,
  AchievementDef,
  GameState,
} from './types';

// ─── Generators (the "auto-coders") ─────────────────────────────────────────
// baseCps roughly tracks Cookie Clicker building output; baseCost climbs ~14×.

export const GENERATORS: GeneratorDef[] = [
  { id: 'intern', name: 'Intern', emoji: '🧑‍🎓', blurb: 'Eager, caffeinated, mostly copies from Stack Overflow.', baseCost: 15, baseCps: 0.1 },
  { id: 'junior', name: 'Junior Dev', emoji: '👩‍💻', blurb: 'Ships features and the occasional production incident.', baseCost: 100, baseCps: 1 },
  { id: 'mid', name: 'Mid-Level Dev', emoji: '🧑‍💻', blurb: 'Knows where the bodies are buried in the codebase.', baseCost: 1_100, baseCps: 8 },
  { id: 'senior', name: 'Senior Dev', emoji: '🦸', blurb: 'Deletes more code than they write. Net positive.', baseCost: 12_000, baseCps: 47 },
  { id: 'lead', name: 'Tech Lead', emoji: '🧭', blurb: 'Turns coffee and meetings into architecture diagrams.', baseCost: 130_000, baseCps: 260 },
  { id: 'copilot', name: 'AI Copilot', emoji: '🤖', blurb: 'Autocompletes whole files. Sometimes correctly.', baseCost: 1_400_000, baseCps: 1_400 },
  { id: 'farm', name: 'Code Monkey Farm', emoji: '🐒', blurb: 'Infinite monkeys, finite keyboards, eventual Shakespeare.', baseCost: 20_000_000, baseCps: 7_800 },
  { id: 'offshore', name: 'Offshore Studio', emoji: '🌏', blurb: 'The sun never sets on the RMH commit log.', baseCost: 330_000_000, baseCps: 44_000 },
  { id: 'devops', name: 'DevOps Pipeline', emoji: '🚢', blurb: 'Deploys to prod on a Friday. Fearlessly.', baseCost: 5_100_000_000, baseCps: 260_000 },
  { id: 'quantum', name: 'Quantum Compiler', emoji: '⚛️', blurb: 'Compiles all branches simultaneously until observed.', baseCost: 75_000_000_000, baseCps: 1_600_000 },
  { id: 'neural', name: 'Neural Net Cluster', emoji: '🧠', blurb: 'Dreams in TypeScript. Refactors while you sleep.', baseCost: 1_000_000_000_000, baseCps: 10_000_000 },
  { id: 'singularity', name: 'Singularity Engine', emoji: '🌀', blurb: 'Recursively self-improving. Please remain calm.', baseCost: 14_000_000_000_000, baseCps: 65_000_000 },
  { id: 'galactic', name: 'Galactic Dev Collective', emoji: '🛸', blurb: 'A federation of civilizations, all on the same Jira board.', baseCost: 170_000_000_000_000, baseCps: 430_000_000 },
  { id: 'codeverse', name: 'The Codeverse', emoji: '🌌', blurb: 'Reality is just RMH source code all the way down.', baseCost: 2_100_000_000_000_000, baseCps: 2_900_000_000 },
];

export const GENERATOR_MAP: Record<string, GeneratorDef> = Object.fromEntries(
  GENERATORS.map((g) => [g.id, g]),
);

/** ×1.15 compounding cost — the canonical idle-game growth rate. */
export const COST_GROWTH = 1.15;

// ─── Upgrades ────────────────────────────────────────────────────────────────
// Per-generator doubling upgrades are generated procedurally (Cookie Clicker
// style: unlock at owned-count thresholds, each ×2s that generator). Special
// global / click / synergy upgrades are hand-authored below.

const UPGRADE_TIER_UNLOCKS = [1, 5, 25, 50, 100, 150, 200, 250, 300, 400];
const UPGRADE_TIER_NAMES = [
  'Onboarding', 'Pair Programming', 'Code Review', 'Refactor', 'Test Coverage',
  'CI/CD Pipeline', 'Microservices', '10× Engineer', 'Legendary Commit', 'Mythic Codebase',
];

function buildGeneratorUpgrades(): UpgradeDef[] {
  const out: UpgradeDef[] = [];
  for (const gen of GENERATORS) {
    UPGRADE_TIER_UNLOCKS.forEach((unlock, i) => {
      // Cost scales steeply per tier so upgrades stay relevant but never trivial.
      const cost = Math.ceil(gen.baseCost * 10 * Math.pow(12, i));
      out.push({
        id: `${gen.id}-t${i}`,
        name: `${gen.name}: ${UPGRADE_TIER_NAMES[i]}`,
        emoji: gen.emoji,
        desc: `${gen.name} output ×2. (Requires ${unlock} ${gen.name}${unlock > 1 ? 's' : ''}.)`,
        cost,
        genMult: { genId: gen.id, factor: 2 },
        requiresGen: { genId: gen.id, count: unlock },
      });
    });
  }
  return out;
}

const SPECIAL_UPGRADES: UpgradeDef[] = [
  // ── Click power line ──
  { id: 'click-1', name: 'Mechanical Keyboard', emoji: '⌨️', desc: 'Clicking writes 2× the code. Clicky clacky.', cost: 100, clickMult: 2, requiresLifetime: 50 },
  { id: 'click-2', name: 'Ergonomic Setup', emoji: '🪑', desc: 'Clicking writes 2× the code. No more wrist pain.', cost: 2_000, clickMult: 2, requiresLifetime: 1_000 },
  { id: 'click-3', name: 'Dual Monitors', emoji: '🖥️', desc: 'Clicking writes 2× the code. Twice the screen real estate.', cost: 50_000, clickMult: 2, requiresLifetime: 25_000 },
  { id: 'click-4', name: 'Vim Keybindings', emoji: '📟', desc: 'Clicks gain +1% of your total LoC/sec. (You can now exit the editor.)', cost: 500_000, clickFromCps: 0.01, requiresLifetime: 250_000 },
  { id: 'click-5', name: 'Wrist Braces of Power', emoji: '🦾', desc: 'Clicking writes 3× the code.', cost: 25_000_000, clickMult: 3, requiresLifetime: 10_000_000 },
  { id: 'click-6', name: 'Neural Input Jack', emoji: '🔌', desc: 'Clicks gain an extra +3% of your total LoC/sec.', cost: 5_000_000_000, clickFromCps: 0.03, requiresLifetime: 1_000_000_000 },
  { id: 'click-7', name: 'Thought-to-Code Interface', emoji: '💭', desc: 'Clicking writes 4× the code. Just think it.', cost: 2_000_000_000_000, clickMult: 4, requiresLifetime: 500_000_000_000 },

  // ── Global production line (espresso / culture) ──
  { id: 'glob-coffee', name: 'Office Espresso Machine', emoji: '☕', desc: 'All developers produce +1% faster.', cost: 5_000, globalMult: 1.01, requiresLifetime: 2_000 },
  { id: 'glob-snacks', name: 'Unlimited Snacks', emoji: '🍪', desc: 'All developers produce +2% faster.', cost: 250_000, globalMult: 1.02, requiresLifetime: 100_000 },
  { id: 'glob-standup', name: 'Efficient Standups', emoji: '🗣️', desc: 'All developers produce +3% faster. (Could have been an email.)', cost: 10_000_000, globalMult: 1.03, requiresLifetime: 5_000_000 },
  { id: 'glob-remote', name: 'Remote-First Culture', emoji: '🏡', desc: 'All developers produce +5% faster.', cost: 1_000_000_000, globalMult: 1.05, requiresLifetime: 500_000_000 },
  { id: 'glob-fourday', name: 'Four-Day Work Week', emoji: '📅', desc: 'All developers produce +10% faster. Counterintuitively.', cost: 500_000_000_000, globalMult: 1.1, requiresLifetime: 200_000_000_000 },
  { id: 'glob-flow', name: 'The Flow State', emoji: '🌊', desc: 'All developers produce +15% faster.', cost: 100_000_000_000_000, globalMult: 1.15, requiresLifetime: 50_000_000_000_000 },

  // ── Golden commit line ──
  { id: 'gold-lint', name: 'Aggressive Linter', emoji: '🧹', desc: 'Golden Commits appear 30% more often.', cost: 777_777, goldenFreqMult: 1.3, requiresLifetime: 200_000 },
  { id: 'gold-bounty', name: 'Bug Bounty Program', emoji: '🏆', desc: 'Golden Commits are 50% more rewarding.', cost: 77_777_777, goldenPowerMult: 1.5, requiresLifetime: 20_000_000 },
  { id: 'gold-observability', name: 'Full Observability', emoji: '📡', desc: 'Golden Commits appear 30% more often and are 30% more rewarding.', cost: 7_777_777_777, goldenFreqMult: 1.3, goldenPowerMult: 1.3, requiresLifetime: 2_000_000_000 },
];

export const UPGRADES: UpgradeDef[] = [...buildGeneratorUpgrades(), ...SPECIAL_UPGRADES];
export const UPGRADE_MAP: Record<string, UpgradeDef> = Object.fromEntries(
  UPGRADES.map((u) => [u.id, u]),
);

// ─── Reputation skill tree ("Ship It" prestige spend) ───────────────────────

export const SKILLS: SkillDef[] = [
  // Tier 0 — foundations
  { id: 'kickstart', name: 'Kickstarter Funding', emoji: '💵', desc: 'Begin each new run with 1,000 free Lines of Code.', cost: 1, startingLoc: 1_000, tier: 0 },
  { id: 'momentum', name: 'Startup Momentum', emoji: '🚀', desc: '+25% to all production, permanently.', cost: 2, globalMult: 1.25, tier: 0 },
  { id: 'caffeine', name: 'Caffeine Dependency', emoji: '☕', desc: 'Clicking writes 3× the code, permanently.', cost: 2, clickMult: 3, tier: 0 },

  // Tier 1
  { id: 'angel', name: 'Angel Investor', emoji: '👼', desc: 'Begin each new run with 1,000,000 Lines of Code.', cost: 8, requires: ['kickstart'], startingLoc: 1_000_000, tier: 1 },
  { id: 'scale', name: 'Scaling Up', emoji: '📈', desc: '+50% to all production.', cost: 10, requires: ['momentum'], globalMult: 1.5, tier: 1 },
  { id: 'hotkeys', name: 'Hotkey Mastery', emoji: '⚡', desc: 'Clicks gain +2% of total LoC/sec.', cost: 8, requires: ['caffeine'], clickFromCps: 0.02, tier: 1 },

  // Tier 2
  { id: 'overnight', name: 'Overnight Builds', emoji: '🌙', desc: '+4 hours to the offline earnings cap.', cost: 20, requires: ['angel'], offlineHours: 4, tier: 2 },
  { id: 'unicorn', name: 'Unicorn Valuation', emoji: '🦄', desc: '+100% to all production.', cost: 40, requires: ['scale'], globalMult: 2, tier: 2 },
  { id: 'goldeneye', name: 'Golden Eye', emoji: '👁️', desc: 'Golden Commits appear 50% more often.', cost: 25, requires: ['hotkeys'], goldenFreqMult: 1.5, tier: 2 },

  // Tier 3
  { id: 'cloud', name: 'Cloud Autoscaling', emoji: '☁️', desc: 'Offline earnings run at 80% efficiency (up from 50%).', cost: 60, requires: ['overnight'], offlineEffMult: 1.6, tier: 3 },
  { id: 'megacorp', name: 'Megacorp Synergy', emoji: '🏢', desc: '+150% to all production.', cost: 120, requires: ['unicorn'], globalMult: 2.5, tier: 3 },
  { id: 'jackpot', name: 'Commit Jackpot', emoji: '🎰', desc: 'Golden Commits are twice as rewarding.', cost: 80, requires: ['goldeneye'], goldenPowerMult: 2, tier: 3 },

  // Tier 4 — capstones
  { id: 'seed-vault', name: 'Seed Vault', emoji: '🌱', desc: 'Begin each new run with 1 Billion Lines of Code.', cost: 250, requires: ['cloud', 'megacorp'], startingLoc: 1_000_000_000, tier: 4 },
  { id: 'singularity-cult', name: 'The Singularity Cult', emoji: '🌀', desc: '+300% to all production. All hail the recursion.', cost: 500, requires: ['megacorp', 'jackpot'], globalMult: 4, tier: 4 },
];
export const SKILL_MAP: Record<string, SkillDef> = Object.fromEntries(
  SKILLS.map((s) => [s.id, s]),
);

// ─── Equity perks ("IPO" / Ascension prestige spend) ─────────────────────────

export const PERKS: PerkDef[] = [
  { id: 'ipo-bonus', name: 'Public Offering', emoji: '🔔', desc: '+50% to all production, forever (survives every reset).', cost: 1, globalMult: 1.5 },
  { id: 'founder-equity', name: 'Founder Equity', emoji: '🧑‍✈️', desc: '+100% to all production, forever.', cost: 3, globalMult: 2, requires: ['ipo-bonus'] },
  { id: 'board-seat', name: 'Board Seat', emoji: '🪑', desc: 'Begin every run with 1 Trillion Lines of Code.', cost: 5, startingLoc: 1_000_000_000_000, requires: ['ipo-bonus'] },
  { id: 'market-maker', name: 'Market Maker', emoji: '💹', desc: 'Golden Commits appear twice as often and are twice as rewarding.', cost: 8, goldenFreqMult: 2, goldenPowerMult: 2, requires: ['founder-equity'] },
  { id: 'monopoly', name: 'Tech Monopoly', emoji: '👑', desc: '+400% to all production, forever.', cost: 20, globalMult: 5, requires: ['founder-equity'] },
  { id: 'time-machine', name: 'R&D Time Machine', emoji: '⏳', desc: 'Offline earnings: 100% efficiency and +12h cap.', cost: 15, offlineEffMult: 2, offlineHours: 12, requires: ['board-seat'] },
  { id: 'autonomous', name: 'Fully Autonomous Studio', emoji: '🛰️', desc: '+1000% to all production. The studio runs itself.', cost: 75, globalMult: 11, requires: ['monopoly'] },
];
export const PERK_MAP: Record<string, PerkDef> = Object.fromEntries(
  PERKS.map((p) => [p.id, p]),
);

// ─── Achievements ─────────────────────────────────────────────────────────────

function totalGenerators(s: GameState): number {
  return Object.values(s.generators).reduce((a, b) => a + b, 0);
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // LoC milestones
  { id: 'first-line', name: 'Hello, World', emoji: '👋', desc: 'Write your first Line of Code.', check: (s) => s.totalLoc >= 1 },
  { id: 'loc-1k', name: 'It Compiles', emoji: '✅', desc: 'Write 1,000 lifetime Lines of Code.', check: (s) => s.totalLoc >= 1_000 },
  { id: 'loc-1m', name: 'Shipping Code', emoji: '📦', desc: 'Write 1 million lifetime Lines of Code.', check: (s) => s.totalLoc >= 1_000_000 },
  { id: 'loc-1b', name: 'Legacy System', emoji: '🏛️', desc: 'Write 1 billion lifetime Lines of Code.', check: (s) => s.totalLoc >= 1_000_000_000 },
  { id: 'loc-1t', name: 'Codebase Singularity', emoji: '🌌', desc: 'Write 1 trillion lifetime Lines of Code.', check: (s) => s.totalLoc >= 1_000_000_000_000 },
  { id: 'loc-1qa', name: 'Reality.exe', emoji: '🪐', desc: 'Write 1 quadrillion lifetime Lines of Code.', check: (s) => s.totalLoc >= 1e15 },

  // Click milestones
  { id: 'click-100', name: 'Carpal Tunnel I', emoji: '🖱️', desc: 'Click 100 times.', check: (s) => s.totalClicks >= 100 },
  { id: 'click-1k', name: 'Carpal Tunnel II', emoji: '🩹', desc: 'Click 1,000 times.', check: (s) => s.totalClicks >= 1_000 },
  { id: 'click-10k', name: 'Carpal Tunnel III', emoji: '🦿', desc: 'Click 10,000 times.', check: (s) => s.totalClicks >= 10_000 },
  { id: 'click-power', name: 'Artisanal Code', emoji: '🎨', desc: 'Hand-write 1 million Lines of Code by clicking.', check: (s) => s.handmadeLoc >= 1_000_000 },

  // Generator milestones
  { id: 'first-hire', name: "You're Hired", emoji: '🤝', desc: 'Hire your first developer.', check: (s) => totalGenerators(s) >= 1 },
  { id: 'team-50', name: 'Series A', emoji: '🧑‍🤝‍🧑', desc: 'Own 50 generators total.', check: (s) => totalGenerators(s) >= 50 },
  { id: 'team-200', name: 'Scale-Up', emoji: '🏢', desc: 'Own 200 generators total.', check: (s) => totalGenerators(s) >= 200 },
  { id: 'team-500', name: 'Big Tech', emoji: '🌆', desc: 'Own 500 generators total.', check: (s) => totalGenerators(s) >= 500 },
  { id: 'intern-50', name: 'Intern Army', emoji: '🧑‍🎓', desc: 'Own 50 Interns.', check: (s) => (s.generators['intern'] ?? 0) >= 50 },
  { id: 'codeverse-1', name: 'We Are The Code', emoji: '🌌', desc: 'Own a Codeverse.', check: (s) => (s.generators['codeverse'] ?? 0) >= 1 },
  { id: 'one-of-each', name: 'Full Stack', emoji: '🥞', desc: 'Own at least one of every generator.', check: (s) => GENERATORS.every((g) => (s.generators[g.id] ?? 0) >= 1) },

  // Upgrades
  { id: 'upg-10', name: 'Continuous Improvement', emoji: '🔧', desc: 'Buy 10 upgrades.', check: (s) => s.upgrades.length >= 10 },
  { id: 'upg-50', name: 'Tech Debt? Never Heard', emoji: '🧰', desc: 'Buy 50 upgrades.', check: (s) => s.upgrades.length >= 50 },

  // Golden commits
  { id: 'golden-1', name: 'Merged!', emoji: '✨', desc: 'Click a Golden Commit.', check: (s) => s.goldenClicks >= 1 },
  { id: 'golden-50', name: 'Commit Hunter', emoji: '🎯', desc: 'Click 50 Golden Commits.', check: (s) => s.goldenClicks >= 50 },
  { id: 'golden-250', name: 'Git Whisperer', emoji: '🧙', desc: 'Click 250 Golden Commits.', check: (s) => s.goldenClicks >= 250 },

  // Prestige
  { id: 'ship-1', name: 'Ship It!', emoji: '🚀', desc: 'Ship your first product (prestige once).', check: (s) => s.shipCount >= 1 || s.ascensionCount >= 1 },
  { id: 'ship-10', name: 'Serial Shipper', emoji: '🛳️', desc: 'Ship 10 products.', check: (s) => s.shipCount >= 10 },
  { id: 'rep-100', name: 'Reputable', emoji: '⭐', desc: 'Earn 100 Reputation in a single ascension.', check: (s) => s.reputationEarned >= 100 },
  { id: 'rep-1000', name: 'Industry Legend', emoji: '🌟', desc: 'Earn 1,000 Reputation in a single ascension.', check: (s) => s.reputationEarned >= 1_000 },
  { id: 'ipo-1', name: 'Ring the Bell', emoji: '🔔', desc: 'Take your studio public (ascend once).', check: (s) => s.ascensionCount >= 1 },
  { id: 'ipo-5', name: 'Conglomerate', emoji: '🏦', desc: 'Ascend 5 times.', check: (s) => s.ascensionCount >= 5 },

  // AI Architect
  { id: 'ai-1', name: 'Rubber Duck', emoji: '🦆', desc: 'Consult the AI Architect for the first time.', check: (s) => s.aiCalls >= 1 },
  { id: 'ai-25', name: 'Pair Programmer', emoji: '🧑‍🔧', desc: 'Consult the AI Architect 25 times.', check: (s) => s.aiCalls >= 25 },

  // Time
  { id: 'play-1h', name: 'In the Zone', emoji: '⏱️', desc: 'Play for 1 hour total.', check: (s) => s.playtime >= 3_600 },
  { id: 'play-10h', name: 'Crunch Time', emoji: '🌃', desc: 'Play for 10 hours total.', check: (s) => s.playtime >= 36_000 },
];
export const ACHIEVEMENT_MAP: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

/** Each earned achievement grants a small permanent global production bonus. */
export const ACHIEVEMENT_BONUS_PER = 0.01; // +1% each

// ─── Prestige scaling constants ───────────────────────────────────────────────
// Cube-root style scaling keeps the long game honest: ten-fold more lifetime
// LoC yields only a bit over 2× the Reputation, so each "Ship It" must clear a
// meaningfully higher bar than the last.

/** Reputation you'd be GIVEN for the current lifetime LoC. */
export function reputationForLifetime(lifetimeLoc: number): number {
  if (lifetimeLoc < 1e6) return 0;
  return Math.floor(Math.cbrt(lifetimeLoc / 1e6));
}

/** Equity granted on ascension for total Reputation earned this run. */
export function equityForReputation(reputationEarned: number): number {
  if (reputationEarned < 100) return 0;
  return Math.floor(Math.sqrt(reputationEarned / 100));
}

/** +% production per earned Reputation star. */
export const REP_BONUS_PER_STAR = 0.02; // +2%
/** +% production per earned Equity. */
export const EQUITY_BONUS_PER = 0.5; // +50%

/** Minimum Reputation required before the IPO (ascension) is offered. */
export const ASCEND_MIN_REPUTATION = 100;
