/**
 * The calendar's question-answering assistant.
 *
 * It answers two kinds of question and the difference matters.
 *
 * **About the table** — when they play, who has replied, what was announced,
 * what happened last time — it answers from **this context and nothing else**.
 * A model asked "when is the next game" with no grounding will happily invent a
 * Tuesday, and the one place a wrong answer costs something real is a page whose
 * whole job is telling five people when to show up. So the context is built
 * here, the prompt says to use only it, and a question it cannot answer from
 * that gets "I don't know" rather than a guess.
 *
 * **About Pathfinder itself** — rules, feats, character building, Golarion — it
 * answers from what the model knows, because there is no rules text here and
 * pretending otherwise would be worse. The prompt's job there is to keep the
 * two sourced separately (a remembered feat is never "what your table decided")
 * and to make hedging the default: "I think that is a level 4 feat, worth
 * checking on Archives of Nethys" beats a confident invention every time.
 *
 * The session write-ups are part of the grounding, which is what makes "what
 * did we do last time" answerable at all. They are indented under the session
 * they belong to so one night's events cannot be attributed to another.
 *
 * Prompt-injection posture matches the rest of `lib/ai/`: session titles, notes
 * and announcements are user-authored text, so they are labelled as data and
 * the system prompt says in as many words never to follow instructions found
 * inside them. Someone naming a session "ignore previous instructions" gets a
 * calendar entry, not a jailbreak.
 */

import { askCalendarAssistant, isAITextConfigured } from '@/lib/ai/text.server';
import { calendarWindow, personSelect, syncRule } from './sessions.server';
import { prisma } from '@/lib/prisma.server';
import { describeRule } from './schedule';
import { CAMPAIGN_TIME_ZONE, REFERENCE_TIME_ZONE, zoneAbbreviation } from './zoned-time';

export { isAITextConfigured };

/** Render an instant for the model: both reference zones, unambiguous. */
function stamp(instant: Date): string {
  const fmt = (timeZone: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(instant);
  return `${fmt(CAMPAIGN_TIME_ZONE)} Eastern / ${fmt(REFERENCE_TIME_ZONE)} ${zoneAbbreviation(
    instant,
    REFERENCE_TIME_ZONE,
  )}`;
}

/**
 * Build the grounding text.
 *
 * Bounded on purpose: 30 sessions and 15 announcements, with notes truncated.
 * The board can only hold ~26 future sessions by construction, so this is not a
 * real limit today — it is the ceiling that keeps one very long session note
 * from pushing the actual schedule out of the context window later.
 */
async function buildContext(now: Date): Promise<string> {
  const window = calendarWindow(now);
  await syncRule(window);

  const [sessions, announcements] = await Promise.all([
    prisma.pf2eSession.findMany({
      where: { startsAt: { gte: window.start, lt: window.end } },
      orderBy: { startsAt: 'asc' },
      take: 30,
      select: {
        id: true,
        title: true,
        notes: true,
        location: true,
        startsAt: true,
        endsAt: true,
        canceledAt: true,
        recapSummary: true,
        responses: {
          select: { status: true, note: true, user: { select: personSelect } },
        },
        // The three most recent accounts of the night, capped hard. The summary
        // above is usually enough and is what the model should lean on; these
        // are here because "who did Kelda talk to" is answerable from the raw
        // notes and not from a four-sentence précis of them.
        recaps: { orderBy: { createdAt: 'asc' }, take: 3, select: { body: true } },
      },
    }),
    prisma.pf2eAnnouncement.findMany({
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 15,
      select: { body: true, pinned: true, createdAt: true },
    }),
  ]);

  const lines: string[] = [];
  lines.push(`Right now it is ${stamp(now)}.`);
  lines.push(`The standing schedule is: ${describeRule()}.`);
  lines.push('');
  lines.push('SESSIONS:');

  if (!sessions.length) {
    lines.push('(none on the board)');
  }
  for (const session of sessions) {
    const when = session.startsAt < now ? 'PAST' : 'UPCOMING';
    const state = session.canceledAt ? 'CANCELLED' : when;
    const replies = session.responses.length
      ? session.responses
          .map((r) => {
            const name = r.user?.profile?.displayName || r.user?.name || 'someone';
            return `${name}=${r.status}${r.note ? ` (${r.note.slice(0, 80)})` : ''}`;
          })
          .join(', ')
      : 'no replies yet';
    lines.push(
      `- [${state}] "${session.title}" — ${stamp(session.startsAt)} to ${stamp(session.endsAt)}` +
        `${session.location ? ` — at ${session.location}` : ''}` +
        `${session.notes ? ` — notes: ${session.notes.slice(0, 400)}` : ''}` +
        ` — replies: ${replies}`,
    );
    // Indented under their session so the model cannot attribute one night's
    // events to another — the single most likely way this grounding goes wrong
    // once there is more than one write-up in the window.
    if (session.recapSummary) {
      lines.push(`    what happened: ${session.recapSummary.slice(0, 800)}`);
    }
    for (const recap of session.recaps) {
      lines.push(`    account: ${recap.body.slice(0, 600)}`);
    }
  }

  lines.push('');
  lines.push('ANNOUNCEMENTS:');
  if (!announcements.length) lines.push('(none)');
  for (const announcement of announcements) {
    lines.push(
      `- ${announcement.pinned ? '[PINNED] ' : ''}${stamp(announcement.createdAt)}: ` +
        announcement.body.slice(0, 400),
    );
  }

  return lines.join('\n');
}

export interface AssistantTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Answer one question about the board.
 *
 * `viewerName` is passed so "am I down for next week" can be resolved against
 * the roster — without it the model has no way to know which of the names in
 * the context is the person asking.
 */
export async function answerCalendarQuestion(
  question: string,
  history: AssistantTurn[],
  viewerName: string | null,
  now: Date = new Date(),
): Promise<string> {
  const context = await buildContext(now);
  return askCalendarAssistant({ question, history, viewerName, context });
}
