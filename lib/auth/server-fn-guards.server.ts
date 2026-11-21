/**
 * In-handler guards for `createServerFn`.
 *
 * A server function is its own HTTP endpoint. A route's `beforeLoad` (for example the admin layout's
 * `checkAdminAuth`) only runs on navigation, so it does not stand in front of a direct call to the function.
 * Anything a server function returns or writes that is not public has to be checked inside its handler, and
 * these two helpers are the one way to say so (`lib/__tests__/server-fn-guard-ratchet.test.ts` enforces it for
 * the admin area).
 *
 * The refusal is the router's 404, the same answer an admin-only page gives a stranger, so a probe cannot tell
 * "exists but not yours" from "does not exist".
 */
import { notFound } from '@tanstack/react-router';
import { getRequestSession } from '@/lib/auth-session.server';

type Session = NonNullable<Awaited<ReturnType<typeof getRequestSession>>>;

/** Whether this request's session belongs to an admin. Never true for an anonymous request. */
export async function isAdminRequest(): Promise<boolean> {
  const session = await getRequestSession();
  return (session?.user as { isAdmin?: boolean } | undefined)?.isAdmin === true;
}

/** The signed-in session of this request, or the 404. The user id to act on is `session.user.id`, never input. */
export async function requireSessionServerFn(): Promise<Session> {
  const session = await getRequestSession();
  if (!session?.user) throw notFound();
  return session;
}

/** The admin session of this request, or the 404. */
export async function requireAdminServerFn(): Promise<Session> {
  const session = await requireSessionServerFn();
  if ((session.user as { isAdmin?: boolean }).isAdmin !== true) throw notFound();
  return session;
}
