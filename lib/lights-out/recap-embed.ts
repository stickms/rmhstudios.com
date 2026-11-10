/**
 * Lights Out daily-recap embed (D3: ported from the Go worker `internal/recap`).
 * Pure: no Prisma, no network. The job that posts it is `recap.server.ts`.
 */
import { createSeededRng, getDateSeed } from './seed';
import { getDailyShape, getShapeLabel } from './shapes';
import { generatePuzzle, getOptimalMoves } from './lights-out';

export interface RecapParticipant {
  username: string;
  status: string;
  moves: number | null;
  ratingEmoji: string | null;
  ratingLabel: string | null;
}

export interface RecapEmbed {
  title: string;
  description: string;
  color: number;
  image: { url: string };
  footer: { text: string };
  timestamp: string;
}

/** 0xf59e0b (amber). */
export const RECAP_EMBED_COLOR = 0xf59e0b;
const MEDALS = ['\u{1F947}', '\u{1F948}', '\u{1F949}']; // gold, silver, bronze

const plural = (n: number) => (n === 1 ? '' : 's');

/** Shape label and optimal move count of the puzzle a dateKey (YYYY-MM-DD) names. */
export function computePuzzleMeta(dateKey: string): { shapeLabel: string; optimal: number | null } {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (![y, m, d].every((n) => Number.isFinite(n))) return { shapeLabel: dateKey, optimal: null };
  const seed = getDateSeed(new Date(y, m - 1, d));
  const shape = getDailyShape(seed);
  const grid = generatePuzzle(createSeededRng(seed), shape);
  return { shapeLabel: getShapeLabel(shape), optimal: getOptimalMoves(grid, shape) };
}

export function activityImageUrl(siteUrl: string, guildId: string, dateKey: string): string {
  return `${siteUrl}/api/discord/activity-image?type=leaderboard&guildId=${guildId}&dateKey=${dateKey}&recap=1`;
}

/**
 * Build the recap. `participants` is the full list ordered by moves ascending
 * (nulls last). Returns null when nobody played (the caller just clears the schedule).
 */
export function buildRecapEmbed(
  participants: RecapParticipant[],
  dateKey: string,
  guildId: string,
  appId: string,
  siteUrl: string,
  now: Date = new Date(),
): RecapEmbed | null {
  if (participants.length === 0) return null;
  const meta = computePuzzleMeta(dateKey);
  const completed = participants.filter((p) => p.status === 'completed');
  const playing = participants.filter((p) => p.status === 'playing');

  const lines = completed.map((p, i) => {
    const medal = MEDALS[i] ?? '▪️';
    const emoji = p.ratingEmoji ? p.ratingEmoji : '\u{1F4A1}';
    const moves = p.moves ?? 0;
    let line = `${medal} **${p.username}** — ${emoji} ${moves} move${plural(moves)}`;
    if (p.ratingLabel) line += ` (${p.ratingLabel})`;
    return line;
  });
  if (playing.length > 0) {
    lines.push(`\u{1F3F3}️ ${playing.length} player${plural(playing.length)} did not finish`);
  }

  let header = `**${dateKey}** · ${meta.shapeLabel}`;
  if (meta.optimal !== null) header += ` · Optimal: ${meta.optimal} moves`;

  const parts = [
    header,
    '',
    `**${participants.length}** player${plural(participants.length)} attempted yesterday’s puzzle:`,
    '',
    ...lines,
    '',
  ];
  if (appId) {
    parts.push(`[▶️ Play today’s puzzle](https://discord.com/activities/${appId})`);
  }

  return {
    title: '\u{1F526} Lights Out — Daily Recap',
    // `.filter(Boolean)` over the whole array: every blank line goes.
    description: parts.filter(Boolean).join('\n'),
    color: RECAP_EMBED_COLOR,
    image: { url: activityImageUrl(siteUrl, guildId, dateKey) },
    footer: { text: 'Lights Out · Daily Puzzle' },
    timestamp: now.toISOString(),
  };
}
