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
 * cast (every cast member shares `PASSWORD`). The member then signs in through the real endpoint, which is limited to
 * 10 a minute per IP too; a 429 waits for the window to turn over rather than failing the file.
 */
import { randomUUID } from 'node:crypto';
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
  const client = new Client();
  await signIn(client, email);
  return { id, email, name, cookies: client.cookies, client };
}

/** Delete the members (the cascade takes their account, sessions, tracker and the rest). */
export async function removeFreshMembers(members: Array<Pick<TestUser, 'id'> | undefined>): Promise<void> {
  const ids = members.filter((m): m is Pick<TestUser, 'id'> => !!m).map((m) => m.id);
  if (ids.length) await db().query('delete from "user" where id = any($1)', [ids]);
}
