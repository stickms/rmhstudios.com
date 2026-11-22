/**
 * D&D Beyond character JSON (the character service's v5 response, either the
 * `{ data: {...} }` envelope or the bare character). Import only: D&D Beyond
 * has no import of its own.
 *
 * Scores are rebuilt the way the site shows them: the override if set, else
 * base + bonus + every `{type:'bonus', subType:'<ability>-score'}` modifier.
 * The result is stored as manual final scores, so nothing is double counted.
 */
import { newDnd5e, newId, normalizeCharacter } from '../factory';
import { DND5E_SKILL_IDS } from '../dnd5e/skills';
import { ABILITIES, ABILITY_NAMES, type Dnd5eCharacter, type Dnd5eData } from '../types';
import { asArr, asNum, asStr, isObj, matchByName, slug, stripHtml, type Obj } from './util';

function unwrap(json: unknown): Obj | null {
  if (!isObj(json)) return null;
  const inner = isObj(json.data) ? json.data : json;
  return Array.isArray(inner.stats) && Array.isArray(inner.classes) ? inner : null;
}

export function isDndBeyond(json: unknown): boolean {
  return unwrap(json) !== null;
}

export function importDndBeyond(json: unknown, d: Dnd5eData): Dnd5eCharacter | null {
  const x = unwrap(json);
  if (!x) return null;
  const c = newDnd5e();
  c.name = asStr(x.name).slice(0, 120);
  c.abilityMethod = 'manual';

  const statValue = (list: unknown, id: number) => {
    const row = asArr(list).find((s) => isObj(s) && s.id === id);
    return isObj(row) && typeof row.value === 'number' ? row.value : null;
  };
  const modifiers: Obj[] = [];
  const mods = isObj(x.modifiers) ? x.modifiers : {};
  for (const list of Object.values(mods)) for (const m of asArr(list)) if (isObj(m)) modifiers.push(m);

  ABILITIES.forEach((a, i) => {
    const override = statValue(x.overrideStats, i + 1);
    const baseScore = statValue(x.stats, i + 1) ?? 10;
    const bonus = statValue(x.bonusStats, i + 1) ?? 0;
    const fromMods = modifiers
      .filter((m) => m.type === 'bonus' && m.subType === `${ABILITY_NAMES[a].toLowerCase()}-score`)
      .reduce((n, m) => n + asNum(m.value), 0);
    c.baseAbilities[a] = Math.min(30, Math.max(1, override ?? baseScore + bonus + fromMods));
  });

  for (const m of modifiers) {
    const sub = asStr(m.subType);
    if (!DND5E_SKILL_IDS.includes(sub)) continue;
    if ((m.type === 'proficiency' || m.type === 'expertise') && !c.skills.includes(sub)) c.skills.push(sub);
    if (m.type === 'expertise' && !c.expertise.includes(sub)) c.expertise.push(sub);
  }
  for (const m of modifiers) {
    if (m.type === 'language') {
      const name = asStr(m.friendlySubtypeName);
      if (name && !c.languages.includes(name)) c.languages.push(name);
    }
  }

  const race = isObj(x.race) ? x.race : {};
  const species = matchByName(d.species, race.baseRaceName) ?? matchByName(d.species, race.fullName);
  if (species) {
    c.speciesId = species.id;
    const opt = species.options?.choices.find((o) => slug(asStr(race.fullName)).includes(slug(o.name)));
    if (opt) c.speciesOption = opt.id;
  } else if (race.fullName)
    c.custom.push({ id: newId(), name: asStr(race.fullName), text: 'Species from D&D Beyond.', kind: 'Species' });

  const bgDef = isObj(x.background) && isObj(x.background.definition) ? x.background.definition : null;
  const bg = bgDef && matchByName(d.backgrounds, bgDef.name);
  if (bg) c.backgroundId = bg.id;
  else if (bgDef)
    c.custom.push({
      id: newId(),
      name: asStr(bgDef.name),
      text: stripHtml(asStr(bgDef.description)),
      kind: 'Background',
    });

  const classes = asArr(x.classes).filter(isObj);
  classes.sort((a, b) => Number(b.isStartingClass === true) - Number(a.isStartingClass === true));
  for (const k of classes) {
    const def = isObj(k.definition) ? k.definition : {};
    const klass = matchByName(d.classes, def.name);
    const subDef = isObj(k.subclassDefinition) ? k.subclassDefinition : null;
    if (!klass) {
      c.custom.push({
        id: newId(),
        name: `${asStr(def.name)} ${asNum(k.level, 1)}`,
        text: 'Class from D&D Beyond.',
        kind: 'Class',
      });
      continue;
    }
    const sub = subDef && matchByName(klass.subclasses, subDef.name);
    c.classes.push({
      classId: klass.id,
      level: Math.min(20, Math.max(1, asNum(k.level, 1))),
      hpRolls: [],
      ...(sub ? { subclassId: sub.id } : subDef ? { customSubclass: asStr(subDef.name) } : {}),
    });
  }

  for (const f of asArr(x.feats)) {
    const def = isObj(f) && isObj(f.definition) ? f.definition : null;
    if (!def) continue;
    const feat = matchByName(d.feats, def.name);
    if (feat?.category === 'origin') c.originFeats.push(feat.id);
    else if (feat?.category === 'fighting-style') c.choices['imported:fighting-style'] = feat.id;
    else if (feat) c.asi.push({ slot: `imported:${feat.id}`, kind: 'feat', featId: feat.id });
    else
      c.custom.push({
        id: newId(),
        name: asStr(def.name),
        text: stripHtml(asStr(def.description)).slice(0, 4000),
        kind: 'Feat',
      });
  }

  const spellNames: { name: unknown; prepared: boolean }[] = [];
  for (const group of asArr(x.classSpells)) {
    if (!isObj(group)) continue;
    for (const s of asArr(group.spells))
      if (isObj(s) && isObj(s.definition))
        spellNames.push({ name: s.definition.name, prepared: s.prepared === true || s.alwaysPrepared === true });
  }
  const spellsBySource = isObj(x.spells) ? x.spells : {};
  for (const list of Object.values(spellsBySource))
    for (const s of asArr(list))
      if (isObj(s) && isObj(s.definition)) spellNames.push({ name: s.definition.name, prepared: true });
  for (const { name, prepared } of spellNames) {
    const spell = matchByName(d.spells, name);
    if (!spell) continue;
    if (!c.spells.known.includes(spell.id)) c.spells.known.push(spell.id);
    if ((prepared || spell.level === 0) && !c.spells.prepared.includes(spell.id)) c.spells.prepared.push(spell.id);
  }

  for (const it of asArr(x.inventory)) {
    if (!isObj(it) || !isObj(it.definition)) continue;
    const def = it.definition;
    const ref = matchByName(d.weapons, def.name) ?? matchByName(d.armor, def.name) ?? matchByName(d.gear, def.name);
    const equipped = it.equipped === true;
    c.inventory.push({
      id: newId(),
      name: asStr(def.name),
      quantity: Math.max(1, asNum(it.quantity, 1)),
      weight: asNum(def.weight),
      equipped,
      ...(ref ? { refId: ref.id } : {}),
    });
    const armor = d.armor.find((a) => a.id === ref?.id);
    if (armor && equipped) {
      if (armor.category === 'shield') c.shield = true;
      else c.armorId = armor.id;
    }
  }

  const cur = isObj(x.currencies) ? x.currencies : {};
  c.currency = { pp: asNum(cur.pp), gp: asNum(cur.gp), ep: asNum(cur.ep), sp: asNum(cur.sp), cp: asNum(cur.cp) };
  const notes = isObj(x.notes) ? x.notes : {};
  const traits = isObj(x.traits) ? x.traits : {};
  c.backstory = stripHtml(asStr(notes.backstory));
  c.notes = [notes.allies, notes.organizations, notes.otherNotes, notes.otherHoldings]
    .map(asStr)
    .filter(Boolean)
    .join('\n\n');
  c.personality = [traits.personalityTraits, traits.ideals, traits.bonds, traits.flaws]
    .map(asStr)
    .filter(Boolean)
    .join('\n\n');
  c.appearance =
    asStr(traits.appearance) || [x.hair, x.eyes, x.skin, x.height, x.weight].map(asStr).filter(Boolean).join(', ');
  c.xp = asNum(x.currentXp);
  c.hp = { current: 0, temp: asNum(x.temporaryHitPoints) };
  c.heroicInspiration = x.inspiration === true;
  const death = isObj(x.deathSaves) ? x.deathSaves : {};
  c.deathSaves = { successes: asNum(death.successCount), failures: asNum(death.failCount) };
  return (normalizeCharacter(c) as Dnd5eCharacter | null) ?? c;
}
