/**
 * Posting to the table's Discord channel.
 *
 * **The URL is a credential.** A Discord incoming webhook needs no auth beyond
 * knowing it — anyone holding the string can post to that channel as often as
 * they like. Three consequences run through this module:
 *
 * 1. It never leaves the server intact. {@link maskWebhookUrl} is what the API
 *    returns, so the settings UI can show "there is one, ending 1234" without
 *    handing the secret to every reader of an unlisted page.
 * 2. The host is validated on WRITE, against Discord's own domains, before it
 *    is ever stored. A settings field that accepts any URL and is later fetched
 *    by a server is an SSRF primitive; restricting the host at the door is a
 *    stronger guarantee than filtering the address at fetch time, because it
 *    cannot be defeated by DNS that resolves differently on the second lookup.
 * 3. It is never logged. Failures log the status and the id, never the URL.
 *
 * Deliberately NOT routed through `lib/ssrf-guard.server`'s `safeFetch`: that
 * exists for genuinely arbitrary user-supplied URLs, where the best available
 * defence is blocking private address ranges. Here the set of legitimate hosts
 * is four names long, so an allowlist is both stricter and simpler.
 */

import { CAMPAIGN_TIME_ZONE, REFERENCE_TIME_ZONE, zoneAbbreviation } from './zoned-time';

/**
 * The only hosts a webhook may point at.
 *
 * `discordapp.com` is the legacy domain and still issued in the wild;
 * `ptb`/`canary` are Discord's own release channels. Anything else — including
 * a look-alike like `discord.com.evil.test` — fails, because the comparison is
 * on the parsed `hostname`, not a substring of the string.
 */
const ALLOWED_HOSTS = new Set([
  'discord.com',
  'discordapp.com',
  'ptb.discord.com',
  'canary.discord.com',
]);

export interface WebhookValidation {
  ok: boolean;
  /** The normalised URL to store. Only set when `ok`. */
  url?: string;
  /** A message safe to show the user. Only set when not `ok`. */
  error?: string;
}

/**
 * Validate and normalise a webhook URL.
 *
 * Returns a result rather than throwing so the settings route can answer 400
 * with a sentence the user can act on — "that is not a Discord webhook URL" is
 * a far better error than a generic rejection when someone has pasted a channel
 * link by mistake, which is the common case.
 */
export function validateWebhookUrl(raw: string): WebhookValidation {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'Paste a Discord webhook URL.' };
  if (trimmed.length > 500) return { ok: false, error: 'That URL is too long to be a webhook.' };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'That is not a valid URL.' };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'The webhook URL must start with https://.' };
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return { ok: false, error: 'That is not a Discord URL. It should be on discord.com.' };
  }
  // `/api/webhooks/<id>/<token>`, optionally with a version segment.
  if (!/^\/api\/(v\d+\/)?webhooks\/\d+\/[\w-]+\/?$/.test(parsed.pathname)) {
    return {
      ok: false,
      error:
        'That looks like a Discord link but not a webhook. In Discord: ' +
        'Channel Settings → Integrations → Webhooks → Copy Webhook URL.',
    };
  }

  // Drop query and fragment: `?wait=true` and friends change the response shape
  // and nothing here wants them. Storing the bare URL keeps the send predictable.
  return { ok: true, url: `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}` };
}

/**
 * What the client is allowed to see: enough to recognise which webhook is
 * configured, not enough to post with it.
 */
export function maskWebhookUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const token = parts[parts.length - 1] ?? '';
    const id = parts[parts.length - 2] ?? '';
    // The id is not secret (it is in the channel's integration settings); the
    // token is. Show the id and the last four of the token, nothing more.
    return `${parsed.hostname}/…/${id}/…${token.slice(-4)}`;
  } catch {
    return 'a webhook';
  }
}

/* -------------------------------------------------------------------------- */
/* Sending                                                                    */
/* -------------------------------------------------------------------------- */

export interface ReminderSession {
  id: string;
  title: string;
  notes: string;
  location: string;
  startsAt: Date;
  endsAt: Date;
  responses: Array<{ status: string; name: string; note: string | null }>;
}

/** `8:00 PM` in a zone. */
function clock(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(instant);
}

