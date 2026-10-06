/**
 * Everything a synced Dunesday plan publishes, as pure functions of
 * (state, time zone, now): the calendar subscription's events, the RSS items,
 * and the Discord payloads. No Prisma, no fetch — the routes and the worker
 * load the row and post the result, and these can be tested on their own.
 *
 * Every date here is a plan-zone date. "Tonight" is read in the zone the plan
 * was synced from, because the worker runs in UTC and the subscriber's
 * calendar app runs wherever their phone is.
 */

import type { ICSEvent } from '@/lib/events-ics';
import type { RssItem } from '@/lib/rss';
import { getZonedParts, zonedDateKey, zonedTimeToUtc } from '@/lib/pf2ecal/zoned-time';
import {
  buildPlan,
  daysBetween,
  formatMinutes,
  parseDay,
  type Plan,
  type PlanEntry,
} from './schedule';
import {
  allTitles,
  effectiveSettings,
  isIncluded,
  isWatched,
  progressOf,
  remainingWork,
  titleById,
  type DunesdayState,
  type Progress,
} from './state';
import { DUNESDAY } from './titles';

export interface FeedContext {
  state: DunesdayState;
  timeZone: string;
  now: Date;
  feedId: string;
  /** Absolute site origin, e.g. https://rmhstudios.com */
  siteUrl: string;
}

export interface Snapshot {
  today: string;
  plan: Plan;
  progress: Progress;
}

