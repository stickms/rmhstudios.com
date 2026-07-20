/**
 * Shared moments (§13) — the persistence behind shareable stat cards.
 *
 * A `SharedMoment` is created ONLY when a user hits "share" (nothing is public by
 * default). It snapshots the card's payload at share time, so the OG image + the
 * landing page render immutable content — safe to cache forever. Deleting the
 * row kills the landing page and 404s the image route.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import type { StatCardKind } from '@/lib/og/stat-card.server';

/** The moment kinds that map to stat-card themes. Keep in sync with StatCardKind. */
export const MOMENT_KINDS: StatCardKind[] = [
  'achievement',
  'rank',
  'streak',
  'pass_tier',
  'arcade',
  'wrapped_stat',
  'market',
];

export function isMomentKind(v: unknown): v is StatCardKind {
  return typeof v === 'string' && (MOMENT_KINDS as string[]).includes(v);
}

/** Snapshot rendered onto the card. Kept small + string-only on purpose. */
export interface MomentPayload {
  title?: string;
  value: string;
  subtitle?: string;
}

export interface SharedMomentView {
  id: string;
  kind: StatCardKind;
  payload: MomentPayload;
  createdAt: string;
  user: { id: string; name: string | null; handle: string | null; image: string | null };
}

const TITLE_MAX = 80;
const VALUE_MAX = 60;
const SUBTITLE_MAX = 120;

/** Coerce arbitrary client input into a safe, bounded payload. Returns null when
 *  there's no usable hero value. */
export function sanitizeMomentPayload(raw: unknown): MomentPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, n: number): string | undefined => {
    if (typeof v !== 'string') return undefined;
    const t = v.trim();
    return t ? t.slice(0, n) : undefined;
  };
  const value = str(r.value, VALUE_MAX);
  if (!value) return null;
  const payload: MomentPayload = { value };
  const title = str(r.title, TITLE_MAX);
  const subtitle = str(r.subtitle, SUBTITLE_MAX);
  if (title) payload.title = title;
  if (subtitle) payload.subtitle = subtitle;
  return payload;
}

/**
 * Create a shared moment for `userId`. Validates the kind and sanitizes the
 * payload. Throws on invalid input so the API can return 400.
 */
export async function createMoment(input: {
  userId: string;
  kind: unknown;
  payload: unknown;
}): Promise<{ id: string }> {
  if (!isMomentKind(input.kind)) throw new Error('INVALID_KIND');
  const payload = sanitizeMomentPayload(input.payload);
  if (!payload) throw new Error('INVALID_PAYLOAD');

  const row = await prisma.sharedMoment.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      payload: payload as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return { id: row.id };
}

/** Fetch a moment for rendering (image route + landing page). Null if missing. */
export async function getMoment(id: string): Promise<SharedMomentView | null> {
  const row = await prisma.sharedMoment.findUnique({
    where: { id },
    select: {
      id: true,
      kind: true,
      payload: true,
      createdAt: true,
      user: { select: { id: true, name: true, handle: true, image: true } },
    },
  });
  if (!row) return null;
  if (!isMomentKind(row.kind)) return null;
  const payload = sanitizeMomentPayload(row.payload) ?? { value: '' };
  return {
    id: row.id,
    kind: row.kind,
    payload,
    createdAt: row.createdAt.toISOString(),
    user: row.user,
  };
}

/** Delete a moment the caller owns. Returns true when a row was removed. */
export async function deleteMoment(id: string, userId: string): Promise<boolean> {
  const res = await prisma.sharedMoment.deleteMany({ where: { id, userId } });
  return res.count > 0;
}
