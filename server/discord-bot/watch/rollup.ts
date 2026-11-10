/**
 * Raw session and message rows → the per-day aggregate the /sohumtracker calendar renders (port
 * of discordbot/watch_rollup.go). RECOMPUTED, never incremented: every figure is a pure function
 * of the rows that exist, so a duplicated event or a restart cannot inflate a total (the two
 * reaction counters are the only exception, and this file never writes them).
 *
 * Every boundary is local to the tracking zone, and every "how long was he X" figure is the UNION
 * of its spans, clipped to the day — overlapping rows (stacked activities, a crash-left open row)
 * must never report more time than the clock allows.
 */
import { parseDateKey, zonedParts, zonedTime } from '../tz';
import type { DayRollup, PresenceSession, StatusSession, TypingSession, VoiceSession, WatchMessage } from './types';

export const HOURS_PER_DAY = 24;
export const LATE_NIGHT_START = 0;
export const LATE_NIGHT_END = 5;

/** Activity types that count as playing: 0 Playing, 5 Competing (not Spotify, not watching). */
export const PLAYING_ACTIVITY_TYPES = new Set([0, 5]);

const secs = (ms: number): number => Math.trunc(ms / 1000);

/** A local YYYY-MM-DD → its [from, to) UTC instants (DST days are 23 or 25 hours). */
export function dayBounds(dateKey: string, tz: string): [number, number] {
  const d = parseDateKey(dateKey);
  if (!d) throw new Error(`bad dateKey "${dateKey}"`);
  return [zonedTime(tz, d.year, d.month, d.day), zonedTime(tz, d.year, d.month, d.day + 1)];
}

/** Whole seconds of the intersection of two intervals, 0 when they do not meet. */
export function overlapSeconds(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return end > start ? secs(end - start) : 0;
}

export interface Span {
  start: number;
  end: number;
}

/** The UNION of spans clipped to [from, to); touching spans merge. */
export function mergeSpans(spans: Span[], from: number, to: number): Span[] {
  const clipped: Span[] = [];
  for (const s of spans) {
    const start = Math.max(s.start, from);
    const end = Math.min(s.end, to);
    if (end > start) clipped.push({ start, end });
  }
  if (clipped.length < 2) return clipped;
  clipped.sort((a, b) => a.start - b.start);
  const merged: Span[] = [clipped[0]!];
  for (const s of clipped.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (!(s.start > last.end)) {
      if (s.end > last.end) last.end = s.end;
      continue;
    }
    merged.push({ ...s });
  }
  return merged;
}

export function unionSeconds(spans: Span[], from: number, to: number): number {
  return mergeSpans(spans, from, to).reduce((t, s) => t + secs(s.end - s.start), 0);
}

const sessionEnd = (endedAt: number | null, now: number): number => endedAt ?? now;

/** The largest entry, ties broken by name (stable across recomputes). */
export function topEntry(tally: Map<string, number>): [string, number] {
  let best: [string, number] = ['', 0];
  let found = false;
  for (const [name, value] of tally) {
    if (!found || value > best[1] || (value === best[1] && name < best[0])) {
      best = [name, value];
      found = true;
    }
  }
  return found ? best : ['', 0];
}

/** Apply a proration share, rounding to the nearest second. */
export function scale(v: number, share: number): number {
  if (v <= 0) return 0;
  if (share >= 1) return v;
  return Math.trunc(v * share + 0.5);
}

/** Distribute a span's seconds over the local hours it covers, clipped to the day. */
export function addHourlySpan(buckets: number[], start: number, end: number, dayFrom: number, dayTo: number, tz: string): void {
  let cursor = Math.max(start, dayFrom);
  const stop = Math.min(end, dayTo);
  if (!(stop > cursor)) return;
  while (cursor < stop) {
    const p = zonedParts(cursor, tz);
    let next = zonedTime(tz, p.year, p.month, p.day, p.hour + 1);
    if (next > stop) next = stop;
    if (p.hour >= 0 && p.hour < buckets.length) buckets[p.hour]! += secs(next - cursor);
    if (!(next > cursor)) return;
    cursor = next;
  }
}

