/**
 * A readable character sheet in Markdown — for notes apps, wikis, Discord and
 * as the text the advisor reads (`summary.ts` builds on the same lines).
 */
import * as d5 from '../dnd5e/rules';
import * as p2 from '../pf2e/rules';
import {
  ABILITIES,
  ABILITY_NAMES,
  type Dnd5eCharacter,
  type Dnd5eData,
  type Pf2eCharacter,
  type Pf2eData,
} from '../types';

const s = d5.signed;

export function dnd5eMarkdown(c: Dnd5eCharacter, d: Dnd5eData): string {
  const scores = d5.abilityScores(c, d);
  const level = d5.totalLevel(c);
  const pb = d5.proficiencyBonus(level);
  const species = d.species.find((x) => x.id === c.speciesId);
  const bg = d.backgrounds.find((x) => x.id === c.backgroundId);
  const classes = c.classes
    .map((k) => {
      const klass = d.classes.find((x) => x.id === k.classId);
      const sub = klass?.subclasses.find((x) => x.id === k.subclassId)?.name ?? k.customSubclass;
      return `${klass?.name ?? k.classId} ${k.level}${sub ? ` (${sub})` : ''}`;
    })
    .join(' / ');
  const saves = d5.saveProficiencies(c, d);
  const ac = d5.armorClass(c, d);
  const lines: string[] = [
    `# ${c.name || 'Unnamed'}`,
    '',
    `*Level ${level} ${species?.name ?? ''} ${classes}* · Background: ${bg?.name ?? '—'}${c.playerName ? ` · Player: ${c.playerName}` : ''}`,
    '',
    `**AC** ${ac.value} (${ac.formula}) · **HP** ${d5.maxHp(c, d)} · **Speed** ${d5.speed(c, d)} ft · **Initiative** ${s(d5.initiative(c, d))} · **Proficiency** ${s(pb)}`,
    '',
    '| ' + ABILITIES.map((a) => a.toUpperCase()).join(' | ') + ' |',
    '|' + ABILITIES.map(() => ':-:').join('|') + '|',
    '| ' + ABILITIES.map((a) => `${scores[a]} (${s(d5.abilityMod(scores[a]))})`).join(' | ') + ' |',
    '',
    `**Saving throws:** ${ABILITIES.map((a) => `${ABILITY_NAMES[a]} ${s(d5.abilityMod(scores[a]) + (saves.includes(a) ? pb : 0))}${saves.includes(a) ? '*' : ''}`).join(', ')}`,
    '',
    `**Skills:** ${
      d5
        .skillLines(c, d)
        .filter((k) => k.proficient)
        .map((k) => `${k.name} ${s(k.bonus)}${k.expertise ? ' (expertise)' : ''}`)
        .join(', ') || '—'
    }`,
    `**Passive Perception:** ${10 + (d5.skillLines(c, d).find((k) => k.id === 'perception')?.bonus ?? 0)}`,
    `**Languages:** ${c.languages.join(', ') || '—'}${c.tools.length ? ` · **Tools:** ${c.tools.join(', ')}` : ''}`,
    '',
    '## Attacks',
    ...d5
      .attacks(c, d)
      .map((a) => `- **${a.name}** ${s(a.toHit)} to hit, ${a.damage}${a.notes ? ` — ${a.notes}` : ''}`),
  ];
  const res = d5.resources(c, d);
  if (res.length)
    lines.push('', '## Resources', ...res.map((r) => `- ${r.name}: ${r.value}${r.recharge ? ` (${r.recharge})` : ''}`));
  const casters = d5.casters(c, d);
  if (casters.length) {
    lines.push('', '## Spellcasting');
    for (const k of casters)
      lines.push(
        `- ${k.name}: ${ABILITY_NAMES[k.ability]}, save DC ${k.saveDc}, attack ${s(k.attack)}, ${k.cantrips} cantrips, ${k.prepared} prepared`,
      );
    const slots = d5.spellSlots(c, d);
    if (slots.length) lines.push(`- Slots: ${slots.map((n, i) => `level ${i + 1} ×${n}`).join(', ')}`);
    const pact = d5.pactSlots(c);
    if (pact) lines.push(`- Pact Magic: ${pact.slots} slot(s) of level ${pact.level}`);
    const spells = [...new Set([...c.spells.prepared, ...d5.alwaysPreparedSpells(c, d)])]
      .map((id) => d.spells.find((x) => x.id === id))
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    for (let lvl = 0; lvl <= 9; lvl++) {
      const at = spells.filter((x) => x.level === lvl);
      if (at.length) lines.push(`- ${lvl === 0 ? 'Cantrips' : `Level ${lvl}`}: ${at.map((x) => x.name).join(', ')}`);
    }
  }
  lines.push(
    '',
    '## Features',
    ...d5.features(c, d).map((f) => `- **${f.name}** (${f.source}${f.level > 1 ? ` ${f.level}` : ''}): ${f.text}`),
  );
  for (const e of c.custom) lines.push(`- **${e.name}**${e.kind ? ` (${e.kind})` : ''}: ${e.text}`);
  lines.push('', ...inventoryLines(c), ...storyLines(c));
  return lines.join('\n');
}

