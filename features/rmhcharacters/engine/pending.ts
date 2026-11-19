/**
 * How much of a character is still unfinished, for the warning badges on the editor tabs
 * and the roster. The build count is the rules check (validate) less the two things it
 * reports that are not a build choice: the character's name and spell counts, which the
 * Spells tab counts on its own.
 */
import * as d5 from './dnd5e/rules';
import * as p2 from './pf2e/rules';
import type { Character, Dnd5eData, Pf2eData } from './types';

export interface Pending {
  build: number;
  spells: number;
}

const notBuild = (issue: string) => issue === 'The character has no name.' || /spells prepared, the limit is/.test(issue);

export function pending(c: Character, data: Dnd5eData | Pf2eData): Pending {
  if (c.system === 'dnd5e') {
    const d = data as Dnd5eData;
    const build = d5.validate(c, d).filter((i) => !notBuild(i)).length;
    let spells = 0;
    for (const k of d5.casters(c, d)) {
      const mine = c.spells.prepared.map((id) => d.spells.find((s) => s.id === id)).filter((s) => s?.classes.includes(k.casting.list));
      spells += Math.max(0, k.cantrips - mine.filter((s) => s!.level === 0).length);
      spells += Math.max(0, k.prepared - mine.filter((s) => s!.level > 0).length);
    }
    return { build, spells };
  }
  const d = data as Pf2eData;
  const build = p2.validate(c, d).filter((i) => !notBuild(i)).length;
  const sc = p2.spellcasting(c, d);
  let spells = 0;
  if (sc) {
    const known = c.spells.known.map((id) => d.spells.find((s) => s.id === id)).filter(Boolean);
    spells += Math.max(0, sc.cantrips - known.filter((s) => s!.rank === 0).length);
    // A spontaneous caster's repertoire holds as many spells per rank as it has slots.
    if (sc.type === 'spontaneous') sc.slots.forEach((n, i) => (spells += Math.max(0, n - known.filter((s) => s!.rank === i + 1).length)));
  }
  return { build, spells };
}
