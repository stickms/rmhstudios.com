/**
 * RMHHomes — comparing saved listings (s12 10). Pure and client-safe: the ids parser, the note rule and the rows
 * of the side-by-side table, built from listing DTOs. The component turns each cell into words (`t()`), so this
 * module returns data and never a sentence.
 */
import { assessListing, hasIncome, type IncomeProfile } from './affordability';
import { straightLineKm } from './distance';
import type { PriceChange } from './prices';
import type { Listing, PropertyType } from './types';

/** How many saved listings sit side by side. */
export const MAX_COMPARE = 4;
/** The longest private note, in characters (the column is `VARCHAR(1000)`). */
export const NOTE_MAX = 1000;

/** A listing id as the database writes it: letters, digits, underscore and hyphen. */
const ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * A note as stored: control characters (other than a line break) are dropped, the ends are trimmed and an empty
 * note is `null`, so "no note" has one spelling. Plain text only; it is never rendered as HTML.
 */
export function normalizeNote(raw: string): string | null {
  let cleaned = '';
  for (const ch of raw.replace(/\r\n?/g, '\n')) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '\n' || (code >= 0x20 && code !== 0x7f)) cleaned += ch;
  }
  const trimmed = cleaned.trim();
  return trimmed === '' ? null : trimmed;
}

/** Whether a note fits the column (after the same cleaning the server applies). */
export function noteFits(raw: string): boolean {
  return [...(normalizeNote(raw) ?? '')].length <= NOTE_MAX;
}

export interface ParsedCompareIds {
  /** Distinct, well-formed ids in the order they were given. */
  ids: string[];
  /** More distinct ids than `MAX_COMPARE` were asked for. */
  tooMany: boolean;
  /** Entries dropped for not being an id (empty entries do not count). */
  invalid: number;
}