function touch(d: DayRollup, t: number): void {
  if (!t) return;
  if (d.firstSeenAt === null || t < d.firstSeenAt) d.firstSeenAt = t;
  if (d.lastSeenAt === null || t > d.lastSeenAt) d.lastSeenAt = t;
}

export function emptyRollup(discordId: string, dateKey: string, timeZone: string): DayRollup {
  return {
    discordId,
    dateKey,
    timeZone,
    voiceSec: 0,
    voiceSessions: 0,
    longestVoiceSec: 0,
    mutedSec: 0,
    deafenedSec: 0,
    streamingSec: 0,
    videoSec: 0,
    aloneSec: 0,
    lateNightSec: 0,
    onlineSec: 0,
    idleSec: 0,
    dndSec: 0,
    desktopSec: 0,
    mobileSec: 0,
    webSec: 0,
    messages: 0,
    words: 0,
    characters: 0,
    attachments: 0,
    links: 0,
    mentions: 0,
    emoji: 0,
    stickers: 0,
    replies: 0,
    questions: 0,
    lateNightMessages: 0,
    reactionsGiven: 0,
    reactionsReceived: 0,
    jobMentions: 0,
    typingStarts: 0,
    typingAbandoned: 0,
    typingAbandonedSec: 0,
    gamingSec: 0,
    gameSessions: 0,
    topGame: '',
    topGameSec: 0,
    topChannel: '',
    topChannelMessages: 0,
    hourlyMessages: new Array(HOURS_PER_DAY).fill(0),
    hourlyVoiceSec: new Array(HOURS_PER_DAY).fill(0),
    hourlyGamingSec: new Array(HOURS_PER_DAY).fill(0),
    firstSeenAt: null,
    lastSeenAt: null,
  };
}

