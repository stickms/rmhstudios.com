/**
 * Kaplan-Meier "complete to interview invite" (phase 5, D5): the product-limit estimate over an aggregate of
 * observations. Nothing here knows whose observation is whose; the caller hands in `{ days, event }` and gets a step
 * function. Pure.
 */
import { KM_MAX_DAY, KM_MIN_SURVIVAL } from './constants';
import { dayIndex } from './days';

/** Days from COMPLETE; `event` = invited (false = censored: still waiting, rejected, withdrawn, accepted elsewhere). */
export interface Obs {
  days: number;
  event: boolean;
}
/** Steps: after time t[i] the survival is s[i]; both ascending in t. Only times with an invite are steps. */
export interface SurvivalCurve {
  t: number[];
  s: number[];
}

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
  if (a.inviteOn !== null) {
    const invite = dayIndex(a.inviteOn);
    if (invite < complete) return null;
    if (invite <= now) return cap({ days: invite - complete, event: true });
  }
  let end = now;
  if (a.endOn !== null) {
    const e = dayIndex(a.endOn);
    if (e >= complete && e <= now) end = e;
  }
  return cap({ days: end - complete, event: false });
}

export function kaplanMeier(obs: readonly Obs[]): SurvivalCurve {
  const sorted = obs.map(cap).sort((a, b) => a.days - b.days);
  const t: number[] = [];
  const s: number[] = [];
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
    }
    atRisk -= leaving;
  }
  return { t, s };
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

/** The longest follow-up in the sample, capped at KM_MAX_DAY and never before the last step. */
export function maxDayOf(c: SurvivalCurve, obs: readonly Obs[]): number {
  const longest = obs.reduce((m, o) => Math.max(m, o.days), 0);
  return Math.min(KM_MAX_DAY, Math.max(longest, c.t[c.t.length - 1] ?? 0));
}

/**
 * P(invite by elapsed + horizon | none by elapsed) = 1 - S(elapsed + horizon) / S(elapsed). Null when the curve does not
 * reach elapsed + horizon, or when almost nobody comparable is still waiting at `elapsed`.
 */
export function inviteChance(c: SurvivalCurve, maxDay: number, elapsed: number, horizon: number): number | null {
  if (elapsed < 0 || horizon <= 0 || elapsed + horizon > maxDay) return null;
  const now = survivalAt(c, elapsed);
  if (now < KM_MIN_SURVIVAL) return null;
  const later = survivalAt(c, elapsed + horizon);
  return Math.round(Math.min(1, Math.max(0, 1 - later / now)) * 1000) / 1000;
}
