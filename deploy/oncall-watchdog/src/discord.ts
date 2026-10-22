// Discord: interaction signature check, the alert message shape, and a REST client.

import type { AlarmRecord } from './engine';

/* ─── Interaction signature (Ed25519) ───────────────────────────────────────
 *
 * Discord signs every interaction POST with the application's key: the message
 * is `timestamp + rawBody`. An unsigned or mis-signed request must get a 401 —
 * Discord itself probes the endpoint with a bad signature and refuses to save it
 * if that isn't rejected.
 */

const MAX_SKEW_SECONDS = 5 * 60;

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string | null,
  timestamp: string | null,
  rawBody: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!publicKeyHex || !signatureHex || !timestamp) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > MAX_SKEW_SECONDS) return false;
  const key = hexToBytes(publicKeyHex);
  const sig = hexToBytes(signatureHex);
  if (!key || key.length !== 32 || !sig || sig.length !== 64) return false;
  try {
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', cryptoKey, sig, new TextEncoder().encode(timestamp + rawBody));
  } catch {
    return false;
  }
}

/* ─── Message shape ─────────────────────────────────────────────────────── */

export const InteractionType = { PING: 1, MESSAGE_COMPONENT: 3 } as const;
export const ResponseType = { PONG: 1, CHANNEL_MESSAGE: 4, UPDATE_MESSAGE: 7 } as const;
const EPHEMERAL = 64;

const ButtonStyle = { SUCCESS: 3, DANGER: 4, LINK: 5 } as const;

export interface DiscordMessage {
  content?: string;
  embeds?: unknown[];
  components?: unknown[];
  allowed_mentions: { parse: string[]; roles?: string[] };
  message_reference?: { message_id: string; fail_if_not_exists: false };
}

/** Sev1 and Sev2 page (mention @oncall and re-page until acked); Sev3–5 only post. */
export const pages = (sev: number): boolean => sev <= 2;

const SEV_COLOR: Record<number, number> = { 1: 0x8b0000, 2: 0xe03131, 3: 0xf08c00, 4: 0xfab005, 5: 0x868e96 };
const RESOLVED_COLOR = 0x2f9e44;
const ACKED_COLOR = 0x1c7ed6;

const unix = (ms: number) => Math.floor(ms / 1000);

export interface MessageContext {
  roleId: string;
  escalationRoleId?: string;
  runbookBase: string;
}

