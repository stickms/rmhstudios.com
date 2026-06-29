import type { GameState, ObjectiveDef } from '@/lib/temple-of-joy/types';

const totalSources = (s: GameState) => Object.values(s.sources).reduce((a, n) => a + (n ?? 0), 0);
const distinctSources = (s: GameState) => Object.values(s.sources).filter((n) => n > 0).length;

/**
 * Standing objectives that pay out a one-time meta reward (mostly Radiance) the
 * first time their condition is met. They give long-tail goals beyond raw
 * numbers, and feed the Ascension economy. Predicates are pure functions of game
 * state and are audited cheaply every tick.
 */
export const OBJECTIVES: ObjectiveDef[] = [
  // ── Milestone (happiness / lifetime) ──
  { id: 'obj_lifetime_1e6',  name: 'Joyful Beginnings', description: 'Reach 1e6 lifetime happiness.',  category: 'milestone', reward: { blissShards: 25 },  check: (s) => s.lifetimeHappiness >= 1e6 },
  { id: 'obj_lifetime_1e9',  name: 'River of Joy',      description: 'Reach 1e9 lifetime happiness.',  category: 'milestone', reward: { blissShards: 100 }, check: (s) => s.lifetimeHappiness >= 1e9 },
  { id: 'obj_lifetime_1e12', name: 'Ocean of Joy',      description: 'Reach 1e12 lifetime happiness.', category: 'milestone', reward: { radiance: 1 },      check: (s) => s.lifetimeHappiness >= 1e12 },
  { id: 'obj_lifetime_1e15', name: 'Sea of Stars',      description: 'Reach 1e15 lifetime happiness.', category: 'milestone', reward: { radiance: 3 },      check: (s) => s.lifetimeHappiness >= 1e15 },
  { id: 'obj_lifetime_1e18', name: 'Galaxy of Joy',     description: 'Reach 1e18 lifetime happiness.', category: 'milestone', reward: { radiance: 8 },      check: (s) => s.lifetimeHappiness >= 1e18 },
  { id: 'obj_lifetime_1e24', name: 'Universe of Joy',   description: 'Reach 1e24 lifetime happiness.', category: 'milestone', reward: { radiance: 25 },     check: (s) => s.lifetimeHappiness >= 1e24 },

  // ── Mastery (sources / upgrades / relics) ──
  { id: 'obj_sources_100',   name: 'Collector',         description: 'Own 100 total sources.',          category: 'mastery', reward: { blissShards: 30 },  check: (s) => totalSources(s) >= 100 },
  { id: 'obj_sources_1000',  name: 'Hoarder of Bliss',  description: 'Own 1,000 total sources.',         category: 'mastery', reward: { radiance: 1 },      check: (s) => totalSources(s) >= 1000 },
  { id: 'obj_sources_5000',  name: 'Architect',         description: 'Own 5,000 total sources.',         category: 'mastery', reward: { radiance: 5 },      check: (s) => totalSources(s) >= 5000 },
  { id: 'obj_distinct_20',   name: 'Diversified',       description: 'Own 20 distinct source types.',    category: 'mastery', reward: { blissShards: 50 },  check: (s) => distinctSources(s) >= 20 },
  { id: 'obj_distinct_40',   name: 'Patron of All',     description: 'Own 40 distinct source types.',    category: 'mastery', reward: { radiance: 3 },      check: (s) => distinctSources(s) >= 40 },
  { id: 'obj_upgrades_50',   name: 'Self-Improver',     description: 'Purchase 50 upgrades.',            category: 'mastery', reward: { blissShards: 40 },  check: (s) => s.upgrades.size >= 50 },
  { id: 'obj_upgrades_150',  name: 'Enlightened',       description: 'Purchase 150 upgrades.',           category: 'mastery', reward: { radiance: 4 },      check: (s) => s.upgrades.size >= 150 },
  { id: 'obj_relics_full',   name: 'Relic Bearer',      description: 'Equip 5 relics at once.',          category: 'mastery', reward: { blissShards: 60 },  check: (s) => s.activeRelics.length >= 5 },

  // ── Challenge (clicks / pilgrimage / events) ──
  { id: 'obj_clicks_1000',   name: 'Devoted',           description: 'Spread joy 1,000 times.',          category: 'challenge', reward: { blissShards: 20 }, check: (s) => s.totalClicks >= 1000 },
  { id: 'obj_clicks_10000',  name: 'Tireless',          description: 'Spread joy 10,000 times.',         category: 'challenge', reward: { radiance: 2 },     check: (s) => s.totalClicks >= 10000 },
  { id: 'obj_pilgrim_25',    name: 'Pilgrim',           description: 'Complete 25 pilgrimages.',         category: 'challenge', reward: { blissShards: 50 }, check: (s) => s.totalPilgrimages >= 25 },
  { id: 'obj_pilgrim_100',   name: 'Wanderer',          description: 'Complete 100 pilgrimages.',        category: 'challenge', reward: { radiance: 3 },     check: (s) => s.totalPilgrimages >= 100 },
  { id: 'obj_events_50',     name: 'Fatekeeper',        description: 'Resolve 50 events.',               category: 'challenge', reward: { blissShards: 40 }, check: (s) => s.totalEventsResolved >= 50 },
  { id: 'obj_offerings_25',  name: 'Generous Soul',     description: 'Make 25 offerings.',               category: 'challenge', reward: { blissShards: 40 }, check: (s) => s.totalOfferings >= 25 },

  // ── Eternal (prestige / ascension) ──
  { id: 'obj_prestige_5',    name: 'Reborn',            description: 'Transcend 5 times.',               category: 'eternal', reward: { blissShards: 50 }, check: (s) => s.prestigeCount >= 5 },
  { id: 'obj_prestige_15',   name: 'Cycle Master',      description: 'Transcend 15 times.',              category: 'eternal', reward: { radiance: 2 },     check: (s) => s.prestigeCount >= 15 },
  { id: 'obj_prestige_30',   name: 'Wheel Turner',      description: 'Transcend 30 times.',              category: 'eternal', reward: { radiance: 6 },     check: (s) => s.prestigeCount >= 30 },
  { id: 'obj_prestige_50',   name: 'Eternal Cycle',     description: 'Transcend 50 times.',              category: 'eternal', reward: { radiance: 12 },    check: (s) => s.prestigeCount >= 50 },
  { id: 'obj_ascend_1',      name: 'Ascended',          description: 'Ascend for the first time.',       category: 'eternal', reward: { radiance: 5 },     check: (s) => s.ascensionCount >= 1 },
  { id: 'obj_ascend_3',      name: 'Beyond',            description: 'Ascend 3 times.',                  category: 'eternal', reward: { radiance: 20 },    check: (s) => s.ascensionCount >= 3 },
  { id: 'obj_ascend_10',     name: 'The Radiant',       description: 'Ascend 10 times.',                 category: 'eternal', reward: { radiance: 100 },   check: (s) => s.ascensionCount >= 10 },
  { id: 'obj_radiance_50',   name: 'Lightbringer',      description: 'Earn 50 lifetime Radiance.',       category: 'eternal', reward: { radiance: 10 },    check: (s) => s.lifetimeRadiance >= 50 },
  { id: 'obj_karma_1e6',     name: 'Saintly',           description: 'Reach 1e6 karma.',                 category: 'eternal', reward: { radiance: 2 },     check: (s) => s.karma >= 1e6 },
];

export const OBJECTIVE_MAP: Record<string, ObjectiveDef> = Object.fromEntries(
  OBJECTIVES.map((o) => [o.id, o]),
);

/**
 * Pays out any newly-completed objectives. Pure: returns the same reference when
 * nothing changed (so it's safe to call every tick).
 */
export function auditObjectives(state: GameState): GameState {
  let completed: Set<string> | null = null;
  let radiance = state.radiance;
  let lifetimeRadiance = state.lifetimeRadiance;
  let blissShards = state.blissShards;
  let karma = state.karma;

  for (const obj of OBJECTIVES) {
    if (state.completedObjectives.has(obj.id)) continue;
    if (!obj.check(state)) continue;
    if (!completed) completed = new Set(state.completedObjectives);
    completed.add(obj.id);
    if (obj.reward.radiance) {
      radiance += obj.reward.radiance;
      lifetimeRadiance += obj.reward.radiance;
    }
    if (obj.reward.blissShards) blissShards += obj.reward.blissShards;
    if (obj.reward.karma) karma += obj.reward.karma;
  }

  if (!completed) return state;
  return { ...state, completedObjectives: completed, radiance, lifetimeRadiance, blissShards, karma };
}
