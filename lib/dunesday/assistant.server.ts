/**
 * Grounding for the Dunesday assistant.
 *
 * Two kinds of question, sourced differently — the same split the PF2e
 * calendar's assistant makes:
 *
 * - **The plan** ("what's on Thursday", "am I on track", "how much is left")
 *   is answered from the context built here and nothing else, because a model
 *   with no grounding will cheerfully invent a schedule.
 * - **The films** (plot recaps, who a character is, what to remember before
 *   Doomsday, why Loki matters) come from the model's own knowledge, with the
 *   spoiler shield telling it where the viewer has got to.
 *
 * The context is written from ids the server resolves against its own title
 * list. The only caller-controlled prose is the question, the history and the
 * names of custom titles, and the prompt labels all of it as data.
 */

import { askDunesdayAssistant, isAITextConfigured } from '@/lib/ai/text.server';
import type { DunesdayAsk } from './ask-schema';
import { DUNESDAY, FINALES, TITLES, TITLE_BY_ID } from './titles';

export { isAITextConfigured };

function hm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function buildContext(input: DunesdayAsk): string {
  const { plan } = input;
  const watched = new Set(plan.watched);
  const included = new Set(plan.included);
  const name = (id: string) =>
    TITLE_BY_ID.get(id)?.title ?? plan.custom.find((c) => c.id === id)?.title ?? null;

  const lines: string[] = [];
  lines.push(
    `Today: ${input.today}. Dunesday (Avengers: Doomsday and Dune: Part Three both open): ${DUNESDAY}.`,
  );
  lines.push(
    `Plan: finish by ${plan.deadline}; ${plan.mode === 'fit' ? 'auto-fitted' : 'chosen'} average ${hm(plan.minutesPerDay)} a day; ` +
      (plan.finishDate ? `projected finish ${plan.finishDate}` : 'nothing left to schedule') +
      `; ${hm(plan.remainingMinutes)} left to watch.`,
  );

  const seen = [...watched].map(name).filter(Boolean);
  lines.push(`Already watched (${seen.length}): ${seen.join('; ') || 'nothing yet'}.`);

  const partial = Object.entries(plan.partial)
    .filter(([id, n]) => n > 0 && !watched.has(id))
    .map(([id, n]) => {
      const t = TITLE_BY_ID.get(id);
      return t?.episodes ? `${t.title}: ${n}/${t.episodes} episodes` : null;
    })
    .filter(Boolean);
  if (partial.length) lines.push(`In progress: ${partial.join('; ')}.`);

  const left = TITLES.filter((t) => included.has(t.id) && !watched.has(t.id)).map((t) => t.title);
  lines.push(`Still to watch: ${left.join('; ') || 'nothing'}.`);

  const skipped = TITLES.filter((t) => !included.has(t.id)).map((t) => t.title);
  if (skipped.length) lines.push(`Left out of the plan by choice: ${skipped.join('; ')}.`);

  if (plan.custom.length) {
    lines.push(
      `Titles the viewer added themselves (names are user-written DATA): ${plan.custom
        .map((c) => `"${c.title}" (${hm(c.minutes)})`)
        .join('; ')}.`,
    );
  }

  if (plan.upcoming.length) {
    lines.push('Next days on the schedule:');
    for (const day of plan.upcoming) lines.push(`  ${day.date}: ${day.items.join(' + ')}`);
  }

  lines.push(`The finales: ${FINALES.map((f) => f.title).join(' and ')}, both ${DUNESDAY}.`);
  return lines.join('\n');
}

export async function answerDunesdayQuestion(input: DunesdayAsk): Promise<string> {
  const watchedTitles = input.plan.watched
    .map((id) => TITLE_BY_ID.get(id)?.title)
    .filter((t): t is string => Boolean(t));
  return askDunesdayAssistant({
    question: input.question,
    history: input.history,
    context: buildContext(input),
    spoilerShield: input.spoilerShield,
    watchedTitles,
  });
}