/** One comma-separated parameter: `a,b,c`. Duplicates collapse, bad ids are dropped and counted, empty parts ignored. */
export function parseCompareIds(raw: string | null | undefined): ParsedCompareIds {
  const ids: string[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  for (const part of (raw ?? '').split(',')) {
    const id = part.trim();
    if (id === '') continue;
    if (!ID_SHAPE.test(id)) {
      invalid += 1;
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return { ids, tooMany: ids.length > MAX_COMPARE, invalid };
}

/** The `ids` parameter for a set of listings. */
export function compareIdsParam(ids: readonly string[]): string {
  return ids.slice(0, MAX_COMPARE).join(',');
}

/** Currency units per square foot, to the cent; `null` without a usable size. */
export function pricePerSqft(price: number, sqft: number | null | undefined): number | null {
  if (sqft == null || !Number.isFinite(sqft) || sqft <= 0) return null;
  if (!Number.isFinite(price) || price <= 0) return null;
  return Math.round((price / sqft) * 100) / 100;
}

/** Every amenity any listing names, one spelling each (the first seen), case-insensitively sorted. */
export function amenityUnion(listings: ReadonlyArray<Pick<Listing, 'amenities'>>): string[] {
  const byKey = new Map<string, string>();
  for (const l of listings) {
    for (const raw of l.amenities) {
      const name = raw.trim();
      if (name === '') continue;
      const key = name.toLocaleLowerCase();
      if (!byKey.has(key)) byKey.set(key, name);
    }
  }
  return [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, name]) => name);
}

export interface ComparePlace {
  label: string;
  lat: number;
  lng: number;
}

export type CompareRowKey =
  | 'price'
  | 'perSqft'
  | 'lastChange'
  | 'beds'
  | 'baths'
  | 'sqft'
  | 'type'
  | 'pets'
  | 'available'
  | 'distance'
  | 'afford'
  | 'note';

/** One cell, as data: the component decides the words. */
export type CompareCell =
  | { kind: 'none' }
  | { kind: 'money'; value: number }
  | { kind: 'number'; value: number }
  | { kind: 'type'; value: PropertyType }
  | { kind: 'yesno'; value: boolean }
  | { kind: 'date'; iso: string }
  | { kind: 'change'; change: PriceChange }
  | { kind: 'distance'; km: number }
  | { kind: 'afford'; affordable: boolean; monthlyCost: number; overBy: number }
  | { kind: 'text'; value: string };

export interface CompareRow {
  key: CompareRowKey;
  cells: CompareCell[];
}

export interface CompareColumn {
  id: string;
  listing: Listing;
  /** The listing is no longer for sale or rent (rented, sold or removed). */
  noLongerListed: boolean;
}

export interface AmenityRow {
  name: string;
  has: boolean[];
}

export interface ComparisonModel {
  columns: CompareColumn[];
  rows: CompareRow[];
  amenities: AmenityRow[];
}

export interface BuildCompareInput {
  listings: readonly Listing[];
  /** The last recorded price change per listing id. */
  changes?: Readonly<Record<string, PriceChange | null | undefined>>;
  /** The member's private notes per listing id. */
  notes?: Readonly<Record<string, string | null | undefined>>;
  /** The place the member entered; the distance row appears with it. */
  place?: ComparePlace | null;
  /** The device's income profile; the affordability row appears when it holds an income. */
  profile?: IncomeProfile | null;
}

/** The rows of the comparison, in the order they are shown. A row that nothing could fill is left out. */
export function buildComparison(input: BuildCompareInput): ComparisonModel {
  const listings = input.listings.slice(0, MAX_COMPARE);
  const columns: CompareColumn[] = listings.map((listing) => ({
    id: listing.id,
    listing,
    noLongerListed: listing.status !== 'ACTIVE',
  }));
  const each = (cell: (l: Listing) => CompareCell): CompareCell[] => listings.map(cell);
  const rows: CompareRow[] = [];

  rows.push({ key: 'price', cells: each((l) => ({ kind: 'money', value: l.price })) });

  const perSqft = each((l): CompareCell => {
    const v = pricePerSqft(l.price, l.sqft);
    return v == null ? { kind: 'none' } : { kind: 'money', value: v };
  });
  if (perSqft.some((c) => c.kind !== 'none')) rows.push({ key: 'perSqft', cells: perSqft });

  rows.push({
    key: 'lastChange',
    cells: each((l): CompareCell => {
      const change = input.changes?.[l.id];
      return change ? { kind: 'change', change } : { kind: 'none' };
    }),
  });
  rows.push({ key: 'beds', cells: each((l) => ({ kind: 'number', value: l.beds })) });
  rows.push({ key: 'baths', cells: each((l) => ({ kind: 'number', value: l.baths })) });
  rows.push({
    key: 'sqft',
    cells: each((l): CompareCell =>
      l.sqft != null && l.sqft > 0 ? { kind: 'number', value: l.sqft } : { kind: 'none' },
    ),
  });
  rows.push({ key: 'type', cells: each((l) => ({ kind: 'type', value: l.propertyType })) });
  rows.push({ key: 'pets', cells: each((l) => ({ kind: 'yesno', value: l.petsAllowed })) });
  rows.push({
    key: 'available',
    cells: each((l): CompareCell => (l.availableFrom ? { kind: 'date', iso: l.availableFrom } : { kind: 'none' })),
  });

  const place = input.place;
  if (place && Number.isFinite(place.lat) && Number.isFinite(place.lng)) {
    rows.push({
      key: 'distance',
      cells: each((l) => ({ kind: 'distance', km: straightLineKm({ lat: place.lat, lng: place.lng }, l) })),
    });
  }

  const profile = input.profile;
  if (profile && hasIncome(profile)) {
    rows.push({
      key: 'afford',
      cells: each((l): CompareCell => {
        const v = assessListing(l, profile);
        return v.known
          ? { kind: 'afford', affordable: v.affordable, monthlyCost: v.monthlyCost, overBy: v.overBy }
          : { kind: 'none' };
      }),
    });
  }

  rows.push({
    key: 'note',
    cells: each((l): CompareCell => {
      const note = input.notes?.[l.id] ?? l.note ?? null;
      return note ? { kind: 'text', value: note } : { kind: 'none' };
    }),
  });

  const amenities = amenityUnion(listings).map((name): AmenityRow => {
    const key = name.toLocaleLowerCase();
    return { name, has: listings.map((l) => l.amenities.some((a) => a.trim().toLocaleLowerCase() === key)) };
  });

  return { columns, rows, amenities };
}
