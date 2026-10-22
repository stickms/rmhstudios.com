/**
 * Direct-to-database seeding for integration files that exercise a server module
 * (`lib/**.server.ts`) rather than an HTTP endpoint. Users are inserted with
 * `createMany` — no sign-up, so the per-IP sign-up rate limit is not spent — and
 * everything a file creates hangs off those users, so `deleteUsers` (cascade)
 * cleans up after it.
 */
import { prisma } from '@/lib/prisma.server';

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Unique per run, so reruns against the same database never collide. */
export function uniq(label: string): string {
  return `it-${label}-${RUN}`;
}

/** Insert `n` plain users and return their ids (also usable as handles in assertions). */
export async function seedUsers(label: string, n: number): Promise<string[]> {
  const ids = Array.from({ length: n }, (_, i) => `${uniq(label)}-${i}`);
  await prisma.user.createMany({
    data: ids.map((id) => ({ id, name: id, email: `${id}@example.test` })),
  });
  return ids;
}

/** Deleting a user cascades to its posts, communities, memberships, requests, invites. */
export async function deleteUsers(ids: string[]): Promise<void> {
  if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } });
}
