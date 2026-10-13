/**
 * X11 · Dead-link rescue - server side.
 *
 * Link cards are unfurled on the client from `/api/oembed?type=og`; nothing about
 * them was stored. This module adds the missing memory: the first time a card's
 * link is previewed it gets a `link_check` row (title/description snapshot plus
 * check state). A background job re-checks due rows in a bounded batch - HEAD,
 * then GET - and when a link has answered 404/410 on two consecutive checks it
 * asks the Wayback Machine for a snapshot and the card swaps to it, labelled
 * "Archived copy". Every outbound request goes through `safeFetch`.
 */

import { createHash } from 'node:crypto';
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { safeFetch, SsrfError } from '@/lib/ssrf-guard.server';
import { canonicalizeUrl } from '@/lib/unfurl/parse';
import {
  DEAD_AFTER_FAILS,
  classifyStatus,
  parseWaybackResponse,
  type LinkVerdict,
  type WaybackSnapshot,
} from './wayback';
import { DAY_MS } from './constants';

const USER_AGENT = 'Mozilla/5.0 (compatible; RMHStudiosLinkCheck/1.0; +https://rmhstudios.com)';
const CHECK_TIMEOUT_MS = 6_000;
const WAYBACK_TIMEOUT_MS = 8_000;
const WAYBACK_ENDPOINT = 'https://archive.org/wayback/available?url=';
/** A healthy link is looked at again after this long. */
const RECHECK_OK_MS = 7 * DAY_MS;
/** A link that just answered 404/410 is looked at again after this long (needs 2 in a row). */
const RECHECK_FAILING_MS = 3 * DAY_MS;
const SEEN_THROTTLE_MS = 60 * 60_000;
const PRUNE_AFTER_MS = 90 * DAY_MS;

export function linkKey(canonicalUrl: string): string {
  return createHash('sha256').update(canonicalUrl).digest('hex');
}

const clip = (v: string | null | undefined, n: number) => (v ? v.slice(0, n) : null);

/* ------------------------------ registration ----------------------------- */

/**
 * Remember that a card previewed this link. Throttled to once an hour per link
 * per process, so a viral link costs one write an hour rather than one per view.
 * Never throws - a bookkeeping failure must not break the preview.
 */
export async function noteLinkSeen(
  rawUrl: string,
  meta: { title?: string | null; description?: string | null; siteName?: string | null },
): Promise<void> {
  try {
    const url = canonicalizeUrl(rawUrl);
    if (!url || url.length > 2048) return;
    const urlKey = linkKey(url);
    const throttleKey = `link:seen:${urlKey}`;
    if (apiCache.get(throttleKey)) return;
    apiCache.set(throttleKey, 1, SEEN_THROTTLE_MS);

    const now = new Date();
    // Healthy rows keep their snapshot fresh; any other state keeps the last good one.
    const refreshed = await prisma.linkCheck.updateMany({
      where: { urlKey, status: 'ok' },
      data: {
        lastSeenAt: now,
        title: clip(meta.title, 300),
        description: clip(meta.description, 500),
        siteName: clip(meta.siteName, 120),
      },
    });
    if (refreshed.count > 0) return;
    const touched = await prisma.linkCheck.updateMany({
      where: { urlKey },
      data: { lastSeenAt: now },
    });
    if (touched.count > 0) return;
    await prisma.linkCheck.createMany({
      data: [
        {
          urlKey,
          url,
          title: clip(meta.title, 300),
          description: clip(meta.description, 500),
          siteName: clip(meta.siteName, 120),
          nextCheckAt: new Date(now.getTime() + RECHECK_OK_MS),
        },
      ],
      skipDuplicates: true,
    });
  } catch (e) {
    console.error('[link-rescue] noteLinkSeen failed:', (e as Error)?.message);
  }
}

export interface ArchivedCard {
  title: string | null;
  description: string | null;
  siteName: string | null;
  archiveUrl: string;
  archiveTimestamp: string | null;
}

/** The archived stand-in for a link, or null when the live page should be used. */
export async function getArchivedCard(rawUrl: string): Promise<ArchivedCard | null> {
  const url = canonicalizeUrl(rawUrl);
  if (!url) return null;
  const row = await prisma.linkCheck.findUnique({
    where: { urlKey: linkKey(url) },
    select: {
      status: true,
      title: true,
      description: true,
      siteName: true,
      archiveUrl: true,
      archiveTimestamp: true,
    },
  });
  if (!row || row.status !== 'archived' || !row.archiveUrl) return null;
  return {
    title: row.title,
    description: row.description,
    siteName: row.siteName,
    archiveUrl: row.archiveUrl,
    archiveTimestamp: row.archiveTimestamp,
  };
}

/* -------------------------------- checking ------------------------------- */

export interface CheckOutcome {
  verdict: LinkVerdict;
  status: number | null;
  blocked: boolean;
}

/** HEAD first (cheap); anything but a success is confirmed with a GET before it counts. */
export async function probeLink(url: string): Promise<CheckOutcome> {
  const opts = {
    allowedProtocols: ['https:', 'http:'],
    timeoutMs: CHECK_TIMEOUT_MS,
    maxRedirects: 4,
    headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
  };
  try {
    let status: number | null = null;
    try {
      const head = await safeFetch(url, { ...opts, method: 'HEAD' });
      status = head.status;
      await head.body?.cancel().catch(() => {});
    } catch (e) {
      if (e instanceof SsrfError) throw e;
      status = null; // fall through to GET
    }
    if (status !== null && classifyStatus(status) === 'ok') {
      return { verdict: 'ok', status, blocked: false };
    }
    const get = await safeFetch(url, { ...opts, method: 'GET' });
    status = get.status;
    await get.body?.cancel().catch(() => {});
    return { verdict: classifyStatus(status), status, blocked: false };
  } catch (e) {
    if (e instanceof SsrfError) return { verdict: 'unknown', status: null, blocked: true };
    // Timeouts, DNS failures, resets: the site is unreachable right now, which is
    // not evidence the page is gone.
    return { verdict: 'unknown', status: null, blocked: false };
  }
}

