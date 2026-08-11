/**
 * The dossier, rendered as a file.
 *
 * Everything on `/sohumtracker` is an assertion about somebody, and an assertion
 * nobody can check is just a claim. These two renderings are the working: the
 * same rows the page draws, in the two shapes a reader would actually do
 * something with.
 *
 * # What is deliberately NOT in here
 *
 * Message TEXT. The tracker keeps it only long enough to summarise the day it
 * belongs to and then deletes it, and an export that copied it out would quietly
 * defeat that retention — a downloaded file has no expiry. Counts, durations and
 * the model's write-ups are the whole payload, which is also exactly what the
 * page shows.
 *
 * Server-only because nothing on the client builds a download; the API route is
 * the sole caller.
 */

import { buildPunchCard, compareWeeks, inferSleep, projectToDeadline } from './analytics';
import { TRACKING_TIME_ZONE } from './config';
import type { WatchDayDTO, WatchStateDTO } from './types';

/**
 * The CSV columns, in order, with how each is read off a day.
 *
 * A table rather than a hand-written header line and a hand-written row builder:
 * those are two lists that must stay in the same order forever, and they will
 * not. Here a column cannot exist in the header without existing in the row.
 */
const CSV_COLUMNS: ReadonlyArray<{ header: string; read: (day: WatchDayDTO) => string | number }> = [
  { header: 'date', read: (day) => day.dateKey },
  { header: 'signed_in_sec', read: (day) => day.onlineSec + day.idleSec + day.dndSec },
  { header: 'online_sec', read: (day) => day.onlineSec },
  { header: 'idle_sec', read: (day) => day.idleSec },
  { header: 'dnd_sec', read: (day) => day.dndSec },
  { header: 'desktop_sec', read: (day) => day.desktopSec },
  { header: 'mobile_sec', read: (day) => day.mobileSec },
  { header: 'web_sec', read: (day) => day.webSec },
  { header: 'voice_sec', read: (day) => day.voiceSec },
  { header: 'voice_sessions', read: (day) => day.voiceSessions },
  { header: 'longest_voice_sec', read: (day) => day.longestVoiceSec },
  { header: 'muted_sec', read: (day) => day.mutedSec },
  { header: 'deafened_sec', read: (day) => day.deafenedSec },
  { header: 'streaming_sec', read: (day) => day.streamingSec },
  { header: 'video_sec', read: (day) => day.videoSec },
  { header: 'alone_sec', read: (day) => day.aloneSec },
  { header: 'late_night_sec', read: (day) => day.lateNightSec },
  { header: 'messages', read: (day) => day.messages },
  { header: 'words', read: (day) => day.words },
  { header: 'characters', read: (day) => day.characters },
  { header: 'attachments', read: (day) => day.attachments },
  { header: 'links', read: (day) => day.links },
  { header: 'mentions', read: (day) => day.mentions },
  { header: 'emoji', read: (day) => day.emoji },
  { header: 'stickers', read: (day) => day.stickers },
  { header: 'replies', read: (day) => day.replies },
  { header: 'questions', read: (day) => day.questions },
  { header: 'late_night_messages', read: (day) => day.lateNightMessages },
  { header: 'reactions_given', read: (day) => day.reactionsGiven },
  { header: 'reactions_received', read: (day) => day.reactionsReceived },
  { header: 'gaming_sec', read: (day) => day.gamingSec },
  { header: 'game_sessions', read: (day) => day.gameSessions },
  { header: 'top_game', read: (day) => day.topGame ?? '' },
  { header: 'top_game_sec', read: (day) => day.topGameSec },
  { header: 'top_channel', read: (day) => day.topChannel ?? '' },
  { header: 'top_channel_messages', read: (day) => day.topChannelMessages },
  { header: 'first_seen_at', read: (day) => day.firstSeenAt ?? '' },
  { header: 'last_seen_at', read: (day) => day.lastSeenAt ?? '' },
  { header: 'summary_headline', read: (day) => day.summary?.headline ?? '' },
  { header: 'summary_mood', read: (day) => day.summary?.mood ?? '' },
];

/**
 * Quote a CSV field.
 *
 * Always quoting strings rather than only when they contain a delimiter: a game
 * name is arbitrary text somebody else chose and it takes one comma, quote or
 * newline in it to shift every column after it. Numbers are left bare so a
 * spreadsheet reads them as numbers.
 */
function csvField(value: string | number): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return `"${value.replace(/"/g, '""')}"`;
}

/** One row per day, every measured column. CRLF, which is what RFC 4180 says. */
export function toCsv(state: WatchStateDTO): string {
  const lines = [CSV_COLUMNS.map((column) => column.header).join(',')];
  for (const day of state.days) {
    lines.push(CSV_COLUMNS.map((column) => csvField(column.read(day))).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** The JSON export's shape — declared so a consumer has something to type against. */
export interface DossierExport {
  generatedAt: string;
  timeZone: string;
  todayKey: string;
  /** What the numbers are and are not, carried IN the file rather than only on the page. */
  notes: string[];
  totals: WatchStateDTO['totals'];
  days: WatchDayDTO[];
  summaries: {
    days: WatchStateDTO['days'][number]['summary'][];
    weeks: WatchStateDTO['weeks'];
    months: WatchStateDTO['months'];
  };
  derived: {
    punchCard: ReturnType<typeof buildPunchCard>;
    sleep: ReturnType<typeof inferSleep>;
    weekOverWeek: ReturnType<typeof compareWeeks>;
    projection: ReturnType<typeof projectToDeadline>;
  };
}

/**
 * The whole dossier as one object: measured rows, written summaries, and the
 * derived readings the page draws.
 *
 * The derivations are included rather than left to the consumer because they are
 * the interesting part and they are all defined in `analytics.ts` — shipping the
 * inputs and not the readings would invite four slightly different reimplementations.
 */
export function toDossierJson(state: WatchStateDTO): DossierExport {
  return {
    generatedAt: state.generatedAt,
    timeZone: state.timeZone,
    todayKey: state.todayKey,
    notes: [
      `Every day boundary and hour bucket is ${TRACKING_TIME_ZONE} local time, not UTC and not yours.`,
      'Durations are seconds. Instants are ISO 8601.',
      'online/idle/dnd are mutually exclusive and sum to time signed in. desktop/mobile/web OVERLAP and do not.',
      'Message text is not exported: the tracker deletes it after summarising the day, and a downloaded file has no expiry.',
      'derived.sleep is inferred from gaps in visibility, not measured. Everything else is counted.',
    ],
    totals: state.totals,
    days: state.days,
    summaries: {
      days: state.days.map((day) => day.summary).filter((summary) => summary !== null),
      weeks: state.weeks,
      months: state.months,
    },
    derived: {
      punchCard: buildPunchCard(state.days),
      sleep: inferSleep(state.days),
      weekOverWeek: compareWeeks(state.days, state.todayKey),
      projection: projectToDeadline(state.days, state.todayKey),
    },
  };
}
