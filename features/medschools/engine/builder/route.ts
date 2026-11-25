/**
 * The list builder's route (phase D): the model reads the member's request into filters; this re-checks every field
 * against fixed lists and never throws (junk is `intent: 'other'`). States are checked against the 50 states, DC and the
 * territories; regions are the four US Census regions, mapped to states here, in code.
 */
import { MISSIONS, type Mission } from '../applicant';
import { HOME_STATE_CODES } from '../tracker';

export const REGIONS = {
  northeast: ['CT', 'ME', 'MA', 'NH', 'RI', 'VT', 'NJ', 'NY', 'PA'],
  midwest: ['IL', 'IN', 'MI', 'OH', 'WI', 'IA', 'KS', 'MN', 'MO', 'NE', 'ND', 'SD'],
  south: ['DE', 'DC', 'FL', 'GA', 'MD', 'NC', 'SC', 'VA', 'WV', 'AL', 'KY', 'MS', 'TN', 'AR', 'LA', 'OK', 'TX'],
  west: ['AZ', 'CO', 'ID', 'MT', 'NV', 'NM', 'UT', 'WY', 'AK', 'CA', 'HI', 'OR', 'WA'],
} as const satisfies Record<string, readonly string[]>;
export type Region = keyof typeof REGIONS;

export const DEFAULT_COUNT = 15;
export const MIN_COUNT = 5;
export const MAX_COUNT = 30;

export interface BuilderRoute {
  intent: 'list' | 'other';
  /** The asked states and the states of the asked regions, deduped and sorted. Empty: anywhere. */
  states: string[];
  regions: Region[];
  degree: 'MD' | 'DO' | null;
  mdphd: boolean;
  size: 'small' | 'medium' | 'large' | null;
  missions: Mission[];
  count: number;
  homeState: string | null;
}

const OTHER: BuilderRoute = {
  intent: 'other',
  states: [],
  regions: [],
  degree: null,
  mdphd: false,
  size: null,
  missions: [],
  count: DEFAULT_COUNT,
  homeState: null,
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const STATES = new Set(HOME_STATE_CODES);
const state = (v: unknown): string | null =>
  typeof v === 'string' && STATES.has(v.trim().toUpperCase()) ? v.trim().toUpperCase() : null;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v.slice(0, 60) : []);

export function parseBuilderRoute(value: unknown): BuilderRoute {
  if (!isObject(value) || value.intent !== 'list') return { ...OTHER };
  const regions = [
    ...new Set(list(value.regions).flatMap((r) => (typeof r === 'string' && r in REGIONS ? [r as Region] : []))),
  ];
  const states = new Set(list(value.states).flatMap((s) => state(s) ?? []));
  for (const r of regions) for (const s of REGIONS[r]) states.add(s);
  const count =
    typeof value.count === 'number' && Number.isInteger(value.count)
      ? Math.min(MAX_COUNT, Math.max(MIN_COUNT, value.count))
      : DEFAULT_COUNT;
  return {
    intent: 'list',
    states: [...states].sort(),
    regions,
    degree: value.degree === 'MD' || value.degree === 'DO' ? value.degree : null,
    mdphd: value.mdphd === true,
    size: value.size === 'small' || value.size === 'medium' || value.size === 'large' ? value.size : null,
    missions: [
      ...new Set(list(value.missions).filter((m): m is Mission => (MISSIONS as readonly unknown[]).includes(m))),
    ],
    count,
    homeState: state(value.homeState),
  };
}
