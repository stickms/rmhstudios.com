/**
 * Optional relay of election events into a Discord channel. Server-only.
 *
 * Set `ELECTIONS_DISCORD_WEBHOOK` to a Discord webhook URL and calls, flips, control changes and polls
 * closing are posted as they happen, batched so a burst of calls is one message. Unset (the default) it does
 * nothing. The URL is operator configuration, never user input, and is only used if it points at Discord.
 */

import type { ElectionEvent } from './events';

const HOSTS = new Set(['discord.com', 'discordapp.com', 'canary.discord.com', 'ptb.discord.com']);
const BATCH_MS = 5_000;
const MAX_LINES = 10;
const TIMEOUT_MS = 8_000;

export function webhookUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && HOSTS.has(u.hostname) && u.pathname.startsWith('/api/webhooks/') ? u.toString() : null;
  } catch {
    return null;
  }
}

const EMOJI: Partial<Record<ElectionEvent['kind'], string>> = {
  call: '✅',
  flip: '🔄',
  clinch: '🏛️',
  'polls-closed': '🗳️',
  'lead-change': '↔️',
};

/** Events worth a Discord line: everything but headlines and low-importance noise. */
export const relayable = (ev: ElectionEvent): boolean => ev.kind !== 'news' && (ev.importance >= 2 || ev.kind === 'clinch');

/** The message text for a batch (Discord caps content at 2000 characters). */
export function formatBatch(events: ElectionEvent[]): string {
  const lines = events.slice(0, MAX_LINES).map((e) => `${EMOJI[e.kind] ?? '•'} ${e.text}`);
  const more = events.length - lines.length;
  const text = [...lines, ...(more > 0 ? [`…and ${more} more`] : []), '<https://rmhstudios.com/elections>'].join('\n');
  return text.length > 1900 ? `${text.slice(0, 1897)}…` : text;
}

const sent = new Set<string>();
let queue: ElectionEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush(): Promise<void> {
  timer = null;
  const url = webhookUrl(process.env.ELECTIONS_DISCORD_WEBHOOK);
  const batch = queue;
  queue = [];
  if (!url || !batch.length) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: formatBatch(batch), allowed_mentions: { parse: [] }, username: 'RMH Vote' }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.warn('[elections] discord relay failed:', String(err));
  }
}

/** Queue events for the relay; a no-op unless a webhook is configured. Never throws. */
export function relayToDiscord(events: ElectionEvent[]): void {
  if (!webhookUrl(process.env.ELECTIONS_DISCORD_WEBHOOK)) return;
  const fresh: ElectionEvent[] = [];
  for (const e of events) {
    if (!relayable(e) || sent.has(e.id)) continue;
    sent.add(e.id);
    fresh.push(e);
  }
  if (sent.size > 2000) sent.clear();
  if (!fresh.length) return;
  queue.push(...fresh);
  timer ??= setTimeout(() => void flush(), BATCH_MS);
}

/** Test seam. */
export function __resetDiscordRelay() {
  queue = [];
  sent.clear();
  if (timer) clearTimeout(timer);
  timer = null;
}
