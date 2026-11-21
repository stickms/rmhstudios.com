/**
 * Pathbuilder 2e JSON ("Export JSON" / the `json.php?id=` endpoint):
 * `{ success: true, build: { name, class, level, ancestry, heritage,
 * background, abilities, attributes, proficiencies, feats, lores, equipment,
 * weapons, armor, spellCasters, focus, money, languages, … } }`.
 *
 * Proficiencies are written as the proficiency number (0 / 2 / 4 / 6 / 8), and
 * attributes as scores (10 + 2 × modifier). Feats are tuples
 * `[name, extra, type, level, slotLabel?, ...]`.
 */
import { newId, newPf2e, normalizeCharacter } from '../factory';
import * as p2 from '../pf2e/rules';
import { ABILITIES, PF2E_SKILLS, type Ability, type Pf2eCharacter, type Pf2eData } from '../types';
import { asArr, asNum, asStr, isObj, matchByName, type Obj } from './util';

export function isPathbuilder(json: unknown): json is { build: Obj } {
  return isObj(json) && isObj(json.build) && 'ancestry' in json.build && 'class' in json.build;
}

const RANK_NUM = [0, 2, 4, 6, 8];

export function exportPathbuilder(c: Pf2eCharacter, d: Pf2eData) {
  const mods = p2.attributeMods(c);
  const ancestry = p2.ancestryOf(d, c);
  const klass = p2.classOf(d, c);
  const bg = p2.backgroundOf(d, c);
  const sc = p2.spellcasting(c, d);
  const breakdown = {
    ancestryFree: c.boosts.ancestry.filter((a) => !ancestry?.boosts.includes(a)).map((a) => a.toUpperCase()),
    ancestryBoosts: c.boosts.ancestry.filter((a) => ancestry?.boosts.includes(a)).map((a) => a.toUpperCase()),
    ancestryFlaws: (c.boosts.ancestryAltFree ? [] : c.boosts.ancestryFlaws).map((a) => a.toUpperCase()),
    backgroundBoosts: c.boosts.background.map((a) => a.toUpperCase()),
    classBoosts: c.boosts.class ? [c.boosts.class.toUpperCase()] : [],
    mapLevelledBoosts: Object.fromEntries(
      Object.entries(c.boosts.levels).map(([k, v]) => [k, v.map((a) => a.toUpperCase())]),
    ),
  };
  const proficiencies: Record<string, number> = {
    classDC: RANK_NUM[p2.statRank(c, d, 'classDC')] ?? 0,
    perception: RANK_NUM[p2.statRank(c, d, 'perception')] ?? 0,
    fortitude: RANK_NUM[p2.statRank(c, d, 'fortitude')] ?? 0,
    reflex: RANK_NUM[p2.statRank(c, d, 'reflex')] ?? 0,
    will: RANK_NUM[p2.statRank(c, d, 'will')] ?? 0,
    heavy: RANK_NUM[p2.statRank(c, d, 'heavy')] ?? 0,
    medium: RANK_NUM[p2.statRank(c, d, 'medium')] ?? 0,
    light: RANK_NUM[p2.statRank(c, d, 'light')] ?? 0,
    unarmored: RANK_NUM[p2.statRank(c, d, 'unarmored')] ?? 0,
    advanced: RANK_NUM[p2.statRank(c, d, 'advanced')] ?? 0,
    martial: RANK_NUM[p2.statRank(c, d, 'martial')] ?? 0,
    simple: RANK_NUM[p2.statRank(c, d, 'simple')] ?? 0,
    unarmed: RANK_NUM[p2.statRank(c, d, 'unarmed')] ?? 0,
    castingArcane: 0,
    castingDivine: 0,
    castingOccult: 0,
    castingPrimal: 0,
  };
  if (sc) proficiencies[`casting${sc.tradition[0]!.toUpperCase()}${sc.tradition.slice(1)}`] = RANK_NUM[sc.rank] ?? 0;
  for (const s of PF2E_SKILLS) proficiencies[s] = RANK_NUM[p2.skillRank(c, s)] ?? 0;
  const feats = c.feats.map((f) => {
    const feat = d.feats.find((x) => x.id === f.featId);
    const [type, lvl] = f.slot.split('-');
    const label =
      {
        ancestry: 'Ancestry Feat',
        class: 'Class Feat',
        skill: 'Skill Feat',
        general: 'General Feat',
        bonus: 'Awarded Feat',
      }[type ?? ''] ?? 'Awarded Feat';
    return [feat?.name ?? f.customName ?? '', null, label, Number(lvl) || feat?.level || 1];
  });
  const spellsByRank = new Map<number, string[]>();
  for (const id of c.spells.known) {
    const s = d.spells.find((x) => x.id === id);
    if (!s) continue;
    spellsByRank.set(s.rank, [...(spellsByRank.get(s.rank) ?? []), s.name]);
  }
  const armor = d.armor.find((a) => a.id === c.armorId);
  return {
    success: true,
    build: {
      name: c.name,
      class: klass?.name ?? '',
      dualClass: null,
      level: c.level,
      ancestry: ancestry?.name ?? '',
      heritage: p2.heritageOf(d, c)?.name ?? '',
      background: bg?.name ?? '',
      gender: '',
      age: '',
      deity: c.choices['cleric:deity'] ?? c.choices.deity ?? '',
      size: 2,
      sizeName: ancestry?.size ?? 'Medium',
      keyability: c.boosts.class ?? '',
      languages: c.languages,
      attributes: {
        ancestryhp: ancestry?.hp ?? 0,
        classhp: klass?.hp ?? 0,
        bonushp: 0,
        bonushpPerLevel: p2.hasFeat(c, 'toughness') ? 1 : 0,
        speed: ancestry?.speed ?? 25,
        speedBonus: 0,
      },
      abilities: { ...Object.fromEntries(ABILITIES.map((a) => [a, 10 + 2 * mods[a]])), breakdown },
      proficiencies,
      feats,
      specials: (klass?.features ?? []).filter((f) => f.level <= c.level).map((f) => f.name),
      lores: c.lores.map((l) => [l.replace(/\s*Lore$/i, ''), RANK_NUM[p2.skillRank(c, l) || 1]]),
      equipment: c.inventory
        .filter((i) => !d.weapons.some((w) => w.id === i.refId) && !d.armor.some((a) => a.id === i.refId))
        .map((i) => [i.name, i.quantity]),
      weapons: c.inventory
        .filter((i) => d.weapons.some((w) => w.id === i.refId))
        .map((i) => {
          const w = d.weapons.find((x) => x.id === i.refId)!;
          return {
            name: i.name,
            qty: i.quantity,
            prof: w.category,
            die: w.damage.replace(/^\d*/, ''),
            pot: 0,
            str: '',
            mat: null,
            display: i.name,
            runes: [],
            damageType: w.damageType,
          };
        }),
      armor: armor
        ? [
            {
              name: armor.name,
              qty: 1,
              prof: armor.category,
              pot: 0,
              res: '',
              mat: null,
              display: armor.name,
              worn: true,
              runes: [],
            },
          ]
        : [],
      money: { pp: c.currency.pp, gp: c.currency.gp, sp: c.currency.sp, cp: c.currency.cp },
      spellCasters: sc
        ? [
            {
              name: klass?.name ?? '',
              magicTradition: sc.tradition,
              spellcastingType: sc.type,
              ability: sc.ability,
              proficiency: RANK_NUM[sc.rank] ?? 0,
              focusPoints: 0,
              innate: false,
              perDay: [sc.cantrips, ...sc.slots],
              spells: [...spellsByRank.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([spellLevel, list]) => ({ spellLevel, list })),
              prepared: [],
              blendedSpells: [],
            },
          ]
        : [],
      focusPoints: c.focusPoints,
      focus: {},
      pets: [],
      acTotal: {
        acProfBonus: 0,
        acAbilityBonus: 0,
        acItemBonus: armor?.acBonus ?? 0,
        acTotal: p2.armorClass(c, d).value,
        shieldBonus: null,
      },
    },
  };
}

