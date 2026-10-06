/**
 * The viewer's Dunesday plan — what they picked, how fast they watch, what they
 * have already seen — and everything derived from it: the ordered watch list,
 * the remaining work, the share link and the calendar export.
 *
 * It lives in the browser (localStorage) and in the URL when shared. There is no
 * account and no table behind it on purpose: a marathon plan is a personal,
 * short-lived thing that ends on 18 December, and requiring a sign-in to make
 * one would be the single biggest reason not to.
 */

import { DUNESDAY, TITLES, TITLE_BY_ID, defaultIncluded, type WatchTitle } from './titles';
import { addDays, localToday, type PlanSettings, type Remaining } from './schedule';

export type OrderMode = 'release' | 'story' | 'custom';
export type DunePlacement = 'end' | 'start' | 'mixed';

export interface CustomTitle {
  id: string;
  title: string;
  minutes: number;
  episodes?: number;
}

export interface DunesdayState {
  v: 1;
  settings: PlanSettings;
  order: OrderMode;
  dunePlacement: DunePlacement;
  customOrder: string[];
  included: Record<string, boolean>;
  /** id → the day it was ticked off (YYYY-MM-DD). */
  watched: Record<string, string>;
  /** Series id → episodes already watched. */
  episodesWatched: Record<string, number>;
  /** id → corrected runtime in minutes. */
  runtimeOverrides: Record<string, number>;
  customTitles: CustomTitle[];
  /** Re-plan from today rather than the original start date. */
  autoReplan: boolean;
  /** HH:MM — when each night's block starts, for the calendar export. */
  watchTime: string;
  night: boolean;
  /** Keep the assistant from spoiling anything not yet ticked off. */
  spoilerShield: boolean;
}

export const STORAGE_KEY = 'dunesday:v1';

export const WEIGHT_PRESETS = {
  even: [1, 1, 1, 1, 1, 1, 1],
  weekends: [2, 1, 1, 1, 1, 1, 2],
  weeknights: [0, 1, 1, 1, 1, 1, 0],
  weekendsOnly: [1, 0, 0, 0, 0, 0, 1],
} as const satisfies Record<string, PlanSettings['weekdayWeights']>;

export function defaultState(today = localToday()): DunesdayState {
  return {
    v: 1,
    settings: {
      startDate: today,
      // The night before: you want the 18th free for the cinema.
      deadline: addDays(DUNESDAY, -1),
      mode: 'fit',
      minutesPerDay: 120,
      weekdayWeights: [...WEIGHT_PRESETS.even],
      skipDates: [],
      overrunPct: 25,
      splitFilms: false,
    },
    order: 'release',
    dunePlacement: 'end',
    customOrder: [],
    included: Object.fromEntries(TITLES.map((t) => [t.id, defaultIncluded(t)])),
    watched: {},
    episodesWatched: {},
    runtimeOverrides: {},
    customTitles: [],
    autoReplan: true,
    watchTime: '19:30',
    night: false,
    spoilerShield: true,
  };
}

/**
 * Merge a stored or shared state onto the defaults. Anything malformed falls
 * back to the default field rather than throwing — a corrupt localStorage
 * entry should cost the viewer a setting, not the page.
 */
