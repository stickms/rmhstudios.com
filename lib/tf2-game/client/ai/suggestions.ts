/**
 * Which suggestion chips the in-game quick AI bars offer: for the HUD, by your class, the weapon in
 * your hands and the screen you play on (a Medic gets "Bigger Über meter", a Sniper "Charge meter by
 * the crosshair", a phone "Keep clear of touch buttons"); for the loadout, by the live match (the
 * enemy team's most common class, what keeps killing you, the map). Pure: ids and parameters only —
 * the bars turn them into words (i18n) and requests.
 */

import { CLASS_NAMES } from '@/lib/tf2-game/core/constants';
import type { LoadoutMatchContext } from '@/lib/tf2-loadout/ai-core';
import type { TfClass } from '@/lib/tf2-loadout/catalog-types';
import {
  AMMO_FILE,
  CLASS_FILE,
  HEALTH_FILE,
  HUDLAYOUT,
  MEDIC_FILE,
  SCHEME_FILE,
  type HudPresetId,
} from './hud-presets';

// ─── HUD ───────────────────────────────────────────────────────────────────

export type HudSuggestionId =
  | 'medic-uber'
  | 'sniper-charge'
  | 'bow-charge'
  | 'demo-stickies'
  | 'spy-cloak'
  | 'engineer-metal'
  | 'touch-clear'
  | 'ultrawide'
  | 'bigger-health'
  | 'bigger-ammo'
  | 'ammo-crosshair'
  | 'minimal';

export interface HudSuggestion {
  id: HudSuggestionId;
  /** A local preset that does the same without the AI (signed out, or the AI is unavailable). */
  preset?: HudPresetId;
  /** The files the request is about, so the AI skips its "which files?" step. */
  files?: readonly string[];
}

export interface HudSuggestionInput {
  /** ETFClass (0 before a class is picked). */
  cls: number;
  /** The active weapon's name, any case ("Huntsman"). */
  weapon?: string | null;
  /** Touch controls are on screen. */
  touch: boolean;
  /** Screen width / height. */
  aspect: number;
}

const CATALOG: Readonly<Record<HudSuggestionId, HudSuggestion>> = {
  'medic-uber': { id: 'medic-uber', preset: 'bigger-uber', files: [HUDLAYOUT, MEDIC_FILE] },
  'sniper-charge': { id: 'sniper-charge', preset: 'meters-centre', files: [HUDLAYOUT] },
  'bow-charge': { id: 'bow-charge', preset: 'meters-centre', files: [HUDLAYOUT] },
  'demo-stickies': { id: 'demo-stickies', preset: 'meters-centre', files: [HUDLAYOUT] },
  'spy-cloak': { id: 'spy-cloak', preset: 'meters-centre', files: [HUDLAYOUT] },
  'engineer-metal': { id: 'engineer-metal', files: [HUDLAYOUT, 'resource/ui/hudaccountpanel.res'] },
  'touch-clear': { id: 'touch-clear', preset: 'clear-touch', files: [HUDLAYOUT] },
  ultrawide: { id: 'ultrawide', files: [HUDLAYOUT, HEALTH_FILE] },
  'bigger-health': { id: 'bigger-health', preset: 'bigger-health', files: [HEALTH_FILE, SCHEME_FILE] },
  'bigger-ammo': { id: 'bigger-ammo', preset: 'bigger-ammo', files: [HUDLAYOUT, AMMO_FILE] },
  'ammo-crosshair': { id: 'ammo-crosshair', preset: 'ammo-centre', files: [HUDLAYOUT] },
  minimal: { id: 'minimal', preset: 'minimal', files: [CLASS_FILE, HEALTH_FILE, AMMO_FILE] },
};

export const hudSuggestion = (id: HudSuggestionId): HudSuggestion => CATALOG[id];

const isBow = (w: string): boolean => /huntsman|compound|bow\b|crossbow/i.test(w);

