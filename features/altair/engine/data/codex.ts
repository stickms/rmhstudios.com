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
  shambler: 'The first to stand up are always the ones nobody counted. They walk the route on their badge because the floor still remembers it.',
  bat: 'A maintenance drone with a cracked clock. It has been told to inspect the vents so many times that it no longer lands.',
  skeleton_warrior: 'An unmanned work-frame that finished its shift and was never switched off. The cutter still thinks it is a weld.',
  ghost: 'Static is a person played back from a bad recording. It passes through everything except the conversation it was in.',
  werewolf: 'Something that fits the crawlspaces too well. The maintenance log says it is a cable fault.',
  cultist: 'A relay that keeps broadcasting a name on a channel nobody is listening to. Each orb is the same word, louder.',
  swarm_rat: 'Spare parts that learned to walk. They are not hostile, only trying to get home.',
  witch: 'It does not attack you. It makes the rest of the station louder than you can hear yourself think.',
  bone_golem: 'A loading frame bolted together from other frames. It still lifts whatever is in front of it, including you.',
  shadow: 'The place your lamp does not reach, given an errand.',
  vampire_noble: 'A power regulator that learned the only thing it can do is take. It keeps its cables tidy.',
  arcane_construct: 'A lens built to look through a door that has since been welded shut. It looks anyway.',
  plague_bearer: 'A coolant bladder past its date. It leaks warmly, as if apologising.',
  death_knight: 'Station security still working to a standing order. The order was to keep everyone in.',
  banshee: 'A public-address speaker that remembers one announcement. If it says your name, leave.',
  lich: 'The station conductor, who kept the shifts in time and has been counting them ever since. The core is the metronome.',
  hollow_king: 'The director\'s chair with nobody in it. The crew keeps reporting to it anyway.',
  crimson_countess: 'The medical officer asked for one more night shift. The station has been granting it ever since.',
  elder_lich_malachar: 'Malachar wrote the shutdown procedure, then found a loophole in his own handwriting.',
  terminus: 'The last entry in every log. It does not hunt you; it simply arrives.',
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