export function hydrateState(raw: unknown, today = localToday()): DunesdayState {
  const base = defaultState(today);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<DunesdayState>;
  const s = (r.settings ?? {}) as Partial<PlanSettings>;
  const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const num = (v: unknown, lo: number, hi: number, d: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  const record = <T>(v: unknown, ok: (x: unknown) => x is T): Record<string, T> => {
    const out: Record<string, T> = {};
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) if (ok(x)) out[k] = x;
    }
    return out;
  };
  const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;
  const isBool = (x: unknown): x is boolean => typeof x === 'boolean';
  const weights =
    Array.isArray(s.weekdayWeights) && s.weekdayWeights.length === 7
      ? (s.weekdayWeights.map((w) => num(w, 0, 4, 1)) as PlanSettings['weekdayWeights'])
      : base.settings.weekdayWeights;
  const customTitles = Array.isArray(r.customTitles)
    ? r.customTitles
        .filter(
          (c): c is CustomTitle =>
            !!c &&
            typeof c.id === 'string' &&
            c.id.startsWith('custom-') &&
            typeof c.title === 'string' &&
            isNum(c.minutes),
        )
        .slice(0, 30)
        .map((c) => ({
          id: c.id.slice(0, 40),
          title: c.title.slice(0, 80),
          minutes: Math.min(6000, Math.round(c.minutes)),
          episodes:
            isNum(c.episodes) && c.episodes >= 1
              ? Math.min(200, Math.round(c.episodes))
              : undefined,
        }))
    : [];

  return {
    v: 1,
    settings: {
      startDate: isDay(s.startDate) ? s.startDate : base.settings.startDate,
      deadline: isDay(s.deadline) ? s.deadline : base.settings.deadline,
      mode: s.mode === 'pace' || s.mode === 'fit' ? s.mode : base.settings.mode,
      minutesPerDay: num(s.minutesPerDay, 5, 1440, base.settings.minutesPerDay),
      weekdayWeights: weights,
      skipDates: Array.isArray(s.skipDates) ? s.skipDates.filter(isDay).slice(0, 120) : [],
      overrunPct: num(s.overrunPct, 0, 100, base.settings.overrunPct),
      splitFilms: typeof s.splitFilms === 'boolean' ? s.splitFilms : base.settings.splitFilms,
    },
    order: r.order === 'story' || r.order === 'custom' ? r.order : 'release',
    dunePlacement:
      r.dunePlacement === 'start' || r.dunePlacement === 'mixed' ? r.dunePlacement : 'end',
    customOrder: Array.isArray(r.customOrder)
      ? r.customOrder.filter((x): x is string => typeof x === 'string').slice(0, 200)
      : [],
    included: { ...base.included, ...record(r.included, isBool) },
    watched: record(r.watched, isDay),
    episodesWatched: record(r.episodesWatched, isNum),
    runtimeOverrides: record(r.runtimeOverrides, isNum),
    customTitles,
    autoReplan: typeof r.autoReplan === 'boolean' ? r.autoReplan : base.autoReplan,
    watchTime:
      typeof r.watchTime === 'string' && /^\d{2}:\d{2}$/.test(r.watchTime)
        ? r.watchTime
        : base.watchTime,
    night: typeof r.night === 'boolean' ? r.night : base.night,
    spoilerShield: typeof r.spoilerShield === 'boolean' ? r.spoilerShield : base.spoilerShield,
  };
}

// ── The list ───────────────────────────────────────────────────────────────

/** Custom titles presented through the same shape as the built-in ones. */
export function customAsTitle(c: CustomTitle, index: number): WatchTitle {
  return {
    id: c.id,
    title: c.title,
    franchise: 'extra',
    kind: c.episodes ? 'series' : 'film',
    released: '9999-12-31',
    minutes: c.minutes,
    episodes: c.episodes,
    chrono: 500 + index,
    phase: 0,
    essential: false,
    hook: '',
  };
}

export function allTitles(state: DunesdayState): WatchTitle[] {
  return [...TITLES, ...state.customTitles.map(customAsTitle)];
}

export function titleById(state: DunesdayState, id: string): WatchTitle | undefined {
  return TITLE_BY_ID.get(id) ?? allTitles(state).find((t) => t.id === id);
}

export function runtimeOf(state: DunesdayState, title: WatchTitle): number {
  return state.runtimeOverrides[title.id] ?? title.minutes;
}

function placeDune(list: WatchTitle[], placement: DunePlacement): WatchTitle[] {
  if (placement === 'mixed') return list;
  const dune = list.filter((t) => t.franchise === 'dune');
  const rest = list.filter((t) => t.franchise !== 'dune');
  return placement === 'start' ? [...dune, ...rest] : [...rest, ...dune];
}

/** Every title (included or not) in the viewer's chosen order. */
export function orderedTitles(state: DunesdayState): WatchTitle[] {
  const titles = allTitles(state);
  if (state.order === 'custom' && state.customOrder.length) {
    const pos = new Map(state.customOrder.map((id, i) => [id, i]));
    // Anything not in the stored order yet (a new custom title) goes last.
    return [...titles].sort(
      (a, b) => (pos.get(a.id) ?? 1e6 + a.chrono) - (pos.get(b.id) ?? 1e6 + b.chrono),
    );
  }
  const sorted = [...titles].sort((a, b) =>
    state.order === 'story'
      ? a.chrono - b.chrono
      : a.released.localeCompare(b.released) || a.chrono - b.chrono,
  );
  return placeDune(sorted, state.dunePlacement);
}

export function isIncluded(state: DunesdayState, title: WatchTitle): boolean {
  return state.included[title.id] ?? true;
}

export function isWatched(state: DunesdayState, title: WatchTitle): boolean {
  return Boolean(state.watched[title.id]);
}

