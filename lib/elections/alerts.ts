/**
 * Who gets told about what. Client-safe and pure.
 *
 * Alerts are the browser's own notifications, raised by the open page when a live event arrives, so they work
 * with nothing stored on the server. The viewer chooses: major moments (a chamber clinched, a big call),
 * every call, and/or anything in states they follow.
 */

import type { ElectionEvent } from './events';

export interface AlertPrefs {
  /** Major moments anywhere (importance 3). */
  major: boolean;
  /** Every race call and flip anywhere. */
  calls: boolean;
  /** Anything (calls, flips, lead changes, polls closing) in these states, as USPS codes. */
  states: string[];
  /** A short chime when something matches (works even without notification permission). */
  sound: boolean;
}

export const DEFAULT_ALERTS: AlertPrefs = { major: true, calls: false, states: [], sound: false };

export const MAX_FOLLOWED = 12;

const POSTAL = /^[A-Z]{2}$/;

/** Parse stored prefs defensively: anything unexpected falls back to the defaults. */
export function parseAlertPrefs(raw: string | null | undefined): AlertPrefs {
  if (!raw) return DEFAULT_ALERTS;
  try {
    const v = JSON.parse(raw) as Partial<AlertPrefs>;
    return {
      major: typeof v.major === 'boolean' ? v.major : DEFAULT_ALERTS.major,
      calls: typeof v.calls === 'boolean' ? v.calls : DEFAULT_ALERTS.calls,
      sound: typeof v.sound === 'boolean' ? v.sound : DEFAULT_ALERTS.sound,
      states: Array.isArray(v.states) ? [...new Set(v.states.filter((s): s is string => typeof s === 'string' && POSTAL.test(s)))].slice(0, MAX_FOLLOWED) : [],
    };
  } catch {
    return DEFAULT_ALERTS;
  }
}

/** Headlines (news) never raise an alert; everything else is judged against the viewer's choices. */
export function shouldAlert(ev: ElectionEvent, prefs: AlertPrefs): boolean {
  if (ev.kind === 'news') return false;
  if (prefs.states.length && ev.state && prefs.states.includes(ev.state)) return true;
  if (prefs.major && ev.importance >= 3) return true;
  if (prefs.calls && (ev.kind === 'call' || ev.kind === 'flip' || ev.kind === 'clinch')) return true;
  return false;
}

const TITLE: Record<ElectionEvent['kind'], string> = {
  call: 'Race called',
  flip: 'Seat flips',
  'lead-change': 'Lead changes',
  'polls-closed': 'Polls closed',
  clinch: 'Control decided',
  news: 'News',
};

export const alertTitle = (ev: ElectionEvent): string => TITLE[ev.kind];

export function toggleState(states: string[], postal: string): string[] {
  if (!POSTAL.test(postal)) return states;
  if (states.includes(postal)) return states.filter((s) => s !== postal);
  return states.length >= MAX_FOLLOWED ? states : [...states, postal];
}
