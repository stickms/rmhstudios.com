// Altair codex (R20): a lore entry per creature, unlocked the first time the
// bestiary records an encounter with it. No separate save: the bestiary already
// persists (localStorage + account), so the codex is a view over it.
import { BOSSES } from './bosses';
import { ENEMIES } from './enemies';

export interface CodexEntry {
  id: string;
  name: string;
  kind: 'enemy' | 'boss';
  color: string;
  lore: string;
}

const LORE: Record<string, string> = {
  shambler: 'The first to rise are always the ones nobody counted. They walk because the ground under them still remembers being a road.',
  bat: 'Colony bats nested in the bell towers and have not slept since the bells went quiet.',
  skeleton_warrior: 'Each carries the sword it died holding. None of them remember the war.',
  ghost: 'A ghost is an argument the dead are still having with the living. It passes through everything except regret.',
  werewolf: 'The village bell tolls the hour for the wolf, not the moon.',
  cultist: 'They chant a name the stars have been trying to forget.',
  swarm_rat: 'The rats were here before the castle and will be here after it. They are not wicked, only patient.',
  witch: 'Every dark orb she throws is a letter she never mailed.',
  bone_golem: 'Built from the unclaimed. Every bone was borrowed from someone who might have wanted it back.',
  shadow: 'What your torch leaves behind, given an errand.',
  vampire_noble: 'Titles outlast bloodlines. This one outlasted the manners, too.',
  arcane_construct: 'A lock built to keep shut a door that no longer exists.',
  plague_bearer: 'He carries the sickness like a lantern and is very proud of the light.',
  death_knight: 'Oaths hold the oathbreaker longest.',
  banshee: 'Her cry is a name. If you hear yours, run.',
  lich: 'A scholar who handed in his last essay late and has been extending the deadline ever since.',
  hollow_king: 'A crown with nobody inside. The court keeps bowing anyway.',
  crimson_countess: 'She asked for one more evening. The castle has been granting it for three centuries.',
  elder_lich_malachar: 'Malachar wrote the rules of death, then found a loophole in his own handwriting.',
  terminus: 'The last page of every book. It does not hunt you; it simply arrives.',
};

export const CODEX: readonly CodexEntry[] = [
  ...ENEMIES.map((e) => ({ id: e.id, name: e.name, kind: 'enemy' as const, color: e.color, lore: LORE[e.id] ?? '' })),
  ...BOSSES.map((b) => ({ id: b.id, name: b.name, kind: 'boss' as const, color: b.color, lore: LORE[b.id] ?? '' })),
].filter((e) => e.lore);

type Bestiary = Record<string, { encountered: number }>;

export function codexUnlocked(bestiary: Bestiary, id: string): boolean {
  return (bestiary[id]?.encountered ?? 0) > 0;
}

export function codexProgress(bestiary: Bestiary): { found: number; total: number; pct: number } {
  const found = CODEX.filter((e) => codexUnlocked(bestiary, e.id)).length;
  return { found, total: CODEX.length, pct: CODEX.length ? Math.round((found / CODEX.length) * 100) : 0 };
}
