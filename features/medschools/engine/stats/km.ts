/**
 * Kaplan-Meier "complete to interview invite" (phase 5, D5): the product-limit estimate over an aggregate of
 * observations. Nothing here knows whose observation is whose; the caller hands in `{ days, event }` and gets a step
 * function. Pure.
 */
import { CHANCE_STEP_PERCENT, KM_BIN_DAYS, KM_MAX_DAY, KM_MIN_AT_RISK, KM_MIN_SURVIVAL } from './constants';
import { dayIndex } from './days';

/** Days from COMPLETE; `event` = invited (false = censored: still waiting, rejected, withdrawn, accepted elsewhere). */
export interface Obs {
  days: number;
  event: boolean;
}
/**
 * Steps: after time t[i] the survival is s[i] and n[i] members were at risk at t[i]; all ascending in t. Only times with
 * an invite are steps. `n` is the at-risk count the floor reads (R13).
 */
export interface SurvivalCurve {
  t: number[];
  s: number[];
  n: number[];
}

/** Whole weeks, rounded up: t' = 7 * ceil(t / 7). */
export const weekCeil = (days: number): number => KM_BIN_DAYS * Math.ceil(days / KM_BIN_DAYS);

/** An observation with its time in whole weeks (R13); the 180-day cap was applied before, so no time passes 182. */
export const binObs = (o: Obs): Obs => ({ days: weekCeil(o.days), event: o.event });

const cap = (o: Obs): Obs => (o.days > KM_MAX_DAY ? { days: KM_MAX_DAY, event: false } : o);

/**
 * One application as an observation, or null when it is not one: COMPLETE after `asOf`, or an invite dated before
 * COMPLETE. An invite after `asOf` has not happened yet. A wait past 180 days is censored at 180.
 */
export function observationOf(
  a: { completeOn: string; inviteOn: string | null; endOn: string | null },
  asOf: string,
): Obs | null {
  const complete = dayIndex(a.completeOn);
  const now = dayIndex(asOf);
  if (complete > now) return null;
  // An invite before COMPLETE is dropped; so is an end date before COMPLETE (a rejection or withdrawal cannot precede it).
  if (a.endOn !== null && dayIndex(a.endOn) < complete) return null;
  if (a.inviteOn !== null) {
    const invite = dayIndex(a.inviteOn);
    if (invite < complete) return null;
    if (invite <= now) return cap({ days: invite - complete, event: true });
  }
  let end = now;
  if (a.endOn !== null) {
    const e = dayIndex(a.endOn);
    if (e <= now) end = e;
  }
  return cap({ days: end - complete, event: false });
}

export function kaplanMeier(obs: readonly Obs[]): SurvivalCurve {
  const sorted = obs.map(cap).sort((a, b) => a.days - b.days);
  const t: number[] = [];
  const s: number[] = [];
  const n: number[] = [];
  let atRisk = sorted.length;
  let surv = 1;
  let i = 0;
  while (i < sorted.length) {
    const time = sorted[i]?.days ?? 0;
    let events = 0;
    let leaving = 0;
    // Events and censorings tied at `time`: the events count first, the censored are still at risk for them.
    while (i < sorted.length && sorted[i]?.days === time) {
      if (sorted[i]?.event) events++;
      leaving++;
      i++;
    }
    if (events > 0 && atRisk > 0) {
      surv *= 1 - events / atRisk;
      t.push(time);
      s.push(Math.round(surv * 1000) / 1000);
      n.push(atRisk);
    }
    atRisk -= leaving;
  }
  return { t, s, n };
}

/** 1 before the first step, otherwise the value of the last step at or before `t`. */
export function survivalAt(c: SurvivalCurve, t: number): number {
  let v = 1;
  for (let i = 0; i < c.t.length; i++) {
    if ((c.t[i] ?? 0) > t) break;
    v = c.s[i] ?? v;
  }
  return v;
}

/**
 * The last week (a multiple of 7) with at least `KM_MIN_AT_RISK` members at risk, where at risk at week w means a
 * binned time of w or more. 0 when even week 0 is thin. `obs` are the binned observations (`binObs`).
 */
export function maxDayOf(obs: readonly Obs[]): number {
  const longest = obs.reduce((m, o) => Math.max(m, o.days), 0);
  for (let w = Math.min(weekCeil(KM_MAX_DAY), weekCeil(longest)); w > 0; w -= KM_BIN_DAYS) {
    if (obs.filter((o) => o.days >= w).length >= KM_MIN_AT_RISK) return w;
  }
  return 0;
}

/**
 * P(invite by the week of elapsed + horizon | none by the week of elapsed) = 1 - S(target) / S(week), rounded to the
 * nearest 5%. Everything is on the weekly grid (R13): `elapsed` is rounded up to its week and the horizon up to whole
 * weeks, so the answer is the same for every day in a week. Null when the target passes `maxDay` (the last week with at
 * least 10 members at risk, which also puts at least 10 at risk at the caller's week), or when almost nobody
 * comparable is still waiting.
 */
export function inviteChance(c: SurvivalCurve, maxDay: number, elapsed: number, horizon: number): number | null {
  if (elapsed < 0 || horizon <= 0) return null;
  const week = weekCeil(elapsed);
  const target = week + weekCeil(horizon);
  if (target > maxDay) return null;
  const now = survivalAt(c, week);
  if (now < KM_MIN_SURVIVAL) return null;
  const later = survivalAt(c, target);
  const raw = Math.min(1, Math.max(0, 1 - later / now));
  const step = CHANCE_STEP_PERCENT / 100;
  return Math.round(Math.round(raw / step) * step * 100) / 100;
}
