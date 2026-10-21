// Client for the on-call watchdog (deploy/oncall-watchdog), from Node.
//
// Signs every request exactly as the Worker verifies it (its src/signing.ts),
// the same scheme as go-services/pkg/oncall and deploy/oncall-send.sh:
//
//   X-Oncall-Signature: v1=hex(HMAC-SHA256(secret, "v1:<ts>:<nonce>:<METHOD>:<path>:<body>"))
//
// The scheme is duplicated here rather than imported because server bundles may
// only reach server/ and lib/ (server/CLAUDE.md gotcha 8); the shared test vector
// in __tests__ keeps the copies honest.
//
// Unconfigured (ONCALL_URL / ONCALL_SIGNING_SECRET unset, or a short secret)
// → `oncallClient()` is null and nothing is sent. Pure Node, no `@/` imports.

import { createHmac, randomBytes } from 'node:crypto';

export const MIN_SECRET_LENGTH = 32;
const TIMEOUT_MS = 10_000;

export interface OncallAlert {
  state: 'firing' | 'resolved';
  id: string;
  instance?: string;
  /** 2–5. Sev1 is a human decision (the Escalate button); the watchdog rejects it. */
  sev: number;
  title: string;
  detail?: string;
  runbook?: string;
  source: string;
}

export function signOncall(secret: string, ts: string, nonce: string, method: string, path: string, body: string): string {
  const mac = createHmac('sha256', secret).update(`v1:${ts}:${nonce}:${method.toUpperCase()}:${path}:${body}`);
  return `v1=${mac.digest('hex')}`;
}

export interface OncallClient {
  heartbeat(name: string): Promise<void>;
  send(alert: OncallAlert): Promise<void>;
}

export function oncallClient(
  env: { ONCALL_URL?: string; ONCALL_SIGNING_SECRET?: string } = process.env,
  fetchImpl: typeof fetch = fetch,
): OncallClient | null {
  const base = (env.ONCALL_URL ?? '').trim().replace(/\/+$/, '');
  const secret = env.ONCALL_SIGNING_SECRET ?? '';
  if (!/^https?:\/\//.test(base) || secret.length < MIN_SECRET_LENGTH) return null;

  async function post(path: string, body: string): Promise<void> {
    let last: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      // Re-signed per attempt: if a first try reached the Worker but its response
      // was lost, that nonce is already spent.
      const ts = String(Math.floor(Date.now() / 1000));
      const nonce = randomBytes(16).toString('hex');
      try {
        const res = await fetchImpl(`${base}${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'user-agent': 'rmh-oncall-client/1',
            'x-oncall-timestamp': ts,
            'x-oncall-nonce': nonce,
            'x-oncall-signature': signOncall(secret, ts, nonce, 'POST', path, body),
          },
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.ok) return;
        last = new Error(`oncall ${path}: HTTP ${res.status}`);
        if (res.status < 500) break; // a 4xx won't fix itself on retry
      } catch (err) {
        last = err;
      }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
    }
    throw last instanceof Error ? last : new Error(String(last));
  }

  return {
    heartbeat: (name) => post(`/v1/heartbeat/${name}`, ''),
    send: (alert) => post('/v1/alert', JSON.stringify(alert)),
  };
}
