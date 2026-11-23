/**
 * Every English content string of Signal Forge (card, enemy, relic, event, ascension and tutorial text) under
 * the i18n key the UI reads it with. The keys are built at run time (`card.${id}.name`), which the extractor
 * cannot see, so `features/signal-forge/scripts/content-keys.ts` writes them into locales/en/c-signal-forge.json
 * and __tests__/content.test.ts fails when the two drift.
 */
import { SIGNAL_FORGE_ACHIEVEMENT_NAMES } from './achievements';
import { ASCENSION } from './balance';
import { LABELS } from './labels';
import { CARDS } from './data/cards';
import { ENEMIES } from './data/enemies';
import { EVENTS } from './data/events';
import { RELICS } from './data/relics';
import { TUTORIAL_STEPS } from './tutorial';

export function contentStrings(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of CARDS) out[`card.${c.id}.name`] = c.name;
  for (const e of ENEMIES) {
    out[`enemy.${e.id}.name`] = e.name;
    out[`enemy.${e.id}.lore`] = e.lore;
    for (const m of e.moves) out[`enemy.${e.id}.move.${m.id}`] = m.name;
  }
  for (const r of RELICS) {
    out[`relic.${r.id}.name`] = r.name;
    out[`relic.${r.id}.text`] = r.text;
  }
  for (const ev of EVENTS) {
    out[`event.${ev.id}.title`] = ev.title;
    out[`event.${ev.id}.body`] = ev.body;
    for (const ch of ev.choices) out[`event.${ev.id}.${ch.id}`] = ch.label;
  }
  Object.assign(out, LABELS);
  for (const a of ASCENSION) out[`asc.${a.level}`] = a.text;
  for (const [id, name] of Object.entries(SIGNAL_FORGE_ACHIEVEMENT_NAMES)) out[`ach.${id}`] = name;
  for (const s of TUTORIAL_STEPS) {
    out[`tut.${s.id}.title`] = s.title;
    out[`tut.${s.id}.body`] = s.body;
  }
  return out;
}
