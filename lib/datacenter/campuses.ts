/**
 * The estate, as data.
 *
 * Everything here is a fact a facilities drawing would carry — hall counts,
 * contracted power, the trailing PUE, and the hall's own dimensions. Prose is
 * NOT here: the pages call `t()` with literal keys, and `i18next-parser` cannot
 * see through a key read out of a catalog, so a description stored here would
 * never reach `locales/` and every locale would silently serve English.
 *
 * The `hall` on each entry is the real reason this file exists. It feeds
 * `hallHull` in `hall-hull.ts`, so the shape drawn beside a campus is that
 * campus's own building rather than the same picture six times.
 */

import type { HallSpec } from './hall-hull';

export interface Campus {
  /** Anchor id, and the slug the home page's cards link to. */
  id: string;
  /** The designation used everywhere the site refers to this site. */
  code: string;
  /** Cloud-style region name. */
  region: string;
  halls: number;
  /** Contracted utility capacity, megawatts. */
  megawatts: number;
  tier: string;
  /** Trailing twelve-month power usage effectiveness. */
  pue: number;
  certs: string;
  /** Committed capacity, 0…1. */
  committed: number;
  /** Where the meter turns thermal — the point a hall is scheduled to expand. */
  pressure: number;
  hall: HallSpec;
}

/** Units in a capacity meter. A rack is 42U; this is a rack seen from across the hall. */
export const METER_UNITS = 24;

export const CAMPUSES: Campus[] = [
  {
    id: 'ash-01',
    code: 'ASH-01',
    region: 'us-east',
    halls: 4,
    megawatts: 62,
    tier: 'Tier IV',
    pue: 1.09,
    certs: 'SOC 2 Type II · ISO 27001 · PCI DSS · HIPAA',
    committed: 0.87,
    pressure: 0.8,
    hall: { length: 96, width: 38, height: 16, square: 7, pitch: 0.2 },
  },
  {
    id: 'dub-02',
    code: 'DUB-02',
    region: 'eu-west',
    halls: 3,
    megawatts: 28,
    tier: 'Tier III+',
    pue: 1.06,
    certs: 'SOC 2 Type II · ISO 27001 · ISO 50001 · GDPR',
    committed: 0.71,
    pressure: 0.8,
    hall: { length: 74, width: 34, height: 14, square: 6.4, pitch: 0.24 },
  },
  {
    id: 'sin-01',
    code: 'SIN-01',
    region: 'ap-southeast',
    halls: 2,
    megawatts: 18,
    tier: 'Tier III+',
    pue: 1.28,
    certs: 'SOC 2 Type II · ISO 27001 · MTCS Level 3',
    committed: 0.84,
    pressure: 0.75,
    hall: { length: 58, width: 32, height: 18, square: 7.6, pitch: 0.14 },
  },
  {
    id: 'fra-03',
    code: 'FRA-03',
    region: 'eu-central',
    halls: 3,
    megawatts: 22,
    tier: 'Tier III+',
    pue: 1.11,
    certs: 'SOC 2 Type II · ISO 27001 · C5 · GDPR',
    committed: 0.58,
    pressure: 0.8,
    hall: { length: 70, width: 30, height: 15, square: 6.8, pitch: 0.22 },
  },
  {
    id: 'pdx-01',
    code: 'PDX-01',
    region: 'us-west',
    halls: 2,
    megawatts: 10,
    tier: 'Tier III',
    pue: 1.1,
    certs: 'SOC 2 Type II · ISO 27001',
    committed: 0.46,
    pressure: 0.8,
    hall: { length: 52, width: 28, height: 13, square: 6, pitch: 0.26 },
  },
  {
    id: 'gru-01',
    code: 'GRU-01',
    region: 'sa-east',
    halls: 2,
    megawatts: 8,
    tier: 'Tier III',
    pue: 1.19,
    certs: 'SOC 2 Type II · ISO 27001 · LGPD',
    committed: 0.38,
    pressure: 0.8,
    hall: { length: 48, width: 30, height: 13, square: 6.2, pitch: 0.18 },
  },
];

/** The flagship, and the hall the front page draws. */
export const ANCHOR = CAMPUSES[0];

/** Contracted megawatts across the estate. */
export const TOTAL_MW = CAMPUSES.reduce((n, c) => n + c.megawatts, 0);
/** Independently powered and cooled halls across the estate. */
export const TOTAL_HALLS = CAMPUSES.reduce((n, c) => n + c.halls, 0);

/**
 * Fleet PUE, weighted by contracted power rather than averaged per site.
 *
 * An unweighted mean would let the 8 MW campus move the number as much as the
 * 62 MW one, which is how a fleet figure ends up flattering: the small, new,
 * efficient sites outnumber the big ones. Weighting by load is the only version
 * of this number a customer can check against a bill.
 */
export const FLEET_PUE = CAMPUSES.reduce((n, c) => n + c.pue * c.megawatts, 0) / TOTAL_MW;

/** Lit units in a meter, for a 0…1 ratio. */
export function meterUnits(ratio: number, units = METER_UNITS): number {
  return Math.round(Math.max(0, Math.min(1, ratio)) * units);
}
