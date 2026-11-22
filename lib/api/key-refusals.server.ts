/**
 * Per-key, per-day count of requests refused because the client address was
 * outside the key's allowlist, with the masked address of the latest one.
 * Never stores a full address.
 */
import { prisma } from '@/lib/prisma.server';
import { maskAddress } from '@/lib/api/ip-allowlist';

export interface KeyRefusalSummary {
  /** Refused requests in the window. */
  count: number;
  /** Masked address of the most recent refusal, when one is known. */
  lastPrefix: string | null;
}

/** The window the keys manager reports, in UTC days (today included). */
export const REFUSAL_WINDOW_DAYS = 7;

function dayOf(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Count one refusal. Fired without awaiting by the request path: a failed write
 * is logged and never changes the response.
 */
export function recordKeyRefusal(keyId: string, clientIp: string, now: Date = new Date()): void {
  const lastPrefix = maskAddress(clientIp);
  prisma.apiKeyRefusalDaily
    .upsert({
      where: {
        keyId_day: {
          keyId,
          day: dayOf(now),
        },
      },
      create: {
        keyId,
        day: dayOf(now),
        count: 1,
        lastPrefix,
      },
      // Keep the previous prefix when this address cannot be masked.
      update: {
        count: {
          increment: 1,
        },
        ...(lastPrefix
          ? {
              lastPrefix,
            }
          : {}),
      },
    })
    .catch((err: unknown) => {
      console.error('[dev-api] refusal count failed:', err);
    });
}

/** Refusals over the last 7 UTC days for each key id (keys with none are absent). */
export async function getKeyRefusalSummaries(
  keyIds: readonly string[],
  now: Date = new Date(),
): Promise<Map<string, KeyRefusalSummary>> {
  const out = new Map<string, KeyRefusalSummary>();
  if (keyIds.length === 0) return out;
  const since = dayOf(new Date(now.getTime() - (REFUSAL_WINDOW_DAYS - 1) * 86_400_000));
  const rows = await prisma.apiKeyRefusalDaily.findMany({
    where: {
      keyId: {
        in: [...keyIds],
      },
      day: {
        gte: since,
      },
    },
    orderBy: {
      day: 'desc',
    },
    select: {
      keyId: true,
      count: true,
      lastPrefix: true,
    },
  });
  for (const r of rows) {
    // Newest day first: the first prefix seen for a key is its latest.
    const cur = out.get(r.keyId) ?? {
      count: 0,
      lastPrefix: null,
    };
    out.set(r.keyId, {
      count: cur.count + r.count,
      lastPrefix: cur.lastPrefix ?? r.lastPrefix,
    });
  }
  return out;
}
