/**
 * What the in-game quick AI bars tell the assistants about the match, built from the HUD's own state
 * (lib/tf2-game/client/hud-state.ts) — never from anything the player typed, and with no player names:
 *
 *  - {@link matchContextFrom}: the loadout assistant's `context` (map, mode, round, your class and
 *    team, the enemy team's classes from the scoreboard, what has been killing you);
 *  - {@link noteDeaths} / {@link summariseDeaths}: a small log of your deaths, fed from the kill feed
 *    (whose entries only live ten seconds) so "counter what keeps killing me" still knows after the
 *    feed has moved on;
 *  - {@link hudQuickContext}: the note the HUD assistant gets with a request (class, weapon, screen,
 *    touch controls), sent as its `context` data.
 *
 * Everything is capped to the endpoints' limits so a request is never refused for its context.
 */

import { CLASS_NAMES } from '@/lib/tf2-game/core/constants';
import { AI_CONTEXT_LIMIT } from '@/lib/tf2-hud/ai-context';
import { MATCH_CONTEXT_LIMITS, type LoadoutMatchContext } from '@/lib/tf2-loadout/ai-core';
import type { TfClass } from '@/lib/tf2-loadout/catalog-types';
import type { HudState } from '../hud-state';

// eslint-disable-next-line no-control-regex -- control characters are removed on purpose
const CONTROL = /[\u0000-\u001f\u007f]+/g;
const clean = (s: string, max: number): string =>
  s.replace(CONTROL, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

const classOf = (cls: number): TfClass | undefined =>
  cls > 0 && cls < CLASS_NAMES.length ? (CLASS_NAMES[cls] as TfClass) : undefined;

/** One of your deaths, from the kill feed. */
export interface DeathRecord {
  /** The kill feed entry's id (deduplicates repeated snapshots). */
  id: number;
  weapon: string;
  cls?: TfClass;
}

/** How many deaths the log keeps (oldest dropped first). */
export const DEATH_LOG_MAX = 20;

/**
 * Add the local player's new deaths in `state.killfeed` to `log`. Returns `log` itself when nothing is
 * new (cheap to call on every HUD publish). Suicides, the world and buildings' own deaths are skipped;
 * a sentry kill counts as the Engineer's sentry.
 */
export function noteDeaths(log: readonly DeathRecord[], state: HudState): readonly DeathRecord[] {
  const me = state.local?.id;
  if (me === undefined || !state.killfeed.length) return log;
  let next: DeathRecord[] | null = null;
  for (const k of state.killfeed) {
    if (k.victim.id !== me || !k.attacker || k.attacker.id === me) continue;
    if (log.some((d) => d.id === k.id) || next?.some((d) => d.id === k.id)) continue;
    const row = state.scoreboard.find((r) => r.id === k.attacker!.id);
    const weapon = clean(k.weaponName || k.icon || '', MATCH_CONTEXT_LIMITS.name);
    if (!weapon) continue;
    (next ??= [...log]).push({ id: k.id, weapon, cls: row ? classOf(row.cls) : undefined });
  }
  return next ? next.slice(-DEATH_LOG_MAX) : log;
}

/** Deaths by weapon (and the killer's class), most often first, capped for the endpoint. */
export function summariseDeaths(log: readonly DeathRecord[]): NonNullable<LoadoutMatchContext['deaths']> {
  const by = new Map<string, { weapon: string; cls?: TfClass; n: number; last: number }>();
  log.forEach((d, i) => {
    const key = `${d.weapon.toLowerCase()}|${d.cls ?? ''}`;
    const cur = by.get(key);
    if (cur) {
      cur.n++;
      cur.last = i;
    } else by.set(key, { weapon: d.weapon, cls: d.cls, n: 1, last: i });
  });
  return [...by.values()]
    .sort((a, b) => b.n - a.n || b.last - a.last)
    .slice(0, MATCH_CONTEXT_LIMITS.deaths)
    .map(({ weapon, cls, n }) => ({ weapon, ...(cls ? { cls } : {}), n: Math.min(99, n) }));
}

/** The loadout assistant's `context` for this moment of the match. */
export function matchContextFrom(state: HudState, deaths: readonly DeathRecord[] = []): LoadoutMatchContext {
  const ctx: LoadoutMatchContext = {};
  const map = clean(state.match.map ?? '', MATCH_CONTEXT_LIMITS.name);
  if (map) ctx.map = map;
  if (state.match.mode) ctx.mode = state.match.mode;
  if (state.match.roundState) ctx.round = state.match.roundState;
  const local = state.local;
  const yourClass = local ? classOf(local.cls) : undefined;
  if (yourClass) ctx.yourClass = yourClass;
  if (local?.team === 2) ctx.team = 'red';
  else if (local?.team === 3) ctx.team = 'blu';

  if (local && local.team >= 2) {
    const counts = new Map<TfClass, number>();
    for (const r of state.scoreboard) {
      if (r.isLocal || r.team < 2 || r.team === local.team) continue;
      const c = classOf(r.cls);
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const enemies = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || CLASS_NAMES.indexOf(a[0]) - CLASS_NAMES.indexOf(b[0]))
      .slice(0, MATCH_CONTEXT_LIMITS.enemies)
      .map(([cls, n]) => ({ cls, n: Math.min(32, n) }));
    if (enemies.length) ctx.enemies = enemies;
  }
  const log = noteDeaths(deaths, state);
  const summary = summariseDeaths(log);
  if (summary.length) ctx.deaths = summary;
  return ctx;
}

const CLASS_LABEL: Readonly<Record<TfClass, string>> = {
  scout: 'Scout',
  sniper: 'Sniper',
  soldier: 'Soldier',
  demoman: 'Demoman',
  medic: 'Medic',
  heavy: 'Heavy',
  pyro: 'Pyro',
  spy: 'Spy',
  engineer: 'Engineer',
};

/**
 * The HUD assistant's note about where the player is (sent as `context`, which the server quotes as
 * data): their class and weapon, the screen and whether touch buttons cover its corners. Nothing else —
 * not the HUD's name, not the player's.
 */
export function hudQuickContext(a: {
  cls: number;
  weapon?: string | null;
  screen: { w: number; h: number };
  touch: boolean;
}): string {
  const lines: string[] = [];
  const cls = classOf(a.cls);
  const weapon = a.weapon ? clean(a.weapon, 40) : '';
  if (cls) lines.push(`In game, playing ${CLASS_LABEL[cls]}${weapon ? `, holding the ${weapon}` : ''}.`);
  else lines.push('In game, no class picked yet.');
  const w = Math.max(1, Math.round(a.screen.w));
  const h = Math.max(1, Math.round(a.screen.h));
  lines.push(`Screen ${w}x${h} px (aspect ${(w / h).toFixed(2)}; the HUD's 480-unit height is ${h} px).`);
  if (a.touch) {
    lines.push(
      'Touch controls are on: fire, jump and weapon buttons cover the bottom-right corner (about the lowest 45% of the screen height), the move stick the lower left. Keep HUD elements the player needs clear of them.',
    );
  }
  return lines.join('\n').slice(0, AI_CONTEXT_LIMIT);
}