/** `Wednesday, August 12` in the campaign zone. */
function longDate(instant: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CAMPAIGN_TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(instant);
}

/**
 * Discord renders `<t:UNIX:t>` in **each reader's own timezone**, which is
 * strictly better than any string we could compose: the players are spread
 * across zones and this is the one place the platform will do the conversion
 * per-person. The written-out Eastern/Central line stays underneath it as the
 * shared reference the group actually quotes at each other.
 */
function discordTimestamp(instant: Date, style: 't' | 'F' | 'R'): string {
  return `<t:${Math.floor(instant.getTime() / 1000)}:${style}>`;
}

/** Build the embed for one session's reminder. */
export function buildReminderPayload(session: ReminderSession, boardUrl: string): unknown {
  const going = session.responses.filter((r) => r.status === 'GOING');
  const maybe = session.responses.filter((r) => r.status === 'TENTATIVE');
  const out = session.responses.filter((r) => r.status === 'UNAVAILABLE');

  const nameList = (list: typeof going) => (list.length ? list.map((r) => r.name).join(', ') : '—');

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    {
      name: 'When',
      value:
        `${discordTimestamp(session.startsAt, 'F')} (${discordTimestamp(session.startsAt, 'R')})\n` +
        `${clock(session.startsAt, CAMPAIGN_TIME_ZONE)} Eastern · ` +
        `${clock(session.startsAt, REFERENCE_TIME_ZONE)} ` +
        `${zoneAbbreviation(session.startsAt, REFERENCE_TIME_ZONE)}`,
    },
  ];

  if (session.location) fields.push({ name: 'Where', value: session.location.slice(0, 1024) });

  fields.push(
    { name: `In (${going.length})`, value: nameList(going).slice(0, 1024), inline: true },
    { name: `Maybe (${maybe.length})`, value: nameList(maybe).slice(0, 1024), inline: true },
    { name: `Out (${out.length})`, value: nameList(out).slice(0, 1024), inline: true },
  );

  // Anyone who has not answered is the actual point of a morning reminder, so
  // the call to action names the board rather than assuming everyone replied.
  if (!session.responses.length) {
    fields.push({ name: 'Replies', value: 'Nobody has answered yet.' });
  }

  return {
    // `allowed_mentions: {parse: []}` is not decoration: session titles and
    // notes are user-authored, and without it a note containing `@everyone`
    // would ping the whole server from a scheduled job nobody is watching.
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `Tonight: ${session.title}`.slice(0, 256),
        description: session.notes ? session.notes.slice(0, 2000) : undefined,
        url: boardUrl,
        color: 0x1d1d1f,
        fields,
        footer: { text: longDate(session.startsAt) },
      },
    ],
  };
}

export interface SendResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/**
 * POST a payload to the webhook.
 *
 * Never throws: the caller is a cron sweep over several sessions, and one
 * channel being deleted must not stop the rest of the run. Errors come back as
 * data, with the status but never the URL.
 */
export async function postToWebhook(webhookUrl: string, payload: unknown): Promise<SendResult> {
  // Re-validated at send time, not just at write time. The stored value went
  // through `validateWebhookUrl`, but this is the function that makes an
  // outbound request with a database-supplied URL, and it should be safe on its
  // own terms rather than on the strength of a check somewhere upstream.
  const check = validateWebhookUrl(webhookUrl);
  if (!check.ok || !check.url) return { ok: false, error: 'Stored webhook URL is not valid.' };

  try {
    const response = await fetch(check.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // Discord is normally sub-second; a hung connection must not pin the
      // worker, and `AbortSignal.timeout` beats a manual controller here.
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error:
          response.status === 404
            ? 'Discord says that webhook no longer exists — it may have been deleted.'
            : response.status === 429
              ? 'Discord is rate-limiting us. Try again shortly.'
              : `Discord rejected the message (HTTP ${response.status}).`,
      };
    }
    return { ok: true, status: response.status };
  } catch (cause) {
    const aborted = (cause as Error)?.name === 'TimeoutError';
    return {
      ok: false,
      error: aborted ? 'Discord did not respond in time.' : 'Could not reach Discord.',
    };
  }
}
