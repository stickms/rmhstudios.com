// Farming Sim festivals (R8): real calendar days (UTC) with a one-day shop and a
// harvest contest. Shared by the socket handler (authoritative) and the UI.

export interface FestivalItem {
  id: string;
  name: string;
  cost: number;
  /** Seed packets granted on purchase (crop id → count). */
  seeds: Record<string, number>;
}

export interface Festival {
  id: string;
  name: string;
  month: number; // 1-12
  day: number;
  blurb: string;
  items: FestivalItem[];
}

export const FESTIVALS: readonly Festival[] = [
  {
    id: 'fresh-furrow',
    name: 'Fresh Furrow Day',
    month: 1,
    day: 1,
    blurb: 'A new year, a new field.',
    items: [
      { id: 'ff-roots', name: 'Root Starter Crate', cost: 220, seeds: { potato: 12, parsnip: 8 } },
      { id: 'ff-cauli', name: 'Cauliflower Crate', cost: 150, seeds: { cauliflower: 6 } },
    ],
  },
  {
    id: 'spring-bloom',
    name: 'Spring Bloom Fair',
    month: 3,
    day: 20,
    blurb: 'The first warm day. Everything wants to grow.',
    items: [
      { id: 'sb-roots', name: 'Spring Root Bundle', cost: 200, seeds: { parsnip: 12, potato: 8 } },
      { id: 'sb-straw', name: 'Strawberry Crate', cost: 300, seeds: { strawberry: 8 } },
    ],
  },
  {
    id: 'may-day',
    name: 'May Day Fair',
    month: 5,
    day: 1,
    blurb: 'Ribbons, music and a very competitive pie table.',
    items: [
      { id: 'md-cauli', name: 'Cauliflower Crate', cost: 150, seeds: { cauliflower: 6 } },
      { id: 'md-straw', name: 'Strawberry Crate', cost: 300, seeds: { strawberry: 8 } },
    ],
  },
  {
    id: 'midsummer',
    name: 'Midsummer Market',
    month: 6,
    day: 21,
    blurb: 'The longest day, the longest rows.',
    items: [
      { id: 'ms-tomato', name: 'Tomato Bundle', cost: 220, seeds: { tomato: 12 } },
      { id: 'ms-melon', name: 'Melon Crate', cost: 180, seeds: { melon: 6 } },
    ],
  },
  {
    id: 'lammas',
    name: 'Loaf Fair',
    month: 8,
    day: 1,
    blurb: 'First grain of the year, baked into everything.',
    items: [
      { id: 'lf-wheat', name: 'Wheat Sack', cost: 120, seeds: { wheat: 30 } },
      { id: 'lf-corn', name: 'Corn Crate', cost: 260, seeds: { corn: 6 } },
    ],
  },
  {
    id: 'harvest-moon',
    name: 'Harvest Moon Feast',
    month: 9,
    day: 22,
    blurb: 'Lanterns in the orchard and tables in the road.',
    items: [
      { id: 'hm-pumpkin', name: 'Pumpkin Bundle', cost: 300, seeds: { pumpkin: 10 } },
      { id: 'hm-cran', name: 'Cranberry Crate', cost: 360, seeds: { cranberry: 5 } },
    ],
  },
  {
    id: 'pumpkin-night',
    name: 'Pumpkin Night',
    month: 10,
    day: 31,
    blurb: 'Carved faces in every window.',
    items: [
      { id: 'pn-pumpkin', name: 'Big Pumpkin Haul', cost: 400, seeds: { pumpkin: 15 } },
      { id: 'pn-corn', name: 'Corn Maze Crate', cost: 360, seeds: { corn: 8 } },
    ],
  },
  {
    id: 'winter-lantern',
    name: 'Winter Lantern Night',
    month: 12,
    day: 21,
    blurb: 'The shortest day, lit by every farm at once.',
    items: [
      { id: 'wl-wheat', name: 'Wheat Sack', cost: 120, seeds: { wheat: 30 } },
      { id: 'wl-roots', name: 'Root Cellar Crate', cost: 220, seeds: { potato: 12, parsnip: 8 } },
    ],
  },
];

export interface ActiveFestival extends Festival {
  /** Unique per occurrence, e.g. `2026-pumpkin-night`. */
  key: string;
}

export function festivalOn(now: Date): ActiveFestival | null {
  const f = FESTIVALS.find((x) => x.month === now.getUTCMonth() + 1 && x.day === now.getUTCDate());
  return f ? { ...f, key: `${now.getUTCFullYear()}-${f.id}` } : null;
}

export function festivalById(id: string): Festival | undefined {
  return FESTIVALS.find((x) => x.id === id);
}

/** The festival id inside an occurrence key (`2026-pumpkin-night` → `pumpkin-night`). */
export function festivalIdFromKey(key: string): string {
  return key.replace(/^\d{4}-/, '');
}

export function nextFestival(now: Date): { festival: Festival; daysAway: number } {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let best: { festival: Festival; daysAway: number } | null = null;
  for (const f of FESTIVALS) {
    for (const year of [now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
      const t = Date.UTC(year, f.month - 1, f.day);
      if (t <= today) continue;
      const daysAway = Math.round((t - today) / 86_400_000);
      if (!best || daysAway < best.daysAway) best = { festival: f, daysAway };
    }
  }
  return best!;
}

/** The most recent festival occurrence on or before `now` (today's, if one is on). */
export function latestFestival(now: Date): ActiveFestival {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let best: { f: Festival; year: number; t: number } | null = null;
  for (const f of FESTIVALS) {
    for (const year of [now.getUTCFullYear(), now.getUTCFullYear() - 1]) {
      const t = Date.UTC(year, f.month - 1, f.day);
      if (t > today) continue;
      if (!best || t > best.t) best = { f, year, t };
    }
  }
  return { ...best!.f, key: `${best!.year}-${best!.f.id}` };
}

export interface FestivalProgress {
  key: string;
  score: number;
  bought: string[];
}