export async function lookupWayback(url: string): Promise<WaybackSnapshot | null> {
  try {
    const res = await safeFetch(WAYBACK_ENDPOINT + encodeURIComponent(url), {
      allowedHosts: ['archive.org'],
      timeoutMs: WAYBACK_TIMEOUT_MS,
      maxRedirects: 2,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    return parseWaybackResponse(await res.json());
  } catch {
    return null;
  }
}

type DueRow = { urlKey: string; url: string; failCount: number; status: string };

/** Check one row and persist the result. */
export async function checkOne(row: DueRow, now: Date): Promise<void> {
  const out = await probeLink(row.url);

  if (out.blocked) {
    // The guard refuses this destination; checking it again will not change that.
    await prisma.linkCheck.update({
      where: { urlKey: row.urlKey },
      data: {
        status: 'blocked',
        lastCheckedAt: now,
        nextCheckAt: new Date(now.getTime() + 365 * DAY_MS),
      },
    });
    return;
  }

  if (out.verdict === 'ok') {
    await prisma.linkCheck.update({
      where: { urlKey: row.urlKey },
      data: {
        status: 'ok',
        failCount: 0,
        lastStatusCode: out.status,
        lastCheckedAt: now,
        nextCheckAt: new Date(now.getTime() + RECHECK_OK_MS),
        // The original is back: the card returns to the live page.
        archiveUrl: null,
        archiveTimestamp: null,
      },
    });
    return;
  }

  if (out.verdict === 'unknown') {
    await prisma.linkCheck.update({
      where: { urlKey: row.urlKey },
      data: {
        lastStatusCode: out.status,
        lastCheckedAt: now,
        nextCheckAt: new Date(now.getTime() + RECHECK_OK_MS),
      },
    });
    return;
  }

  // 404 / 410.
  const failCount = row.failCount + 1;
  if (failCount < DEAD_AFTER_FAILS) {
    await prisma.linkCheck.update({
      where: { urlKey: row.urlKey },
      data: {
        status: 'failing',
        failCount,
        lastStatusCode: out.status,
        lastCheckedAt: now,
        nextCheckAt: new Date(now.getTime() + RECHECK_FAILING_MS),
      },
    });
    return;
  }
  const snapshot = await lookupWayback(row.url);
  await prisma.linkCheck.update({
    where: { urlKey: row.urlKey },
    data: snapshot
      ? {
          status: 'archived',
          failCount,
          lastStatusCode: out.status,
          lastCheckedAt: now,
          archiveUrl: snapshot.url,
          archiveTimestamp: snapshot.timestamp,
          nextCheckAt: new Date(now.getTime() + RECHECK_OK_MS),
        }
      : {
          status: 'dead',
          failCount,
          lastStatusCode: out.status,
          lastCheckedAt: now,
          nextCheckAt: new Date(now.getTime() + RECHECK_OK_MS),
        },
  });
}

const BATCH = 100;
const CONCURRENCY = 5;

export interface RescueRunResult {
  checked: number;
  archived: number;
  pruned: number;
}

/** One bounded pass: check the links that are due, then prune links nobody has seen in 90 days. */
export async function runLinkRescue(now: Date = new Date()): Promise<RescueRunResult> {
  const result: RescueRunResult = { checked: 0, archived: 0, pruned: 0 };
  const due = await prisma.linkCheck.findMany({
    where: { nextCheckAt: { lte: now }, status: { not: 'blocked' } },
    orderBy: { nextCheckAt: 'asc' },
    take: BATCH,
    select: { urlKey: true, url: true, failCount: true, status: true },
  });

  let cursor = 0;
  const worker = async () => {
    while (cursor < due.length) {
      const row = due[cursor++];
      try {
        await checkOne(row, now);
        result.checked++;
      } catch (e) {
        console.error('[link-rescue] check failed:', row.urlKey, (e as Error)?.message);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, due.length) }, worker));

  result.archived = due.length
    ? await prisma.linkCheck.count({
        where: { urlKey: { in: due.map((d) => d.urlKey) }, status: 'archived', lastCheckedAt: now },
      })
    : 0;

  const stale = await prisma.linkCheck.findMany({
    where: { lastSeenAt: { lt: new Date(now.getTime() - PRUNE_AFTER_MS) } },
    take: 500,
    select: { urlKey: true },
  });
  if (stale.length) {
    const del = await prisma.linkCheck.deleteMany({
      where: { urlKey: { in: stale.map((s) => s.urlKey) } },
    });
    result.pruned = del.count;
  }
  return result;
}

export const LINK_RESCUE_QUEUE = 'links.dead-link-rescue';
/** Daily at 05:40 UTC: each link is re-checked weekly, but a fixed weekly slot would starve a big backlog. */
export const LINK_RESCUE_CRON = '40 5 * * *';

export async function registerLinkRescueCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(LINK_RESCUE_QUEUE);
  await boss.schedule(LINK_RESCUE_QUEUE, LINK_RESCUE_CRON, {}, { tz: 'UTC' });
  await boss.work(LINK_RESCUE_QUEUE, async () => {
    await runLinkRescue();
  });
}
