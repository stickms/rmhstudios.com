/**
 * Shared shapes for world snapshots (Isleworks island, Forest Explorer garden,
 * Farming Sim farm tour). Client-safe: no Prisma.
 */
import { z } from 'zod';

export const SNAPSHOT_KINDS = ['isleworks', 'garden', 'farm'] as const;
export type SnapshotKind = (typeof SNAPSHOT_KINDS)[number];

/** Hard ceiling on a stored payload, in serialized bytes. */
export const MAX_PAYLOAD_BYTES = 120_000;
export const POSTCARD_MAX = 160;
export const SHARE_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;

const int = z.number().int();

/** Mirrors `SavedCity` in lib/isleworks/save-format.ts; the loader is defensive too. */
export const islePayloadSchema = z.object({
  v: z.literal(1),
  seed: int.min(0).max(2_000_000_000),
  money: z.number().finite(),
  taxRate: z.number().finite(),
  month: int.min(1).max(100_000),
  population: int.min(0).max(10_000_000),
  peak: int.min(0).max(10_000_000),
  parcels: z.array(int.min(0).max(1024)).max(256),
  buildings: z
    .array(
      z.object({
        d: z.string().max(40),
        x: int.min(0).max(512),
        y: int.min(0).max(512),
        r: int.min(0).max(3),
        l: int.min(1).max(3),
        c: z.number().min(0).max(1),
        m: int.min(0).max(100_000),
      }),
    )
    .max(5000),
  claimed: z.array(z.string().max(40)).max(200),
  completed: z.array(z.string().max(40)).max(200),
});

export const gardenPayloadSchema = z.object({
  plants: z
    .array(
      z.object({
        id: z.string().max(40),
        x: z.number().finite().min(-200).max(200),
        z: z.number().finite().min(-200).max(200),
        species: z.enum(['moonpetal', 'sunburst', 'foxbell', 'emberbloom', 'riverlily']),
        plantedAt: z.number().finite(),
        waterBonusMs: z.number().finite().min(0),
        lastWateredStage: int.min(-1).max(3),
      }),
    )
    .max(80),
});

export const publishSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('isleworks'), payload: islePayloadSchema }),
  z.object({ kind: z.literal('garden'), payload: gardenPayloadSchema }),
  z.object({ kind: z.literal('farm') }),
]);

export const postcardSchema = z.object({
  body: z.string().trim().min(1).max(POSTCARD_MAX),
});

/** Compact, read-only farm tour view built on the server from the live farm row. */
export interface FarmTourPayload {
  name: string;
  day: number;
  season: string;
  grid: number;
  /** [terrain 0|1, cropId or '', growth stage 0..9] per tile, row-major. */
  tiles: [number, string, number][];
}

export interface SnapshotView {
  kind: SnapshotKind;
  code: string;
  title: string;
  updatedAt: string;
  owner: { id: string; name: string; image: string | null } | null;
  isOwner: boolean;
  payload: unknown;
  postcards: { id: string; body: string; createdAt: string; author: { name: string } }[];
  /** Garden only: whether the viewer has already watered it today (UTC). */
  wateredToday: boolean;
}

export function todayUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

const VISIT_PATHS: Record<SnapshotKind, string> = {
  isleworks: '/isleworks?visit=',
  garden: '/forest-explorer/explore?garden=',
  farm: '/rmh-farming-sim?tour=',
};

export function visitPath(kind: SnapshotKind, code: string): string {
  return `${VISIT_PATHS[kind]}${code}`;
}

/** The share code in the page URL for this kind, or null. Client only. */
export function codeFromLocation(kind: SnapshotKind): string | null {
  if (typeof window === 'undefined') return null;
  const key = VISIT_PATHS[kind].split('?')[1].replace('=', '');
  const raw = new URLSearchParams(window.location.search).get(key)?.toUpperCase() ?? '';
  return SHARE_CODE_RE.test(raw) ? raw : null;
}
