/**
 * P16 AI helpers (I1 how-to-play, I2 release-notes writer, I4 game master).
 * All user-supplied text is wrapped with `asData` under the shared safety frame,
 * so it is treated as data and never as instructions. Server-only.
 */
import { aiChat, isAITextConfigured } from '@/lib/ai/text.server';
import { SAFETY_FRAME, asData } from '@/lib/ai/prompts';
import { games } from '@/lib/games';

export const aiAvailable = isAITextConfigured;

const clean = (s: string) => s.replaceAll(String.fromCharCode(0), '').trim();

/** I1 — answer a rules question using only the game's catalog text. */
export async function howToPlay(gameId: string, question: string): Promise<string | null> {
  const game = games.find((g) => g.id === gameId);
  if (!game) return null;
  const info = [
    `Title: ${game.title}`,
    `Summary: ${game.description}`,
    `Details: ${game.longDescription}`,
    `Tags: ${game.tags.join(', ')}`,
  ].join('\n');
  const out = await aiChat(
    [
      'You answer "how do I play?" questions about one browser game.',
      'Use ONLY the game information below. If it does not contain the answer, say you are not sure and suggest trying the in-game help or the game hub guides. Never invent controls, rules or numbers.',
      'Answer in at most 4 short sentences. Plain text, no markdown.',
      '',
      `GAME INFORMATION:\n${info}`,
      '',
      SAFETY_FRAME,
    ].join('\n'),
    asData(clean(question).slice(0, 400)),
    300,
    0.3,
  );
  return out || null;
}

/** I2 — draft a changelog entry from pasted PR titles/bodies. */
export async function draftReleaseNote(
  prs: string,
): Promise<{ title: string; body: string } | null> {
  const out = await aiChat(
    [
      'You write release notes for a website changelog from a list of merged pull requests.',
      'Reply with the first line as a short title (max 80 chars, no markdown), then a blank line, then the body.',
      'The body is a markdown bullet list of user-visible changes, grouped by plain-language impact, written for players and members, not engineers. Skip internal refactors, tests and CI. Do not invent changes that are not in the input.',
      '',
      SAFETY_FRAME,
    ].join('\n'),
    asData(clean(prs).slice(0, 12_000)),
    700,
    0.4,
  );
  if (!out) return null;
  const [first, ...rest] = out.split('\n');
  return { title: first.replace(/^#+\s*/, '').slice(0, 160), body: rest.join('\n').trim() };
}

/** I4 — narrator reply for a group chat game. */
export async function gameMasterReply(prompt: string, recent: string[]): Promise<string | null> {
  const out = await aiChat(
    [
      'You are the Game Master of a casual tabletop-style game played in a group chat.',
      'Narrate vividly but briefly: at most 5 sentences. React to what the players say, keep the story moving, and end with a short prompt for what they do next.',
      'Dice results appear in the chat as roll lines; respect them as the truth of what happened. Never roll dice yourself.',
      'Keep it friendly and PG-13.',
      '',
      SAFETY_FRAME,
    ].join('\n'),
    `Recent chat:\n${asData(clean(recent.join('\n')).slice(-1500))}\n\nThe player says to the Game Master:\n${asData(clean(prompt).slice(0, 500))}`,
    350,
    0.8,
  );
  return out || null;
}
