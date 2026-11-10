/**
 * Doctrine Engine — Module Index
 */

export * from './types';
export * from './constants';
export { awardXp, getRank, calculateDecay, getReputation, getReputationLeaderboard, updateStreak, calculateCoalitionScore } from './reputation';
export { isSahurActive, getSahurStatus, getSahurConfig, getTimezonesInSahurWindow } from './temporal';
export { calculateDivisiveness, aggregateReactions } from './divisiveness';
export { createIncident, addIncidentEvent, transitionIncidentStatus, getRecentIncidents, getIncident, reportIncident } from './incidents';
export { isFeatureDisclosed, getDisclosuresForTier, transitionDisclosure, createDisclosure } from './narrative';
export { generatePuzzle, validateAnswer, calculateScore, getSeedForDate } from './puzzle-engine';
export { getSortedFeed } from './feed';
export { checkTierAccess, getUserTier, setUserTier, getTierDefinition } from './tiers';
