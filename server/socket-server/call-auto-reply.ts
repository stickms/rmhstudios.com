/**
 * Asks the web tier to send a callee's automatic "can't take your call" DM.
 *
 * The hub only knows a call could not ring; writing and delivering the message
 * (AI writer, conversation, live push to the caller's open tabs) lives in the web
 * tier, behind `POST /api/internal/call-auto-reply`. Fire-and-forget: the call
 * flow has already moved on, and a missing reply must never delay or fail it.
 *
 * Same bridge the Go workers use for live DMs — `INTERNAL_API_SECRET` as a shared
 * secret and `INTERNAL_API_URL` (else the origin of `BETTER_AUTH_URL`, else the
 * local web port) as the target. With no secret configured the feature is simply
 * off: callers get the ordinary "busy" / "not available", exactly as before.
 *
 * Relative imports into lib/ only (server/CLAUDE.md gotcha 7).
 */

import { logger } from './logger';
import type { AutoReplyTrigger } from '../../lib/call/answer';

const TIMEOUT_MS = 15_000;

function webBase(): string {
  const explicit = process.env.INTERNAL_API_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  try {
    if (process.env.BETTER_AUTH_URL) return new URL(process.env.BETTER_AUTH_URL).origin;
  } catch {
    // fall through to the local default
  }
  return 'http://127.0.0.1:7005';
}

export function requestCallAutoReply(input: {
  callerId: string;
  calleeId: string;
  trigger: AutoReplyTrigger;
}): void {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return;

  void fetch(`${webBase()}/api/internal/call-auto-reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': secret },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
    .then((res) => {
      if (!res.ok) logger.warn({ event: 'call_auto_reply_http', status: res.status });
    })
    .catch((err: unknown) =>
      logger.warn({ event: 'call_auto_reply_failed', error: String(err) }),
    );
}
