/**
 * The live-events hub. Server-only.
 *
 * Every freshly built snapshot is diffed against the previous one for its Election
 * Day (`ingestSnapshot`); the resulting events go out over the realtime bus
 * (Redis-backed when configured, so every web instance streams every event) and
 * each instance keeps the last 200 per day in memory for people joining
 * mid-night. Like the chat ring, the ring is fed ONLY by the bus subscription, so
 * an event lands exactly once whether Redis is on or off, and deterministic ids
 * make the same event seen by two instances collapse to one.
 */

import { createBus } from '@/lib/realtime-bus.server';
import { closedPollEvents, diffSnapshots, pushEvents, type ElectionEvent } from './events';
import type { NewsItem } from './news';
import type { ElectionSnapshot } from './types';

const bus = createBus<ElectionEvent>('elections-events');
const rings = new Map<string, ElectionEvent[]>();
const listening = new Set<string>();
const previous = new Map<string, ElectionSnapshot>();
const announced = new Map<string, Set<string>>();

function ensure(date: string) {
  if (listening.has(date)) return;
  listening.add(date);
  bus.subscribe(date, (ev) => rings.set(date, pushEvents(rings.get(date) ?? [], [ev])));
}

export function eventHistory(date: string): ElectionEvent[] {
  ensure(date);
  return [...(rings.get(date) ?? [])];
}

export function subscribeEvents(date: string, listener: (ev: ElectionEvent) => void): () => void {
  ensure(date);
  return bus.subscribe(date, listener);
}

function publish(date: string, events: ElectionEvent[]) {
  ensure(date);
  for (const ev of events) bus.publish(date, ev);
}

/** Diff `next` against the last snapshot for its day and publish what changed. Never throws. */
export function ingestSnapshot(next: ElectionSnapshot, now: number = Date.now()): ElectionEvent[] {
  try {
    if (!next.races.length) return [];
    const prev = previous.get(next.date);
    previous.set(next.date, next);

    const events: ElectionEvent[] = prev ? diffSnapshots(prev, next, now) : [];

    const statewide = new Set(next.races.filter((r) => r.office !== 'house').map((r) => r.state));
    const closed = closedPollEvents(next.date, next.pollClosings, announced.get(next.date) ?? new Set(), now, (s) => statewide.has(s));
    announced.set(next.date, closed.announced);
    events.push(...closed.events);

    publish(next.date, events);
    return events;
  } catch (err) {
    console.warn('[elections] event ingest failed:', String(err));
    return [];
  }
}

/** Announce fresh headlines as `news` events (a few per refresh, so a backlog is not a flood). */
export function publishNews(date: string, items: NewsItem[], max = 3): void {
  publish(
    date,
    items.slice(0, max).map((n) => ({
      id: `news:${n.id}`,
      at: Date.parse(n.publishedAt) || Date.now(),
      date,
      kind: 'news' as const,
      importance: 1 as const,
      text: `${n.source}: ${n.title}`,
      url: n.url,
      state: n.states[0],
    })),
  );
}

/** Test seam. */
export function __resetEvents() {
  rings.clear();
  listening.clear();
  previous.clear();
  announced.clear();
}
