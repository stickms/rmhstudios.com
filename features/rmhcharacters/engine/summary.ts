/**
 * The sheet the advisor reads: the Markdown export, plus what the next level
 * grants and what the rules engine flags as unfinished, so "what should I take
 * when I level up?" is answered from the real schedule rather than the model's
 * memory of it.
 */
import { ADVISOR_LIMITS } from './advisor-limits';
import { loadDnd5e, loadPf2e } from './data';
import * as d5 from './dnd5e/rules';
import * as p2 from './pf2e/rules';
import { dnd5eMarkdown, pf2eMarkdown } from './formats/markdown';
import type { Character } from './types';

export async function advisorSheet(c: Character): Promise<string> {
  const lines: string[] = [];
  if (c.system === 'dnd5e') {
    const d = await loadDnd5e();
    lines.push(dnd5eMarkdown({ ...c, portrait: undefined } as typeof c, d));
    lines.push('', '## Next level');
    for (const k of c.classes.length ? c.classes : []) {
      const p = d5.previewLevelUp(c, d, k.classId);
      if (!p) continue;
      const name = d.classes.find((x) => x.id === k.classId)?.name ?? k.classId;
      const parts = [
        `${name} ${p.newClassLevel} (character level ${p.newCharacterLevel}): +${p.hpAverage} HP average (d${p.hitDie})`,
        p.features.length ? `features: ${p.features.map((f) => f.name).join(', ')}` : '',
        p.subclassChoice ? 'choose a subclass' : '',
        p.asi ? 'Ability Score Improvement or a feat' : '',
        p.epicBoon ? 'Epic Boon feat' : '',
        p.cantripsGained ? `+${p.cantripsGained} cantrip(s)` : '',
        p.preparedGained ? `+${p.preparedGained} prepared spell(s)` : '',
        p.newSlots.some(Boolean)
          ? `new slots: ${p.newSlots
              .map((n, i) => (n ? `level ${i + 1} +${n}` : ''))
              .filter(Boolean)
              .join(', ')}`
          : '',
        p.masteryGained ? `+${p.masteryGained} weapon mastery` : '',
        p.proficiencyBonusUp ? 'proficiency bonus increases' : '',
      ];
      lines.push(`- ${parts.filter(Boolean).join('; ')}`);
    }
    const multi = d.classes
      .filter((k) => !c.classes.some((x) => x.classId === k.id) && d5.meetsMulticlass(c, d, k))
      .map((k) => k.name);
    if (multi.length) lines.push(`- Multiclass options that meet the 13+ prerequisite: ${multi.join(', ')}`);
    const issues = d5.validate(c, d);
    if (issues.length) lines.push('', '## Unfinished or flagged', ...issues.map((i) => `- ${i}`));
  } else {
    const d = await loadPf2e();
    lines.push(pf2eMarkdown({ ...c, portrait: undefined } as typeof c, d));
    const p = p2.previewLevelUp(c, d);
    if (p) {
      lines.push('', '## Next level', `- Level ${p.newLevel}: +${p.hpGain} HP`);
      if (p.features.length) lines.push(`- Class features: ${p.features.map((f) => f.name).join(', ')}`);
      if (p.improvements.length)
        lines.push(
          `- Proficiency increases: ${p.improvements.map((i) => `${i.stat} → ${p2.RANK_NAMES[i.rank]}`).join(', ')}`,
        );
      if (p.slots.length) lines.push(`- Feats: ${p.slots.map((s) => s.label).join(', ')}`);
      if (p.skillIncrease) lines.push('- A skill increase');
      if (p.attributeBoosts) lines.push('- Four attribute boosts');
      if (p.newSpellRank) lines.push('- A new spell rank');
    }
    const issues = p2.validate(c, d);
    if (issues.length) lines.push('', '## Unfinished or flagged', ...issues.map((i) => `- ${i}`));
  }
  const text = lines.join('\n');
  return text.length > ADVISOR_LIMITS.sheet ? `${text.slice(0, ADVISOR_LIMITS.sheet - 20)}\n…(truncated)` : text;
}