/** The chips for this player and screen, most specific first, at most `max`. */
export function hudSuggestions(input: HudSuggestionInput, max = 5): HudSuggestion[] {
  const ids: HudSuggestionId[] = [];
  const cls = CLASS_NAMES[input.cls] ?? '';
  const weapon = input.weapon ?? '';
  if (cls === 'medic') ids.push('medic-uber');
  if (cls === 'sniper') ids.push(isBow(weapon) ? 'bow-charge' : 'sniper-charge');
  if (cls === 'demoman') ids.push('demo-stickies');
  if (cls === 'spy') ids.push('spy-cloak');
  if (cls === 'engineer') ids.push('engineer-metal');
  if (input.touch) ids.push('touch-clear');
  if (input.aspect >= 2.2) ids.push('ultrawide');
  ids.push('bigger-health', 'ammo-crosshair', 'minimal', 'bigger-ammo');
  return [...new Set(ids)].slice(0, max).map((id) => CATALOG[id]);
}

/**
 * The local presets offered without the AI (signed out, or the AI unavailable): the chips that have one,
 * in the same order, one chip per preset (a Sniper's "charge by the crosshair" and a Demoman's stickies
 * are the same edit).
 */
export function localPresetSuggestions(input: HudSuggestionInput, max = 5): HudSuggestion[] {
  const withPreset = hudSuggestions(input, 99).filter((s) => s.preset);
  return withPreset
    .filter((s, i) => withPreset.findIndex((x) => x.preset === s.preset) === i)
    .slice(0, max);
}

// ─── Loadout ───────────────────────────────────────────────────────────────

export type LoadoutSuggestionId =
  | 'counter-class'
  | 'counter-weapon'
  | 'jump-set'
  | 'map'
  | 'festive'
  | 'spooky';

export interface LoadoutSuggestion {
  id: LoadoutSuggestionId;
  /** Interpolated into the chip's words. */
  params?: { cls?: TfClass; weapon?: string; map?: string };
  /**
   * Words for the local name matcher (`heuristicSuggest`) when there is no AI: item names that fit the
   * chip for the classes that can use them. Empty: the chip needs the AI.
   */
  localWords: string;
}

/** Item-name words that tend to answer a class, for the no-AI matcher (only items your class can use match). */
const COUNTER_WORDS: Readonly<Partial<Record<TfClass, string>>> = {
  sniper: 'razorback darwin danger shield',
  spy: 'razorback spy-cicle',
  pyro: 'reserve shooter detonator',
  soldier: 'battalion gunboats',
  demoman: 'battalion splendid screen',
  heavy: 'natascha tomislav',
  scout: 'shortstop natascha',
  medic: 'crusader crossbow',
  engineer: 'loose cannon',
};

const JUMP_WORDS: Readonly<Partial<Record<TfClass, string>>> = {
  soldier: 'rocket jumper gunboats mantreads market gardener',
  demoman: 'sticky jumper chargin targe',
};

/**
 * The chips for the loadout tab `cls` in this match, most useful first, at most `max`. Counters come
 * from the match (the enemy's most common class, a weapon that killed you twice or more).
 */
export function loadoutSuggestions(
  cls: TfClass,
  ctx: LoadoutMatchContext,
  max = 4,
): LoadoutSuggestion[] {
  const out: LoadoutSuggestion[] = [];
  const top = ctx.deaths?.[0];
  if (top && top.n >= 2) out.push({ id: 'counter-weapon', params: { weapon: top.weapon }, localWords: '' });
  const enemy = ctx.enemies?.[0];
  if (enemy) out.push({ id: 'counter-class', params: { cls: enemy.cls }, localWords: COUNTER_WORDS[enemy.cls] ?? '' });
  const jump = JUMP_WORDS[cls];
  if (jump) out.push({ id: 'jump-set', params: { cls }, localWords: jump });
  if (ctx.map) out.push({ id: 'map', params: { map: ctx.map }, localWords: '' });
  out.push({ id: 'festive', localWords: 'festive' });
  out.push({ id: 'spooky', localWords: 'spooky ghost pumpkin skull' });
  return out.slice(0, max);
}
