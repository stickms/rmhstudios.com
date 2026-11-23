/**
 * Routing (plan R2, R13, R14): the model returns what a question is about as written; the server resolves the school
 * names against the active schools, so the model can never invent a slug that is then queried. Pure and hand-validated:
 * a malformed route is `intent: 'other'`, never a throw.
 */
import { normalizeSchoolKey } from '../names';
import type { QaIntent } from './types';

export interface RouteResult {
  intent: QaIntent;
  schools: string[];
  cycle: number | null;
  filters: { state: string | null; format: string | null };
}

export const INTENTS: readonly QaIntent[] = ['facts', 'compare', 'interviews', 'timing', 'my-chance', 'other'];
export const INTERVIEW_FORMATS = ['MMI', 'traditional', 'panel', 'virtual', 'group'] as const;
export const MAX_SCHOOLS = 3;
const MAX_NAME = 80;

const OTHER: RouteResult = { intent: 'other', schools: [], cycle: null, filters: { state: null, format: null } };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Never throws: junk becomes `{ intent: 'other', schools: [], cycle: null, filters: { state: null, format: null } }`. */
export function parseRoute(value: unknown): RouteResult {
  if (!isObject(value)) return { ...OTHER, filters: { ...OTHER.filters } };
  const intent = INTENTS.find((i) => i === value.intent);
  if (!intent) return { ...OTHER, filters: { ...OTHER.filters } };

  const schools = Array.isArray(value.schools)
    ? value.schools
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim().slice(0, MAX_NAME).trim())
        .filter((s) => s.length > 0)
        .slice(0, MAX_SCHOOLS)
    : [];
  const cycle =
    typeof value.cycle === 'number' && Number.isInteger(value.cycle) && value.cycle >= 2000 && value.cycle <= 2100
      ? value.cycle
      : null;
  const f = isObject(value.filters) ? value.filters : {};
  const state = typeof f.state === 'string' && /^[A-Z]{2}$/.test(f.state) ? f.state : null;
  const format = typeof f.format === 'string' ? (INTERVIEW_FORMATS.find((x) => x === f.format) ?? null) : null;
  return { intent, schools, cycle, filters: { state, format } };
}

export interface SchoolDirEntry {
  slug: string;
  name: string;
  shortName: string;
  state: string;
  interviewFormat: string | null;
}

const TRAILING =
  /\s+(?:medical school|school of medicine|college of medicine|school of osteopathic medicine|college of osteopathic medicine)$/i;

const key = (s: string): string => normalizeSchoolKey(s).toLowerCase().replace(/\s+/g, ' ');

/**
 * Names the model wrote, as the active schools they mean. A name matches a school's name, short name, slug, or its name
 * without a trailing "School of Medicine" and a leading "The"; a key shared by two schools is ambiguous and is returned
 * in `unresolved`. A pinned slug (the school page's panel) comes first when it is an active school. At most 3 slugs.
 */
export function resolveSchools(
  names: readonly string[],
  dir: readonly SchoolDirEntry[],
  pinned?: string,
): { slugs: string[]; unresolved: string[] } {
  const map = new Map<string, Set<string>>();
  const add = (k: string, slug: string) => {
    if (!k) return;
    let set = map.get(k);
    if (!set) map.set(k, (set = new Set()));
    set.add(slug);
  };
  for (const s of dir) {
    for (const raw of [s.name, s.shortName, s.slug]) {
      const k = key(raw);
      add(k, s.slug);
      add(k.replace(/^the /, ''), s.slug);
      add(key(raw.replace(TRAILING, '')), s.slug);
    }
  }
  const slugs: string[] = [];
  const unresolved: string[] = [];
  const push = (slug: string) => {
    if (!slugs.includes(slug) && slugs.length < MAX_SCHOOLS) slugs.push(slug);
  };
  if (pinned && dir.some((s) => s.slug === pinned)) push(pinned);
  for (const n of names) {
    const k = key(n);
    const hit = map.get(k) ?? map.get(k.replace(/^the /, ''));
    if (hit && hit.size === 1) push([...hit][0]!);
    else unresolved.push(n);
  }
  return { slugs, unresolved };
}

/** Up to `max` active schools matching the state and/or format the question asked about, stable by name. */
export function filterSchools(f: RouteResult['filters'], dir: readonly SchoolDirEntry[], max = 5): string[] {
  if (!f.state && !f.format) return [];
  return dir
    .filter(
      (s) =>
        (!f.state || s.state === f.state) &&
        (!f.format || (s.interviewFormat ?? '').toLowerCase() === f.format.toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug))
    .slice(0, max)
    .map((s) => s.slug);
}

/** The cycle asked about when it is within four years of the site's, else the site's. */
export function clampCycle(cycle: number | null, siteCycle: number): number {
  return cycle !== null && Math.abs(cycle - siteCycle) <= 4 ? cycle : siteCycle;
}