/** The pure aggregation (Go buildDayRollup). */
export function buildDayRollup(
  discordId: string,
  dateKey: string,
  timeZone: string,
  from: number,
  to: number,
  now: number,
  messages: WatchMessage[],
  voice: VoiceSession[],
  presence: PresenceSession[],
  statuses: StatusSession[],
  typing: TypingSession[],
): DayRollup {
  const d = emptyRollup(discordId, dateKey, timeZone);

  // ── Messages ──
  const byChannel = new Map<string, number>();
  for (const m of messages) {
    d.messages++;
    d.words += m.wordCount;
    d.characters += m.charCount;
    d.attachments += m.attachments;
    d.links += m.links;
    d.mentions += m.mentions;
    d.emoji += m.emoji;
    d.stickers += m.stickers;
    if (m.isReply) d.replies++;
    if (m.isQuestion) d.questions++;
    if (m.isLateNight) d.lateNightMessages++;
    if (m.mentionsJob) d.jobMentions++;
    const h = zonedParts(m.sentAt, timeZone).hour;
    if (h >= 0 && h < HOURS_PER_DAY) d.hourlyMessages[h]!++;
    const label = m.channelName || m.channelId;
    byChannel.set(label, (byChannel.get(label) ?? 0) + 1);
    touch(d, m.sentAt);
  }
  [d.topChannel, d.topChannelMessages] = topEntry(byChannel);

  // ── Voice ──
  const local = zonedParts(from, timeZone);
  const lateFrom = zonedTime(timeZone, local.year, local.month, local.day, LATE_NIGHT_START);
  const lateTo = zonedTime(timeZone, local.year, local.month, local.day, LATE_NIGHT_END);
  const voiceSpans: Span[] = [];
  for (const v of voice) {
    const end = sessionEnd(v.leftAt, now);
    const inDay = overlapSeconds(v.joinedAt, end, from, to);
    if (inDay <= 0) continue;
    voiceSpans.push({ start: v.joinedAt, end });
    if (inDay > d.longestVoiceSec) d.longestVoiceSec = inDay;
    if (!(v.joinedAt < from) && v.joinedAt < to) d.voiceSessions++;
    const total = secs(end - v.joinedAt);
    const share = total > 0 ? inDay / total : 1;
    d.mutedSec += scale(v.mutedSec, share);
    d.deafenedSec += scale(v.deafenedSec, share);
    d.streamingSec += scale(v.streamingSec, share);
    d.videoSec += scale(v.videoSec, share);
    d.aloneSec += scale(v.aloneSec, share);
    touch(d, Math.max(v.joinedAt, from));
    touch(d, Math.min(end, to));
  }
  for (const sp of mergeSpans(voiceSpans, from, to)) {
    d.voiceSec += secs(sp.end - sp.start);
    d.lateNightSec += overlapSeconds(sp.start, sp.end, lateFrom, lateTo);
    addHourlySpan(d.hourlyVoiceSec, sp.start, sp.end, from, to, timeZone);
  }

  // ── Time online (merged per status and per client, independently) ──
  const byStatus = new Map<string, Span[]>();
  const byClient = new Map<string, Span[]>();
  const push = (m: Map<string, Span[]>, k: string, s: Span) => m.set(k, [...(m.get(k) ?? []), s]);
  for (const st of statuses) {
    const end = sessionEnd(st.endedAt, now);
    if (overlapSeconds(st.startedAt, end, from, to) <= 0) continue;
    const sp = { start: st.startedAt, end };
    push(byStatus, st.status, sp);
    if (st.clients.desktop) push(byClient, 'desktop', sp);
    if (st.clients.mobile) push(byClient, 'mobile', sp);
    if (st.clients.web) push(byClient, 'web', sp);
    touch(d, Math.max(st.startedAt, from));
    touch(d, Math.min(end, to));
  }
  d.onlineSec = unionSeconds(byStatus.get('online') ?? [], from, to);
  d.idleSec = unionSeconds(byStatus.get('idle') ?? [], from, to);
  d.dndSec = unionSeconds(byStatus.get('dnd') ?? [], from, to);
  d.desktopSec = unionSeconds(byClient.get('desktop') ?? [], from, to);
  d.mobileSec = unionSeconds(byClient.get('mobile') ?? [], from, to);
  d.webSec = unionSeconds(byClient.get('web') ?? [], from, to);

  // Summed prorated toggles can exceed the merged voice total; the merged figure is the measured one.
  d.mutedSec = Math.min(d.mutedSec, d.voiceSec);
  d.deafenedSec = Math.min(d.deafenedSec, d.voiceSec);
  d.streamingSec = Math.min(d.streamingSec, d.voiceSec);
  d.videoSec = Math.min(d.videoSec, d.voiceSec);
  d.aloneSec = Math.min(d.aloneSec, d.voiceSec);

  // ── Games ──
  const gameSpans: Span[] = [];
  const byGame = new Map<string, Span[]>();
  for (const p of presence) {
    if (!PLAYING_ACTIVITY_TYPES.has(p.activityType)) continue;
    const end = sessionEnd(p.endedAt, now);
    if (overlapSeconds(p.startedAt, end, from, to) <= 0) continue;
    const sp = { start: p.startedAt, end };
    gameSpans.push(sp);
    if (!(p.startedAt < from) && p.startedAt < to) d.gameSessions++;
    push(byGame, p.activityName, sp);
    touch(d, Math.max(p.startedAt, from));
    touch(d, Math.min(end, to));
  }
  for (const sp of mergeSpans(gameSpans, from, to)) {
    d.gamingSec += secs(sp.end - sp.start);
    addHourlySpan(d.hourlyGamingSec, sp.start, sp.end, from, to, timeZone);
  }
  const gameTotals = new Map<string, number>();
  for (const [name, spans] of byGame) gameTotals.set(name, unionSeconds(spans, from, to));
  [d.topGame, d.topGameSec] = topEntry(gameTotals);

  // ── Typing: counted on the day the run STARTED; unsettled runs are not yet a verdict ──
  for (const tp of typing) {
    if (tp.settledAt === null) continue;
    if (tp.startedAt < from || !(tp.startedAt < to)) continue;
    d.typingStarts++;
    if (!tp.sent) {
      d.typingAbandoned++;
      d.typingAbandonedSec += tp.durationSec;
    }
  }
  return d;
}
