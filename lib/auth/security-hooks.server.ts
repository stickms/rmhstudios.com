/**
 * Where Better Auth's events reach the security log (`security-log.server.ts`).
 *
 * `lib/auth.ts` keeps one line per hook and delegates here:
 *
 *  - `trackSignIn` — `databaseHooks.session.create.after`. Records `sign_in`, or `sign_in_new_device`
 *    when the new-device alert fired. Returns at once; the work runs on its own.
 *  - `captureSecurityActor` (`hooks.before`) and `recordSecurityAfter` (`hooks.after`) — the endpoints
 *    that change a session, a passkey, the password or the email. The `before` half resolves who is
 *    acting and which session is being ended, because sign-out and revoke delete that session before
 *    any `after` hook can look it up; the `after` half records only when the endpoint succeeded.
 *
 * Better Auth paths (verified against `node_modules/better-auth` and `@better-auth/passkey`):
 * `/sign-out`, `/revoke-session`, `/revoke-sessions`, `/revoke-other-sessions`, `/change-password`,
 * `/change-email`, `/passkey/verify-registration`, `/passkey/delete-passkey`, and `/reset-password`
 * (the forgotten-password form, which has no session: its actor is the account the reset token names).
 */

import type { createAuthMiddleware } from 'better-auth/api';
import {
  recordSecurityEvent,
  type RecordSecurityEventInput,
} from '@/lib/auth/security-log.server';
import type { SecurityEventKind } from '@/lib/auth/security-log';

type AuthHookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/** Endpoint path → the event it records on success. */
export const AUTH_PATH_EVENTS: Readonly<Record<string, SecurityEventKind>> = {
  '/sign-out': 'sign_out',
  '/revoke-session': 'session_revoked',
  '/revoke-sessions': 'other_sessions_revoked',
  '/revoke-other-sessions': 'other_sessions_revoked',
  '/change-password': 'password_changed',
  '/reset-password': 'password_changed',
  '/change-email': 'email_changed',
  '/passkey/verify-registration': 'passkey_added',
  '/passkey/delete-passkey': 'passkey_removed',
};

interface Actor {
  userId: string;
  /** The session the change is made from; `null` for a password reset, which is made signed out. */
  sessionId: string | null;
  /** `/revoke-session` only: the session being ended, and its own device label. */
  revokedSessionId?: string;
  revokedDevice?: string | null;
}

/**
 * Who made the request, keyed by the request object, which is the one thing both halves of a hook
 * share. A WeakMap entry goes away with its request.
 */
const actors = new WeakMap<Request, Actor | null>();

/** `hooks.before`: remember the acting session for the paths that are recorded. Never throws. */
export async function captureSecurityActor(ctx: AuthHookContext): Promise<void> {
  try {
    if (!ctx.request || !(ctx.path in AUTH_PATH_EVENTS)) return;
    if (ctx.path === '/reset-password') {
      // Signed out by design: the account is the one the reset token was issued for. Read here,
      // because the endpoint deletes the token before any `after` hook runs.
      const body = ctx.body as { token?: unknown } | undefined;
      const query = ctx.query as { token?: unknown } | undefined;
      const resetToken =
        typeof body?.token === 'string' ? body.token : typeof query?.token === 'string' ? query.token : null;
      const verification = resetToken
        ? await ctx.context.internalAdapter.findVerificationValue(`reset-password:${resetToken}`)
        : null;
      actors.set(
        ctx.request,
        verification && verification.expiresAt > new Date() ? { userId: verification.value, sessionId: null } : null,
      );
      return;
    }
    const token = await ctx.getSignedCookie(
      ctx.context.authCookies.sessionToken.name,
      ctx.context.secret,
    );
    const found = token ? await ctx.context.internalAdapter.findSession(token) : null;
    if (!found) {
      actors.set(ctx.request, null);
      return;
    }
    const actor: Actor = { userId: found.user.id, sessionId: found.session.id };
    if (ctx.path === '/revoke-session') {
      const body = ctx.body as { token?: unknown } | undefined;
      const target =
        typeof body?.token === 'string'
          ? await ctx.context.internalAdapter.findSession(body.token)
          : null;
      if (target && target.session.userId === found.user.id) {
        actor.revokedSessionId = target.session.id;
        actor.revokedDevice = (target.session as { deviceFp?: string | null }).deviceFp ?? null;
      }
    }
    actors.set(ctx.request, actor);
  } catch (err) {
    console.error('[security-log] could not resolve the acting session:', err);
  }
}

/** `hooks.after`: record the event if the endpoint succeeded. Never throws, never awaited by callers. */
export async function recordSecurityAfter(ctx: AuthHookContext): Promise<void> {
  try {
    const kind = AUTH_PATH_EVENTS[ctx.path];
    if (!kind || !ctx.request) return;
    const actor = actors.get(ctx.request);
    actors.delete(ctx.request);
    if (!actor) return;
    // A failed endpoint leaves an error in `returned` (wrong password, someone else's passkey, …).
    if ((ctx.context as { returned?: unknown }).returned instanceof Error) return;

    const input: RecordSecurityEventInput = {
      userId: actor.userId,
      kind,
      request: ctx.request,
      sessionId: actor.sessionId,
    };
    if (ctx.path === '/revoke-session') {
      // `/revoke-session` of a token that is not the caller's does nothing, so it records nothing.
      if (!actor.revokedSessionId) return;
      input.sessionId = actor.revokedSessionId;
      input.device = actor.revokedDevice ?? null;
    }
    void recordSecurityEvent(input);
  } catch (err) {
    console.error('[security-log] after-hook failed:', err);
  }
}

/**
 * `databaseHooks.session.create.after`. Runs the new-device alert (B11) and then records the
 * sign-in as `sign_in_new_device` when that alert was sent, `sign_in` otherwise. Neither the alert nor
 * the record may sit in front of the sign-in response, so this returns immediately and the chain
 * swallows its own errors.
 */
export function trackSignIn(session: { id: string; userId: string }, request: Request): void {
  const record = (kind: SecurityEventKind) =>
    recordSecurityEvent({ userId: session.userId, kind, request, sessionId: session.id });
  void import('@/lib/auth/session-alert.server')
    .then((m) => m.onSessionCreated(session, request))
    .then((result) => record(result.alerted ? 'sign_in_new_device' : 'sign_in'))
    .catch((err) => {
      console.error('[auth] session alert failed:', err);
      return record('sign_in');
    });
}