export function pf2eMarkdown(c: Pf2eCharacter, d: Pf2eData): string {
  const mods = p2.attributeMods(c);
  const klass = p2.classOf(d, c);
  const sub = klass?.subclasses?.find((x) => x.id === c.subclassId);
  const ac = p2.armorClass(c, d);
  const per = p2.perception(c, d);
  const sv = (k: 'fortitude' | 'reflex' | 'will') => p2.save(c, d, k);
  const lines: string[] = [
    `# ${c.name || 'Unnamed'}`,
    '',
    `*${p2.heritageOf(d, c)?.name ?? ''} ${p2.ancestryOf(d, c)?.name ?? ''} ${klass?.name ?? ''} ${c.level}${sub ? ` (${sub.name})` : ''}* · Background: ${p2.backgroundOf(d, c)?.name ?? '—'}${c.playerName ? ` · Player: ${c.playerName}` : ''}`,
    '',
    `**AC** ${ac.value} · **HP** ${p2.maxHp(c, d)} · **Speed** ${p2.speed(c, d)} ft · **Perception** ${s(per.bonus)} (${p2.RANK_NAMES[per.rank]}) · **Class DC** ${p2.classDc(c, d).value}`,
    `**Fort** ${s(sv('fortitude').bonus)} · **Ref** ${s(sv('reflex').bonus)} · **Will** ${s(sv('will').bonus)} · **Hero Points** ${c.heroPoints}`,
    '',
    '| ' + ABILITIES.map((a) => a.toUpperCase()).join(' | ') + ' |',
    '|' + ABILITIES.map(() => ':-:').join('|') + '|',
    '| ' + ABILITIES.map((a) => s(mods[a])).join(' | ') + ' |',
    '',
    `**Skills:** ${
      p2
        .skillLines(c, d)
        .filter((k) => k.rank > 0)
        .map((k) => `${k.name} ${s(k.bonus)} (${p2.RANK_LETTER[k.rank]})`)
        .join(', ') || '—'
    }`,
    `**Languages:** ${c.languages.join(', ') || '—'}`,
    '',
    '## Strikes',
    ...p2
      .strikes(c, d)
      .map((x) => `- **${x.name}** ${x.attack.map(s).join(' / ')}, ${x.damage}${x.traits ? ` — ${x.traits}` : ''}`),
  ];
  const sc = p2.spellcasting(c, d);
  if (sc) {
    lines.push(
      '',
      '## Spellcasting',
      `- ${sc.tradition} ${sc.type}, attack ${s(sc.attack)}, DC ${sc.dc}; slots ${sc.slots
        .map((n, i) => `${i + 1}:${n}`)
        .filter((x) => !x.endsWith(':0'))
        .join(', ')}`,
    );
    const spells = c.spells.known
      .map((id) => d.spells.find((x) => x.id === id))
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    for (let r = 0; r <= 10; r++) {
      const at = spells.filter((x) => x.rank === r);
      if (at.length) lines.push(`- ${r === 0 ? 'Cantrips' : `Rank ${r}`}: ${at.map((x) => x.name).join(', ')}`);
    }
  }
  if (c.spells.focusSpells.length)
    lines.push(
      `- Focus spells (${p2.focusPointsMax(c)} FP): ${c.spells.focusSpells.map((id) => d.spells.find((x) => x.id === id)?.name ?? id).join(', ')}`,
    );
  lines.push('', '## Feats');
  for (const f of [...c.feats].sort(
    (a, b) => (Number(a.slot.split('-')[1]) || 0) - (Number(b.slot.split('-')[1]) || 0),
  )) {
    const feat = d.feats.find((x) => x.id === f.featId);
    lines.push(`- ${f.slot}: **${feat?.name ?? f.customName ?? '—'}**${feat ? ` — ${feat.text}` : ''}`);
  }
  lines.push(
    '',
    '## Class features',
    ...(klass?.features ?? []).filter((f) => f.level <= c.level).map((f) => `- **${f.name}** (${f.level}): ${f.text}`),
  );
  for (const e of c.custom) lines.push(`- **${e.name}**${e.kind ? ` (${e.kind})` : ''}: ${e.text}`);
  const b = p2.bulk(c);
  lines.push('', ...inventoryLines(c), `Bulk ${b.carried} / ${b.encumbered} (max ${b.max})`, ...storyLines(c));
  return lines.join('\n');
}

function inventoryLines(c: Dnd5eCharacter | Pf2eCharacter): string[] {
  const cur = Object.entries(c.currency)
    .filter(([, v]) => v)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ');
  return [
    '## Inventory',
    ...c.inventory.map(
      (i) => `- ${i.quantity > 1 ? `${i.quantity}× ` : ''}${i.name}${i.equipped ? ' (equipped)' : ''}`,
    ),
    cur ? `Coins: ${cur}` : '',
  ];
}

function storyLines(c: Dnd5eCharacter | Pf2eCharacter): string[] {
  const out: string[] = [];
  for (const [title, text] of [
    ['Appearance', c.appearance],
    ['Personality', c.personality],
    ['Backstory', c.backstory],
    ['Notes', c.notes],
  ] as const)
    if (text.trim()) out.push('', `## ${title}`, text.trim());
  return out;
}
