/**
 * A member made without the sign-up endpoint.
 *
 * Sign-up is limited to 10 a minute per IP across the whole suite, and the global cast (alice, bob, carol) is shared by
 * every file, so state one file leaves on a cast member leaks into the next: the app caches a user's tier for 60 s
 * (`getUserTier`), the `ai` rate-limit buckets, the daily-cap rows and the in-flight lease are all keyed by user, and a
 * file that inserts a Subscription row straight into the database does not tell the app. A file whose cases depend on
 * that state makes its own members here instead, so nothing of theirs is warm when the file starts and nothing of the
 * file's is left for the next one.
 *
 * The row pair is what Better Auth's sign-up writes: a `user` and a credential `account` whose hash is copied from the
 * cast (every cast member shares `PASSWORD`). Its session is then written the way Better Auth writes one (a `session`
 * row and the signed `session_token` cookie, HMAC-SHA256 of the token with BETTER_AUTH_SECRET, as better-call signs it)
 * and proved through `/api/auth/get-session`, which is not rate-limited. That keeps fresh members out of the suite's
 * shared per-IP sign-in budget (10 a minute), which the auth tests need for their real sign-ins; four files make three
 * members each, and the files run back to back. Without the secret, or if the server does not accept the minted
 * session, the member signs in through the real endpoint instead, waiting out a 429.
 */
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { inject } from 'vitest';
import { Client, PASSWORD, db, uniqueEmail, type TestUser } from './client';

export type FreshMember = TestUser & { client: Client };

export interface FreshMemberOptions {
  isAdmin?: boolean;
  /** Back-date the account (sharing needs one at least 7 days old). */
  createdAt?: Date;
}

async function passwordHash(): Promise<string> {
  const { rows } = await db().query(
    `select password from account where "userId" = $1 and "providerId" = 'credential'`,
    [inject('alice').id],
  );
  const hash = rows[0]?.password as string | undefined;
  if (!hash) throw new Error('the cast has no credential account to copy a password hash from');
  return hash;
}

async function signIn(client: Client, email: string): Promise<void> {
  const deadline = Date.now() + 130_000;
  for (;;) {
    const res = await client.post('/api/auth/sign-in/email', { email, password: PASSWORD });
    if (res.status === 200 && client.hasSession) return;
    if (res.status !== 429 || Date.now() > deadline) {
      throw new Error(`sign-in for ${email} failed: HTTP ${res.status} ${JSON.stringify(res.body)}`);
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
}

const SESSION_COOKIE = 'better-auth.session_token';

/** A session as Better Auth writes one, proved by `get-session`; null when it cannot be minted or is not accepted. */
async function mintSession(userId: string): Promise<Client | null> {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || process.env.BETTER_AUTH_URL?.startsWith('https')) return null;
  const token = randomBytes(24).toString('base64url');
  await db().query(
    `insert into session (id, "userId", token, "expiresAt", "createdAt", "updatedAt")
     values ($1, $2, $3, now() + interval '1 day', now(), now())`,
    [randomUUID().replace(/-/g, ''), userId, token],
  );
  const signature = createHmac('sha256', secret).update(token).digest('base64');
  const client = new Client({ [SESSION_COOKIE]: encodeURIComponent(`${token}.${signature}`) });
  const res = await client.get<{ user?: { id?: string } } | null>('/api/auth/get-session');
  if (res.status === 200 && res.body?.user?.id === userId) return client;
  await db().query('delete from session where token = $1', [token]);
  return null;
}

async function signedIn(email: string): Promise<Client> {
  const client = new Client();
  await signIn(client, email);
  return client;
}

export async function createFreshMember(label: string, opts: FreshMemberOptions = {}): Promise<FreshMember> {
  const id = randomUUID().replace(/-/g, '');
  const email = uniqueEmail(label);
  const name = `Integ ${label}`;
  const handle = `it${id.slice(0, 12)}`;
  const createdAt = opts.createdAt ?? new Date();
  await db().query(
    `insert into "user" (id, name, email, "emailVerified", handle, "isAdmin", "createdAt", "updatedAt")
     values ($1, $2, $3, true, $4, $5, $6, now())`,
    [id, name, email, handle, opts.isAdmin ?? false, createdAt],
  );
  await db().query(
    `insert into account (id, "userId", "accountId", "providerId", password, "createdAt", "updatedAt")
     values ($1, $2, $2, 'credential', $3, now(), now())`,
    [randomUUID().replace(/-/g, ''), id, await passwordHash()],
  );
  const client = (await mintSession(id)) ?? (await signedIn(email));
  return { id, email, name, cookies: client.cookies, client };
}

/** Delete the members (the cascade takes their account, sessions, tracker and the rest). */
export async function removeFreshMembers(members: Array<Pick<TestUser, 'id'> | undefined>): Promise<void> {
  const ids = members.filter((m): m is Pick<TestUser, 'id'> => !!m).map((m) => m.id);
  if (ids.length) await db().query('delete from "user" where id = any($1)', [ids]);
}
