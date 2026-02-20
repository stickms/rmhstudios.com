// lib/signal-forge/Glossary.ts — Single source of truth for keyword/system explanations

/** Tooltip-length explanation for every keyword, status, and system. */
export const KEYWORD_GLOSSARY: Record<string, string> = {
  // === CARD KEYWORDS ===
  'Echo':       'Repeats damage and shield at 50% power after the initial hit.',
  'AOE':        'Hits ALL enemies instead of just the targeted one.',
  'Exhaust':    'Removed from your deck entirely after being played. One-time use.',
  'Sustain':    'Returns to your hand instead of being discarded at end of turn.',
  'Wildcard':   'Counts as ANY waveform type for pattern matching.',
  'Leech':      'Heals you for a percentage of the damage dealt.',
  'Stabilize':  'Removes Glitch cards from your discard pile.',
  'Piercing':   'Ignores enemy Armored reduction — full damage always.',
  'Chain':      'Next card of the same waveform type costs 1 less energy this turn.',
  'Growing':    'Gains bonus damage each time it\'s played this combat.',
  'Retain':     'Stays in your hand between turns — never discarded.',
  'Multihit':   'Strikes the target multiple times. Each hit applies Armored separately.',
  'Innate':     'Always drawn in your opening hand at the start of combat.',
  'Ethereal':   'If not played by end of turn, it\'s exhausted (removed from deck).',
  'Siphon':     'Steals shield from the target enemy and adds it to yours.',
  'Volatile':   'Deals a random amount of damage within a range.',
  'Modal':      'Choose one of several effects when played.',
  'Draw':       'Draw additional cards from your draw pile.',

  // === STATUS EFFECTS ===
  'Vulnerable':  'Target takes 50% more damage for N turns.',
  'Weak':        'Target deals 25% less damage for N turns.',
  'Bleed':       'Takes N damage at the start of each turn. Stacks.',
  'Freeze':      'Skips next action. Applied to enemies.',
  'Marked':      'Takes +5 flat damage from all sources.',

  // === SYSTEMS ===
  'Static':     'Accumulates from Noise cards. At threshold (4), a Glitch card is injected into your discard.',
  'Glitch':     'Unplayable card (cost ✕). Clogs your hand. Remove with Stabilize or Clean Room.',
  'Tempo':      'Builds as you play cards (+1 per card). Adds bonus damage. Resets each turn. Max 6.',
  'Forge Burst':'Match the target waveform pattern to deal +12 bonus damage and draw a card.',
  'Shield':     'Absorbs damage before HP. Resets to 0 at start of your turn.',
  'Armored':    'Enemy passive — reduces all incoming damage by its Armored value.',
  'Regen':      'Enemy passive — heals this amount at the start of its turn.',
  'Enrage':     'Enemy passive — deals +50% damage below 50% HP.',
  'Zone':       'Random combat modifier active this floor. Affects both sides.',
  'Ricochet':   'Splashes 50% of damage to a random other enemy.',
  'Special':    'Unique effect — see card description for details.',
};

/**
 * Given a card, relic, or enemy, return only the glossary entries that are relevant.
 */
export function getRelevantTooltips(item: {
  keywords?: string[];
  effect?: string;
  description?: string;
  echo?: boolean; aoe?: boolean; exhaust?: boolean; sustain?: boolean;
  wildcard?: boolean; leech?: number; stabilize?: number;
  staticGain?: number; staticReduce?: number; glitchGen?: number;
  isGlitch?: boolean; tempoGain?: number; selfDamage?: number;
  piercing?: boolean; chain?: boolean; growing?: number;
  retain?: boolean; multihit?: number; innate?: boolean;
  ethereal?: boolean; siphon?: number;
  bleed?: number; freeze?: boolean; vulnerable?: number; weak?: number;
  armored?: number; regen?: number; enrage?: number; draw?: number;
}): { term: string; explanation: string }[] {
  const tips: { term: string; explanation: string }[] = [];
  const seen = new Set<string>();

  const add = (term: string) => {
    if (seen.has(term)) return;
    const exp = KEYWORD_GLOSSARY[term];
    if (exp) { tips.push({ term, explanation: exp }); seen.add(term); }
  };

  // Check boolean/numeric flags directly
  if (item.echo) add('Echo');
  if (item.aoe) add('AOE');
  if (item.exhaust) add('Exhaust');
  if (item.sustain) add('Sustain');
  if (item.wildcard) add('Wildcard');
  if (item.leech) add('Leech');
  if (item.stabilize) add('Stabilize');
  if (item.piercing) add('Piercing');
  if (item.chain) add('Chain');
  if (item.growing) add('Growing');
  if (item.retain) add('Retain');
  if (item.multihit) add('Multihit');
  if (item.innate) add('Innate');
  if (item.ethereal) add('Ethereal');
  if (item.siphon) add('Siphon');
  if (item.bleed) add('Bleed');
  if (item.freeze) add('Freeze');
  if (item.vulnerable) add('Vulnerable');
  if (item.weak) add('Weak');
  if (item.draw) add('Draw');

  // System flags
  if (item.staticGain || item.staticReduce) add('Static');
  if (item.glitchGen || item.isGlitch) add('Glitch');
  if (item.tempoGain) add('Tempo');
  if (item.armored) add('Armored');
  if (item.regen) add('Regen');
  if (item.enrage) add('Enrage');

  // Also scan the keywords[] array
  if (item.keywords) {
    for (const kw of item.keywords) {
      add(kw);
    }
  }

  // Scan effect/description text for system terms not caught by flags
  const text = ((item.effect ?? '') + ' ' + (item.description ?? '')).toLowerCase();
  if (text.includes('static') && !seen.has('Static')) add('Static');
  if (text.includes('glitch') && !seen.has('Glitch')) add('Glitch');
  if (text.includes('tempo') && !seen.has('Tempo')) add('Tempo');
  if (text.includes('forge burst') && !seen.has('Forge Burst')) add('Forge Burst');
  if (text.includes('bleed') && !seen.has('Bleed')) add('Bleed');
  if (text.includes('freeze') && !seen.has('Freeze')) add('Freeze');
  if (text.includes('vulnerable') && !seen.has('Vulnerable')) add('Vulnerable');
  if (text.includes('zone') && !seen.has('Zone')) add('Zone');

  return tips;
}
