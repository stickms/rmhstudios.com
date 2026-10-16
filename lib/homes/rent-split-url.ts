/**
 * Shareable state for the fair rent split (F10): rent, shared share and rooms
 * travel in the URL so a group can send one link — no database involved.
 *
 *   ?rent=2400&shared=30&rooms=Big~180~pb.ba|Small~120~
 *
 * Parsing is defensive: anything malformed falls back to a sensible default
 * instead of throwing, because the input is a URL anyone can edit.
 */
import { FEATURE_WEIGHTS, type RoomFeature } from './rent-split';

export const MAX_ROOMS = 8;
const FEATURE_CODES: Record<string, RoomFeature> = {
  pb: 'private-bath',
  ba: 'balcony',
  wc: 'walk-in-closet',
  nw: 'no-window',
  sn: 'shared-wall-noise',
};
const CODE_OF = Object.fromEntries(Object.entries(FEATURE_CODES).map(([c, f]) => [f, c])) as Record<
  RoomFeature,
  string
>;

export interface RoomInput {
  name: string;
  area: number;
  features: RoomFeature[];
}
export interface RentSplitState {
  /** Whole dollars per month. */
  rent: number;
  /** Percent of the rent that is shared evenly, 0–90. */
  shared: number;
  rooms: RoomInput[];
}
export interface RentSplitSearch {
  rent?: string;
  shared?: string;
  rooms?: string;
}

export const DEFAULT_STATE: RentSplitState = {
  rent: 2400,
  shared: 30,
  rooms: [
    { name: 'Room 1', area: 150, features: ['private-bath'] },
    { name: 'Room 2', area: 120, features: [] },
  ],
};

const clean = (n: string) => n.replace(/[|~]/g, ' ').trim().slice(0, 24);

export function parseRentSplit(search: RentSplitSearch): RentSplitState {
  const rent = Number(search.rent);
  const shared = Number(search.shared);
  const rooms: RoomInput[] = [];
  for (const part of (search.rooms ?? '').split('|').slice(0, MAX_ROOMS)) {
    const [name = '', area = '', feats = ''] = part.split('~');
    const a = Number(area);
    if (!clean(name) || !(a > 0 && a <= 10_000)) continue;
    rooms.push({
      name: clean(name),
      area: a,
      features: feats
        .split('.')
        .map((c) => FEATURE_CODES[c])
        .filter((f): f is RoomFeature => f !== undefined && f in FEATURE_WEIGHTS),
    });
  }
  return {
    rent: Number.isFinite(rent) && rent > 0 && rent <= 100_000 ? rent : DEFAULT_STATE.rent,
    shared: Number.isFinite(shared)
      ? Math.min(90, Math.max(0, Math.round(shared)))
      : DEFAULT_STATE.shared,
    rooms: rooms.length >= 2 ? rooms : DEFAULT_STATE.rooms,
  };
}

export function serializeRentSplit(state: RentSplitState): Required<RentSplitSearch> {
  return {
    rent: String(state.rent),
    shared: String(state.shared),
    rooms: state.rooms
      .map(
        (r) =>
          `${clean(r.name) || 'Room'}~${r.area}~${r.features.map((f) => CODE_OF[f]).join('.')}`,
      )
      .join('|'),
  };
}
