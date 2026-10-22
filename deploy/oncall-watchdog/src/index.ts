// rmh on-call watchdog — a Cloudflare Worker that lives OFF the VPS.
//
//   cron (every minute)   → probe the public site, check VPS heartbeats, re-page unacked alarms
//   POST /interactions    → Discord button clicks (Ack / Escalate), Ed25519-verified
//   POST /v1/alert        → alarms raised by the VPS (status service, deploy.sh, backups)
//   POST /v1/heartbeat/:n → VPS check-ins; silence is the alarm
//   GET  /v1/alarms       → current alarm records (debugging; feeds the alarms dashboard)
//
// /v1/* requests are HMAC-signed by the VPS with a timestamp + one-time nonce
// (signing.ts); the nonce is claimed inside the Durable Object so a captured
// request can't be replayed. All state lives in that one Durable Object, so
// clicks, alerts and cron ticks are serialised. See README.md for setup.

import {
  alertMessage,
  discordNotifier,
  ephemeral,
  InteractionType,
  ResponseType,
  verifyDiscordSignature,
  type MessageContext,
} from './discord';
import { Engine, validateInput, type AlarmRecord } from './engine';
import type { DurableObjectStateLike, Env, ExecutionContextLike } from './env';
import { HEARTBEATS, checkHeartbeats, recordHeartbeat, runProbes } from './probes';
import { SIGNATURE_WINDOW_SECONDS, verifySignature } from './signing';

const MAX_BODY_BYTES = 64 * 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function readBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return null;
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_BODY_BYTES) return null;
  return new TextDecoder().decode(buf);
}

function stub(env: Env) {
  return env.ONCALL_STATE.get(env.ONCALL_STATE.idFromName('oncall'));
}