/** What is left, in order, for the planner. */
export function remainingWork(state: DunesdayState): Remaining[] {
  const out: Remaining[] = [];
  for (const title of orderedTitles(state)) {
    if (!isIncluded(state, title) || isWatched(state, title)) continue;
    const total = runtimeOf(state, title);
    if (title.kind === 'series' && title.episodes) {
      const seen = Math.min(title.episodes - 1, state.episodesWatched[title.id] ?? 0);
      const left = title.episodes - seen;
      out.push({
        title,
        minutes: (total * left) / title.episodes,
        fromEpisode: seen + 1,
        episodesLeft: left,
      });
    } else {
      out.push({ title, minutes: total });
    }
  }
  return out;
}

/** Settings as the planner should see them today. */
export function effectiveSettings(state: DunesdayState, today = localToday()): PlanSettings {
  const s = state.settings;
  const start = state.autoReplan && today > s.startDate ? today : s.startDate;
  let usedOnStart = 0;
  if (start === today) {
    for (const title of allTitles(state)) {
      if (state.watched[title.id] === today && isIncluded(state, title))
        usedOnStart += runtimeOf(state, title);
    }
  }
  return { ...s, startDate: start, usedOnStart };
}

export interface Progress {
  totalMinutes: number;
  watchedMinutes: number;
  titlesTotal: number;
  titlesWatched: number;
  /** Consecutive days, ending today or yesterday, with at least one tick. */
  streak: number;
}

export function progressOf(state: DunesdayState, today = localToday()): Progress {
  let totalMinutes = 0;
  let watchedMinutes = 0;
  let titlesTotal = 0;
  let titlesWatched = 0;
  for (const title of allTitles(state)) {
    if (!isIncluded(state, title)) continue;
    const runtime = runtimeOf(state, title);
    titlesTotal++;
    totalMinutes += runtime;
    if (isWatched(state, title)) {
      titlesWatched++;
      watchedMinutes += runtime;
    } else if (title.kind === 'series' && title.episodes) {
      watchedMinutes +=
        (runtime * Math.min(title.episodes, state.episodesWatched[title.id] ?? 0)) / title.episodes;
    }
  }
  const days = new Set(Object.values(state.watched));
  let streak = 0;
  let cursor = days.has(today) ? today : addDays(today, -1);
  while (days.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return {
    totalMinutes: Math.round(totalMinutes),
    watchedMinutes: Math.round(watchedMinutes),
    titlesTotal,
    titlesWatched,
    streak,
  };
}

// ── Sharing ────────────────────────────────────────────────────────────────

/**
 * The share link carries the plan but not the progress: someone opening your
 * link wants your list and pace, not your tick marks.
 */
export function encodeShare(state: DunesdayState): string {
  const payload = {
    settings: { ...state.settings, startDate: undefined },
    order: state.order,
    dunePlacement: state.dunePlacement,
    customOrder: state.order === 'custom' ? state.customOrder : undefined,
    included: Object.fromEntries(
      Object.entries(state.included).filter(([id, on]) => {
        const t = TITLE_BY_ID.get(id);
        return t ? defaultIncluded(t) !== on : true;
      }),
    ),
    runtimeOverrides: state.runtimeOverrides,
    customTitles: state.customTitles,
  };
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShare(code: string): unknown {
  try {
    const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

// ── Calendar export ────────────────────────────────────────────────────────

function icsEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** RFC 5545 line folding: 75 octets, continuation lines start with a space. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ' ' + rest.slice(74);
  }
  out.push(rest);
  return out.join('\r\n');
}

export interface IcsDay {
  date: string;
  minutes: number;
  summary: string;
  lines: string[];
}

/**
 * Floating local times (no TZID): "7:30 PM" means 7:30 PM wherever the viewer
 * opens the calendar, which is what a personal watch plan wants.
 */
export function buildIcs(days: IcsDay[], watchTime: string, stamp = new Date()): string {
  const [hh, mm] = watchTime.split(':');
  const dtstamp = stamp
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RMH Studios//Dunesday Marathon//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Dunesday Marathon',
  ];
  for (const day of days) {
    const date = day.date.replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:dunesday-${date}@rmhstudios.com`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${date}T${hh}${mm}00`,
      `DURATION:PT${Math.max(1, Math.round(day.minutes))}M`,
      fold(`SUMMARY:${icsEscape(day.summary)}`),
      fold(`DESCRIPTION:${icsEscape(day.lines.join('\n'))}`),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