export function runbookUrl(rec: AlarmRecord, ctx: MessageContext): string | null {
  if (rec.runbook && /^https:\/\//.test(rec.runbook)) return rec.runbook;
  const name = rec.runbook ?? rec.id;
  if (!ctx.runbookBase || !/^[A-Za-z0-9._/-]+$/.test(name)) return null;
  return `${ctx.runbookBase.replace(/\/$/, '')}/${name.replace(/\.md$/, '')}.md`;
}

function statusLine(rec: AlarmRecord): string {
  if (rec.state === 'resolved') return `✅ Resolved <t:${unix(rec.resolvedAt ?? rec.updatedAt)}:R>`;
  if (rec.acked) return `👀 Acked by <@${rec.acked.by}> <t:${unix(rec.acked.at)}:R>`;
  return pages(rec.sev) ? '🚨 Firing — **not acknowledged**' : '⚠️ Firing';
}

/** The alert itself: the message every later edit rewrites in place. */
export function alertMessage(rec: AlarmRecord, ctx: MessageContext): DiscordMessage {
  const paging = pages(rec.sev) && rec.state === 'firing' && !rec.acked;
  const color = rec.state === 'resolved' ? RESOLVED_COLOR : rec.acked ? ACKED_COLOR : (SEV_COLOR[rec.sev] ?? SEV_COLOR[3]);
  const url = runbookUrl(rec, ctx);

  const buttons: unknown[] = [];
  if (rec.state === 'firing' && pages(rec.sev)) {
    buttons.push({
      type: 2,
      style: ButtonStyle.SUCCESS,
      label: rec.acked ? 'Acknowledged' : 'Acknowledge',
      emoji: { name: '✅' },
      custom_id: `ack|${rec.key}`,
      disabled: Boolean(rec.acked),
    });
    if (rec.sev > 1) {
      buttons.push({ type: 2, style: ButtonStyle.DANGER, label: 'Escalate to Sev1', emoji: { name: '🔺' }, custom_id: `esc|${rec.key}` });
    }
  }
  if (url) buttons.push({ type: 2, style: ButtonStyle.LINK, label: 'Runbook', emoji: { name: '📖' }, url });

  return {
    content: `${paging ? `<@&${ctx.roleId}> ` : ''}**SEV${rec.sev}** · ${rec.title}`,
    embeds: [
      {
        title: `[SEV${rec.sev}] ${rec.id} · ${rec.title}`.slice(0, 256),
        description: (rec.detail || '—').slice(0, 4000),
        color,
        fields: [
          { name: 'Status', value: statusLine(rec), inline: false },
          { name: 'Since', value: `<t:${unix(rec.firedAt)}:f> (<t:${unix(rec.firedAt)}:R>)`, inline: true },
          { name: 'Source', value: rec.source.slice(0, 100) || '—', inline: true },
        ],
        footer: { text: `alarm ${rec.key}` },
      },
    ],
    components: buttons.length ? [{ type: 1, components: buttons }] : [],
    // Only the alert that is paging may ping, and only the on-call role.
    allowed_mentions: paging ? { parse: [], roles: [ctx.roleId] } : { parse: [] },
  };
}

/** A threaded reply under the alert (re-page, escalation, resolution). */
export function replyMessage(messageId: string | undefined, content: string, mentionRoles: string[] = []): DiscordMessage {
  return {
    content,
    allowed_mentions: { parse: [], roles: mentionRoles },
    ...(messageId ? { message_reference: { message_id: messageId, fail_if_not_exists: false as const } } : {}),
  };
}

export function ephemeral(content: string) {
  return { type: ResponseType.CHANNEL_MESSAGE, data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] } } };
}

/* ─── REST client ───────────────────────────────────────────────────────── */

export interface Notifier {
  /** Returns the posted message id, or null if only the fallback webhook (or nothing) worked. */
  post(msg: DiscordMessage): Promise<string | null>;
  edit(messageId: string, msg: DiscordMessage): Promise<void>;
}

const API = 'https://discord.com/api/v10';

export function discordNotifier(opts: {
  botToken?: string;
  channelId: string;
  fallbackWebhookUrl?: string;
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
}): Notifier {
  const f = opts.fetchImpl ?? fetch;
  const log = opts.log ?? ((m: string) => console.error(m));

  async function viaWebhook(msg: DiscordMessage): Promise<null> {
    if (!opts.fallbackWebhookUrl) return null;
    // Plain webhooks can't carry interactive buttons; keep only the text + embed.
    const body = { content: msg.content, embeds: msg.embeds, allowed_mentions: msg.allowed_mentions };
    const res = await f(opts.fallbackWebhookUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) log(`oncall: fallback webhook failed ${res.status}`);
    return null;
  }

  return {
    async post(msg) {
      if (opts.botToken) {
        try {
          const res = await f(`${API}/channels/${opts.channelId}/messages`, {
            method: 'POST',
            headers: { authorization: `Bot ${opts.botToken}`, 'content-type': 'application/json' },
            body: JSON.stringify(msg),
          });
          if (res.ok) return ((await res.json()) as { id: string }).id;
          log(`oncall: bot post failed ${res.status} ${(await res.text()).slice(0, 200)}`);
        } catch (err) {
          log(`oncall: bot post threw ${String(err)}`);
        }
      }
      return viaWebhook(msg);
    },
    async edit(messageId, msg) {
      if (!opts.botToken) return;
      const { message_reference: _ignored, ...body } = msg;
      const res = await f(`${API}/channels/${opts.channelId}/messages/${messageId}`, {
        method: 'PATCH',
        headers: { authorization: `Bot ${opts.botToken}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) log(`oncall: edit failed ${res.status}`);
    },
  };
}