/** Is this an IANA zone the runtime understands? */
export function isValidTimeZone(zone: string): boolean {
  if (!zone || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function snapshot(state: DunesdayState, timeZone: string, now: Date): Snapshot {
  const today = zonedDateKey(now, timeZone);
  const plan = buildPlan(remainingWork(state), effectiveSettings(state, today));
  return { today, plan, progress: progressOf(state, today) };
}

/** The instant the nightly block starts on a plan-zone date. */
export function nightStart(day: string, watchTime: string, timeZone: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  const [hour, minute] = watchTime.split(':').map(Number);
  return zonedTimeToUtc({ year, month, day: date, hour, minute }, timeZone);
}

/** English labels: feeds and Discord posts have no viewer locale to follow. */
export function entryLabel(state: DunesdayState, entry: PlanEntry): string {
  const title = titleById(state, entry.titleId)?.title ?? entry.titleId;
  if (entry.episodes) {
    const [a, b] = entry.episodes;
    return a === b ? `${title} · Ep ${a}` : `${title} · Ep ${a}–${b}`;
  }
  if (entry.part) return `${title} · Part ${entry.part[0]} of ${entry.part[1]}`;
  return title;
}

function longDay(day: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(parseDay(day));
}

function pageUrl(ctx: FeedContext): string {
  return `${ctx.siteUrl}/dunesday`;
}

// ── Calendar ───────────────────────────────────────────────────────────────

/**
 * One event per remaining watch night, plus Dunesday itself.
 *
 * UIDs are per (feed, date), so when the plan reshuffles, a night keeps its
 * event and only its contents change. `sequence` rides the plan's update time
 * so subscribers actually replace what they hold.
 */
export function calendarEvents(ctx: FeedContext, updatedAt: Date): ICSEvent[] {
  const { state, timeZone } = ctx;
  const { plan } = snapshot(state, timeZone, ctx.now);
  const sequence = Math.max(0, Math.floor((updatedAt.getTime() - Date.UTC(2020, 0, 1)) / 60_000));
  const events: ICSEvent[] = plan.days
    .filter((d) => d.entries.length > 0)
    .map((d) => {
      const startsAt = nightStart(d.date, state.watchTime, timeZone);
      const labels = d.entries.map((e) => entryLabel(state, e));
      return {
        id: `dunesday-${ctx.feedId}-${d.date}`,
        title: `🍿 ${labels.join(' + ')}`,
        description:
          d.entries
            .map((e) => `• ${entryLabel(state, e)} (${formatMinutes(e.minutes)})`)
            .join('\n') +
          `\n\nTotal ${formatMinutes(d.minutes)} · Dunesday marathon\n${pageUrl(ctx)}`,
        startsAt,
        endsAt: new Date(startsAt.getTime() + Math.max(1, d.minutes) * 60_000),
        url: pageUrl(ctx),
        sequence,
      };
    });

  const finale = nightStart(DUNESDAY, '19:00', timeZone);
  events.push({
    id: `dunesday-${ctx.feedId}-finale`,
    title: '🎬 DUNESDAY — Avengers: Doomsday + Dune: Part Three',
    description: 'Both films open today. You made it.',
    startsAt: finale,
    endsAt: new Date(finale.getTime() + 5 * 3_600_000),
    url: pageUrl(ctx),
    sequence,
  });
  return events;
}

// ── RSS ────────────────────────────────────────────────────────────────────

/**
 * Today's lineup (and tomorrow's once today's is done or empty) plus a
 * "watched" item for everything ticked off — newest first, capped at 50.
 * Watched items are dated at noon of the day they were ticked, in plan time.
 */
export function rssItems(ctx: FeedContext): RssItem[] {
  const { state, timeZone, now } = ctx;
  const { today, plan, progress } = snapshot(state, timeZone, now);
  const items: RssItem[] = [];
  const link = pageUrl(ctx);

  const upcoming = plan.days.filter((d) => d.date >= today && d.entries.length > 0).slice(0, 1);
  for (const day of upcoming) {
    const labels = day.entries.map((e) => entryLabel(state, e));
    items.push({
      title: `${day.date === today ? 'Tonight' : longDay(day.date)}: ${labels.join(' + ')}`,
      link,
      guid: `${link}#feed-${ctx.feedId}-lineup-${day.date}`,
      description:
        `<p>${day.date === today ? 'Tonight' : `Next up on ${longDay(day.date)}`} — ` +
        `${formatMinutes(day.minutes)} of watching.</p><ul>` +
        day.entries
          .map((e) => `<li>${escapeHtml(entryLabel(state, e))} (${formatMinutes(e.minutes)})</li>`)
          .join('') +
        `</ul><p>${progress.titlesWatched}/${progress.titlesTotal} titles watched · ` +
        `${daysBetween(today, DUNESDAY)} days to Dunesday.</p>`,
      // Published at the start of the day it is for, so it sorts above the
      // watched items from the same day.
      pubDate: nightStart(day.date > today ? today : day.date, '00:00', timeZone),
      categories: ['Lineup'],
    });
  }

  const watched = Object.entries(state.watched)
    .map(([id, day]) => ({ title: titleById(state, id), day }))
    .filter((w): w is { title: NonNullable<typeof w.title>; day: string } => Boolean(w.title))
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, 50);
  for (const w of watched) {
    items.push({
      title: `Watched: ${w.title.title}`,
      link,
      guid: `${link}#feed-${ctx.feedId}-watched-${w.title.id}`,
      description: w.title.hook ? `<p>${escapeHtml(w.title.hook)}</p>` : '<p>Ticked off.</p>',
      pubDate: nightStart(w.day, '12:00', timeZone),
      categories: [
        w.title.franchise === 'dune' ? 'Dune' : w.title.franchise === 'mcu' ? 'MCU' : 'Extra',
      ],
    });
  }
  return items;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[<>&"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!,
  );
}

// ── Discord ────────────────────────────────────────────────────────────────

const AQUA = 0x19b5f0;
const GREEN = 0x4cbf33;
const SAND = 0xeaa548;

/** Discord renders markdown in embeds; a user-written name must not. */
function plain(text: string): string {
  return text
    .replace(/[\\*_~`|>[\]()#@]/g, '')
    .trim()
    .slice(0, 40);
}

function statusField(snap: Snapshot, state: DunesdayState) {
  const { plan, progress } = snap;
  const pct = progress.totalMinutes
    ? Math.round((progress.watchedMinutes / progress.totalMinutes) * 100)
    : 0;
  const finish = plan.finishDate
    ? `${longDay(plan.finishDate)} ${plan.onTime ? '✅ on track' : `⚠️ ${-plan.slackDays}d past ${longDay(state.settings.deadline)}`}`
    : 'Nothing left 🎉';
  return [
    {
      name: 'Progress',
      value: `${progress.titlesWatched}/${progress.titlesTotal} titles · ${pct}%`,
      inline: true,
    },
    {
      name: 'Time left',
      value: formatMinutes(Math.max(0, progress.totalMinutes - progress.watchedMinutes)),
      inline: true,
    },
    { name: 'Finish', value: finish, inline: true },
  ];
}

function footer(today: string) {
  const left = daysBetween(today, DUNESDAY);
  return {
    text:
      left > 0
        ? `Dunesday marathon · ${left} days to go`
        : left === 0
          ? 'It’s Dunesday!'
          : 'Dunesday marathon',
  };
}

/** Is it time to post today's lineup? An hour before the nightly start, until three hours after. */
export function isDailyDue(ctx: FeedContext, lastPosted: string | null): boolean {
  const { today, plan } = snapshot(ctx.state, ctx.timeZone, ctx.now);
  if (lastPosted === today) return false;
  const night = plan.days.find((d) => d.date === today);
  if (!night || night.entries.length === 0) return false;
  const start = nightStart(today, ctx.state.watchTime, ctx.timeZone).getTime();
  const t = ctx.now.getTime();
  return t >= start - 3_600_000 && t <= start + 3 * 3_600_000;
}

export function dailyLineupPayload(ctx: FeedContext, name: string | null) {
  const snap = snapshot(ctx.state, ctx.timeZone, ctx.now);
  const night = snap.plan.days.find((d) => d.date === snap.today);
  if (!night || night.entries.length === 0) return null;
  const who = name ? plain(name) : '';
  const start = nightStart(snap.today, ctx.state.watchTime, ctx.timeZone);
  const p = getZonedParts(start, ctx.timeZone);
  const clock = `${((p.hour + 11) % 12) + 1}:${String(p.minute).padStart(2, '0')} ${p.hour < 12 ? 'AM' : 'PM'}`;
  return {
    username: 'Dunesday',
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: who ? `🍿 Tonight's lineup for ${who}` : "🍿 Tonight's lineup",
        url: pageUrl(ctx),
        color: AQUA,
        description:
          night.entries
            .map((e) => {
              const t = titleById(ctx.state, e.titleId);
              return `**${entryLabel(ctx.state, e)}** — ${formatMinutes(e.minutes)}${t?.hook ? `\n${t.hook}` : ''}`;
            })
            .join('\n\n') + `\n\nStarts ${clock} · ${formatMinutes(night.minutes)} total`,
        fields: statusField(snap, ctx.state),
        footer: footer(snap.today),
      },
    ],
  };
}