const abil = (v: unknown): Ability | null => {
  const s = asStr(v).toLowerCase();
  return (ABILITIES as readonly string[]).includes(s) ? (s as Ability) : null;
};
const abilList = (v: unknown): Ability[] =>
  asArr(v)
    .map(abil)
    .filter((a): a is Ability => Boolean(a));

export function importPathbuilder(json: { build: Obj }, d: Pf2eData): Pf2eCharacter {
  const b = json.build;
  const c = newPf2e();
  c.name = asStr(b.name).slice(0, 120);
  c.level = Math.min(20, Math.max(1, asNum(b.level, 1)));
  const ancestry = matchByName(d.ancestries, b.ancestry);
  if (ancestry) c.ancestryId = ancestry.id;
  const heritage = matchByName(ancestry?.heritages ?? [], b.heritage) ?? matchByName(d.versatileHeritages, b.heritage);
  if (heritage) c.heritageId = heritage.id;
  const bg = matchByName(d.backgrounds, b.background);
  if (bg) c.backgroundId = bg.id;
  const klass = matchByName(d.classes, b.class);
  if (klass) c.classId = klass.id;
  c.languages = asArr(b.languages).map(asStr).filter(Boolean);
  const deity = asStr(b.deity);
  if (deity && deity !== 'Not set') c.choices.deity = deity;

  const abilities = isObj(b.abilities) ? b.abilities : {};
  const br = isObj(abilities.breakdown) ? abilities.breakdown : null;
  if (br) {
    c.boosts.ancestry = [...abilList(br.ancestryBoosts), ...abilList(br.ancestryFree)];
    c.boosts.ancestryFlaws = abilList(br.ancestryFlaws);
    c.boosts.ancestryAltFree = Boolean(ancestry && ancestry.flaws.length && !c.boosts.ancestryFlaws.length);
    c.boosts.background = abilList(br.backgroundBoosts);
    c.boosts.class = abilList(br.classBoosts)[0] ?? abil(b.keyability);
    const lv = isObj(br.mapLevelledBoosts) ? br.mapLevelledBoosts : {};
    for (const [k, v] of Object.entries(lv)) c.boosts.levels[k] = abilList(v).slice(0, 4);
  } else {
    // Old exports carry only final scores: put the whole spread into free boosts at level 1+.
    c.boosts.class = abil(b.keyability);
    const want: Record<Ability, number> = Object.fromEntries(
      ABILITIES.map((a) => [a, Math.floor((asNum(abilities[a], 10) - 10) / 2)]),
    ) as Record<Ability, number>;
    c.custom.push({
      id: newId(),
      name: 'Imported attribute modifiers',
      text: ABILITIES.map((a) => `${a.toUpperCase()} ${p2.signed(want[a])}`).join(', '),
      kind: 'Import note',
    });
  }

  const prof = isObj(b.proficiencies) ? b.proficiencies : {};
  const incLevels = p2.skillIncreaseLevels(c, d, 20).filter((l) => l <= c.level);
  for (const sk of PF2E_SKILLS) {
    const rank = Math.round(asNum(prof[sk]) / 2);
    if (rank >= 1) c.trainedSkills.push(sk);
    for (let r = 2; r <= rank; r++) {
      const free = incLevels.find((l) => !c.skillIncreases[String(l)] && (r < 3 || l >= 7) && (r < 4 || l >= 15));
      if (free !== undefined) c.skillIncreases[String(free)] = sk;
    }
  }
  for (const lore of asArr(b.lores)) {
    const name = asStr(Array.isArray(lore) ? lore[0] : lore);
    if (name) c.lores.push(/lore$/i.test(name) ? name : `${name} Lore`);
  }

  let extra = 0;
  for (const f of asArr(b.feats)) {
    if (!Array.isArray(f)) continue;
    const name = asStr(f[0]);
    const label = asStr(f[2]).toLowerCase();
    const level = asNum(f[3], 1);
    const background = asStr(f[4]).toLowerCase().includes('background');
    const type = background
      ? 'bonus'
      : label.includes('ancestry')
        ? 'ancestry'
        : label.includes('class') || label.includes('archetype')
          ? 'class'
          : label.includes('skill')
            ? 'skill'
            : label.includes('general')
              ? 'general'
              : 'extra';
    let slot = type === 'bonus' ? 'bonus-1' : `${type}-${level}`;
    if (type === 'extra' || c.feats.some((x) => x.slot === slot)) slot = `extra-${level}-${extra++}`;
    const feat = matchByName(d.feats, name);
    c.feats.push(feat ? { slot, featId: feat.id } : { slot, customName: name });
  }

  for (const e of asArr(b.equipment)) {
    if (!Array.isArray(e)) continue;
    const ref = matchByName(d.gear, e[0]);
    c.inventory.push({
      id: newId(),
      name: asStr(e[0]),
      quantity: Math.max(1, asNum(e[1], 1)),
      equipped: false,
      bulk: 0,
      ...(ref ? { refId: ref.id, bulk: ref.bulk } : {}),
    });
  }
  for (const w of asArr(b.weapons)) {
    if (!isObj(w)) continue;
    const ref = matchByName(d.weapons, w.name);
    c.inventory.push({
      id: newId(),
      name: asStr(w.display) || asStr(w.name),
      quantity: Math.max(1, asNum(w.qty, 1)),
      equipped: true,
      bulk: ref?.bulk ?? 1,
      ...(ref ? { refId: ref.id } : {}),
    });
  }
  for (const a of asArr(b.armor)) {
    if (!isObj(a)) continue;
    const ref = matchByName(d.armor, a.name);
    c.inventory.push({
      id: newId(),
      name: asStr(a.display) || asStr(a.name),
      quantity: 1,
      equipped: a.worn === true,
      bulk: ref?.bulk ?? 1,
      ...(ref ? { refId: ref.id } : {}),
    });
    if (ref && a.worn === true && ref.category !== 'shield') c.armorId = ref.id;
  }
  const money = isObj(b.money) ? b.money : {};
  c.currency = { pp: asNum(money.pp), gp: asNum(money.gp), ep: 0, sp: asNum(money.sp), cp: asNum(money.cp) };

  for (const caster of asArr(b.spellCasters)) {
    if (!isObj(caster)) continue;
    const t = asStr(caster.magicTradition);
    if (t === 'arcane' || t === 'divine' || t === 'occult' || t === 'primal') c.spells.tradition = t;
    for (const rank of asArr(caster.spells)) {
      if (!isObj(rank)) continue;
      for (const name of asArr(rank.list)) {
        const s = matchByName(d.spells, name);
        if (s && !c.spells.known.includes(s.id)) c.spells.known.push(s.id);
      }
    }
  }
  const focus = isObj(b.focus) ? b.focus : {};
  for (const tradition of Object.values(focus)) {
    if (!isObj(tradition)) continue;
    for (const byAbility of Object.values(tradition)) {
      if (!isObj(byAbility)) continue;
      for (const key of ['focusCantrips', 'focusSpells']) {
        for (const name of asArr(byAbility[key])) {
          const s = matchByName(d.spells, name);
          if (s) c.spells.focusSpells.push(s.id);
        }
      }
    }
  }
  c.focusPoints = asNum(b.focusPoints);
  return (normalizeCharacter(c) as Pf2eCharacter | null) ?? c;
}
