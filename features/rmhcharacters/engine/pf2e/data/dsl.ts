/**
 * Compact line formats for the PF2e rules data, so the large feat and spell
 * tables stay readable. Every parser here returns plain objects that match the
 * interfaces in `../../types`; nothing is computed lazily.
 *
 * Feat line:  `level|Name|actions|prerequisites|text`
 * Spell line: `rank|Name|traditions|actions|traits|range|area|targets|defense|duration|text|heightened`
 *   traditions are letters: a arcane, d divine, o occult, p primal.
 * Action codes: 1, 2, 3, r (reaction), f (free), or empty for a passive feat.
 */
import type { Pf2eFeat, Pf2eSpell } from '../../types';

export function kebab(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’!?,.()]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const ACTIONS: Record<string, string> = {
  '1': '1',
  '2': '2',
  '3': '3',
  r: 'reaction',
  f: 'free',
};

function lines(src: string): string[][] {
  return src
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .map((l) => l.split('|').map((part) => part.trim()));
}

export function feats(
  type: Pf2eFeat['type'],
  owner: string | undefined,
  traits: string[],
  src: string,
): Pf2eFeat[] {
  return lines(src).map((parts) => {
    if (parts.length !== 5) throw new Error(`pf2e feat line needs 5 fields: ${parts.join('|')}`);
    const [level = '1', name = '', act = '', pre = '', text = ''] = parts;
    const feat: Pf2eFeat = {
      id: kebab(name),
      name,
      level: Number(level),
      type,
      traits: [...traits],
      text,
    };
    if (owner) feat.owner = owner;
    const a = ACTIONS[act];
    if (a) feat.actions = a;
    if (pre) feat.prerequisites = pre;
    return feat;
  });
}

const TRADITIONS: Record<string, string> = {
  a: 'arcane',
  d: 'divine',
  o: 'occult',
  p: 'primal',
};

export function spells(src: string, focusOwner?: string): Pf2eSpell[] {
  return lines(src).map((parts) => {
    if (parts.length !== 12) throw new Error(`pf2e spell line needs 12 fields: ${parts.join('|')}`);
    const [
      rank = '0',
      name = '',
      trads = '',
      actions = '2',
      traits = '',
      range = '',
      area = '',
      targets = '',
      defense = '',
      duration = '',
      text = '',
      heightened = '',
    ] = parts;
      const spell: Pf2eSpell = {
        id: kebab(name),
        name,
        rank: Number(rank),
        traditions: trads
          .split('')
          .map((c) => TRADITIONS[c])
          .filter((t): t is string => Boolean(t)),
        actions: ACTIONS[actions] ?? actions,
        traits: traits ? traits.split(',').map((t) => t.trim()) : [],
        text,
      };
      if (range) spell.range = range;
      if (area) spell.area = area;
      if (targets) spell.targets = targets;
      if (defense) spell.defense = defense;
      if (duration) spell.duration = duration;
      if (heightened) spell.heightened = heightened;
      if (focusOwner) {
        spell.focus = true;
        spell.owner = focusOwner;
      }
      return spell;
  });
}

/** Give every id in the list a unique value, suffixing the owner (then a counter) on a clash. */
export function uniqueIds<T extends { id: string; owner?: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  for (const item of items) {
    let id = item.id;
    if (seen.has(id) && item.owner) id = `${item.id}-${item.owner}`;
    let n = 2;
    const base = id;
    while (seen.has(id)) id = `${base}-${n++}`;
    item.id = id;
    seen.add(id);
  }
  return items;
}