function phasesDone(state: DunesdayState): Set<string> {
  const out = new Set<string>();
  const titles = allTitles(state).filter((t) => isIncluded(state, t));
  for (let phase = 1; phase <= 6; phase++) {
    const inPhase = titles.filter((t) => t.franchise === 'mcu' && t.phase === phase);
    if (inPhase.length && inPhase.every((t) => isWatched(state, t))) out.add(`MCU Phase ${phase}`);
  }
  const dune = titles.filter((t) => t.franchise === 'dune');
  if (dune.length && dune.every((t) => isWatched(state, t))) out.add('Dune');
  return out;
}

/**
 * What changed between two saves, as one Discord post — or null when nothing
 * worth announcing did (un-ticking, settings changes, reordering).
 */
export function progressPayload(before: DunesdayState, ctx: FeedContext, name: string | null) {
  const after = ctx.state;
  const lines: string[] = [];
  const finished = Object.keys(after.watched).filter((id) => !before.watched[id]);
  for (const id of finished) {
    const t = titleById(after, id);
    if (t) lines.push(`✅ **${t.title}**`);
  }
  for (const [id, n] of Object.entries(after.episodesWatched)) {
    const was = before.episodesWatched[id] ?? 0;
    const t = titleById(after, id);
    if (!t?.episodes || n <= was || after.watched[id]) continue;
    lines.push(
      was + 1 === n ? `📺 **${t.title}** · Ep ${n}` : `📺 **${t.title}** · Ep ${was + 1}–${n}`,
    );
  }
  if (!lines.length) return null;

  const newPhases = [...phasesDone(after)].filter((p) => !phasesDone(before).has(p));
  const snap = snapshot(after, ctx.timeZone, ctx.now);
  const who = name ? plain(name) : '';
  const allDone =
    snap.progress.titlesTotal > 0 && snap.progress.titlesWatched === snap.progress.titlesTotal;

  return {
    username: 'Dunesday',
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: allDone
          ? `🏆 ${who || 'Someone'} finished the whole marathon!`
          : who
            ? `Progress update from ${who}`
            : 'Marathon progress',
        url: pageUrl(ctx),
        color: newPhases.length || allDone ? SAND : GREEN,
        description:
          lines.slice(0, 15).join('\n') +
          (lines.length > 15 ? `\n…and ${lines.length - 15} more` : '') +
          (newPhases.length ? `\n\n🏅 Completed: **${newPhases.join(', ')}**` : ''),
        fields: statusField(snap, after),
        footer: footer(snap.today),
      },
    ],
  };
}

export function testPayload(ctx: FeedContext) {
  const snap = snapshot(ctx.state, ctx.timeZone, ctx.now);
  return {
    username: 'Dunesday',
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: 'Dunesday is connected 🎉',
        url: pageUrl(ctx),
        color: AQUA,
        description:
          'This channel will get tonight’s lineup an hour before you start, and a post whenever titles are ticked off.',
        fields: statusField(snap, ctx.state),
        footer: footer(snap.today),
      },
    ],
  };
}