function toDO(env: Env, path: string, body?: unknown): Promise<Response> {
  return stub(env).fetch(`https://oncall-state${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

interface ComponentInteraction {
  type: number;
  channel_id?: string;
  member?: { user?: { id?: string }; roles?: string[] };
  data?: { custom_id?: string };
}

async function handleInteraction(request: Request, env: Env): Promise<Response> {
  const raw = await readBody(request);
  if (raw === null) return new Response('payload too large', { status: 413 });
  const ok = await verifyDiscordSignature(
    env.DISCORD_PUBLIC_KEY,
    request.headers.get('x-signature-ed25519'),
    request.headers.get('x-signature-timestamp'),
    raw,
  );
  if (!ok) return new Response('invalid request signature', { status: 401 });

  const ix = JSON.parse(raw) as ComponentInteraction;
  if (ix.type === InteractionType.PING) return json({ type: ResponseType.PONG });
  if (ix.type !== InteractionType.MESSAGE_COMPONENT) return json(ephemeral('Unsupported interaction.'));

  // Authorization: only the on-call role, only in the on-call channel.
  if (ix.channel_id !== env.ONCALL_CHANNEL_ID) return json(ephemeral('These buttons only work in the on-call channel.'));
  const userId = ix.member?.user?.id;
  if (!userId || !ix.member?.roles?.includes(env.ONCALL_ROLE_ID)) {
    return json(ephemeral(`Only members of <@&${env.ONCALL_ROLE_ID}> can do that.`));
  }
  const [action, key] = (ix.data?.custom_id ?? '').split('|');
  if ((action !== 'ack' && action !== 'esc') || !key) return json(ephemeral('Unknown button.'));

  const res = await toDO(env, `/${action}`, { key, userId });
  return json(await res.json());
}

async function handleV1(request: Request, env: Env, url: URL): Promise<Response> {
  const raw = await readBody(request);
  if (raw === null) return json({ error: 'payload too large' }, 413);
  const gate = await verifySignature(request, url.pathname, raw, env.ONCALL_SIGNING_SECRET);
  if (!gate.ok) return json({ error: gate.reason }, gate.status);
  const nonce = gate.nonce;

  if (request.method === 'GET' && url.pathname === '/v1/alarms') return toDO(env, '/list', { nonce });
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const hb = /^\/v1\/heartbeat\/([a-z0-9-]{1,40})$/.exec(url.pathname);
  if (hb) return toDO(env, '/heartbeat', { nonce, name: hb[1] });

  if (url.pathname === '/v1/alert') {
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: 'invalid JSON' }, 400);
    }
    const state = (body as { state?: unknown })?.state;
    if (state !== 'firing' && state !== 'resolved') return json({ error: 'state must be "firing" or "resolved"' }, 400);
    const input = validateInput(body);
    if (typeof input === 'string') return json({ error: input }, 400);
    return toDO(env, '/alert', { nonce, state, input });
  }
  return json({ error: 'not found' }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/interactions' && request.method === 'POST') return await handleInteraction(request, env);
      if (url.pathname.startsWith('/v1/')) return await handleV1(request, env, url);
      return new Response('not found', { status: 404 });
    } catch (err) {
      console.error(`oncall: unhandled ${String(err)}`);
      return new Response('internal error', { status: 500 });
    }
  },

  async scheduled(_controller: unknown, env: Env, ctx: ExecutionContextLike): Promise<void> {
    ctx.waitUntil(toDO(env, '/tick'));
  },
};

/** The one Durable Object: every alarm, counter and heartbeat. */
export class OncallState {
  private readonly engine: Engine;
  private readonly msgCtx: MessageContext;

  constructor(
    private readonly state: DurableObjectStateLike,
    private readonly env: Env,
  ) {
    this.msgCtx = { roleId: env.ONCALL_ROLE_ID, escalationRoleId: env.ESCALATION_ROLE_ID, runbookBase: env.RUNBOOK_BASE };
    this.engine = new Engine(
      state.storage,
      discordNotifier({ botToken: env.DISCORD_BOT_TOKEN, channelId: env.ONCALL_CHANNEL_ID, fallbackWebhookUrl: env.ONCALL_WEBHOOK_URL }),
      this.msgCtx,
    );
  }

  /** Check-and-set: true the first time a nonce is seen. Atomic because the DO is single-threaded. */
  private async claimNonce(nonce: unknown, now: number): Promise<boolean> {
    if (typeof nonce !== 'string' || !nonce) return false;
    const key = `nonce:${nonce}`;
    if ((await this.state.storage.get<number>(key)) !== undefined) return false;
    await this.state.storage.put(key, now);
    return true;
  }

  /** Nonces only need remembering while their timestamp could still pass the freshness check. */
  private async pruneNonces(now: number): Promise<void> {
    const keepMs = 2 * SIGNATURE_WINDOW_SECONDS * 1000;
    for (const [key, seenAt] of await this.state.storage.list<number>({ prefix: 'nonce:' })) {
      if (now - seenAt > keepMs) await this.state.storage.delete(key);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const now = Date.now();

    // Every /v1 call carries a signed nonce; accept each one exactly once.
    if ((path === '/alert' || path === '/heartbeat' || path === '/list') && !(await this.claimNonce(body.nonce, now))) {
      return json({ error: 'replayed request' }, 401);
    }

    switch (path) {
      case '/tick': {
        // Each step is independent: a failing probe must not stop re-paging.
        const steps = [
          () => runProbes(this.engine, this.state.storage, this.env, fetch, now),
          () => checkHeartbeats(this.state.storage, this.engine, now),
          () => this.engine.tick(now),
          () => this.pruneNonces(now),
        ];
        for (const step of steps) await step().catch((err) => console.error(`oncall: tick step failed ${String(err)}`));
        return json({ ok: true });
      }
      case '/alert': {
        const input = body.input as Parameters<Engine['fire']>[0];
        if (body.state === 'resolved') {
          const key = input.instance ? `${input.id}:${input.instance}` : input.id;
          const rec = await this.engine.resolve(key, now, input.detail);
          return json({ ok: true, alarm: rec ?? null });
        }
        return json({ ok: true, alarm: await this.engine.fire(input, now) });
      }
      case '/heartbeat': {
        const known = await recordHeartbeat(this.state.storage, this.engine, String(body.name), now);
        return known ? json({ ok: true }) : json({ error: 'unknown heartbeat' }, 404);
      }
      case '/list': {
        // Heartbeats alongside the alarms, for the admin dashboard: when each
        // sender last checked in, and how long silence may last before it pages.
        const heartbeats = await Promise.all(
          Object.entries(HEARTBEATS).map(async ([name, def]) => ({
            name,
            maxAgeMs: def.maxAgeMs,
            lastSeen: (await this.state.storage.get<number>(`hb:${name}`)) ?? null,
          })),
        );
        return json({ now, alarms: await this.engine.list(), heartbeats });
      }
      case '/ack':
      case '/esc': {
        const key = String(body.key);
        const userId = String(body.userId);
        const result =
          path === '/ack' ? await this.engine.ack(key, userId, now) : await this.engine.escalate(key, userId, now);
        if (typeof result === 'string') return json(ephemeral(result));
        if (path === '/esc') await this.engine.announceEscalation(result as AlarmRecord);
        return json({ type: ResponseType.UPDATE_MESSAGE, data: alertMessage(result, this.msgCtx) });
      }
      default:
        return json({ error: 'not found' }, 404);
    }
  }
}
