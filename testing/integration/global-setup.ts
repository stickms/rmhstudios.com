/**
 * Runs once before the integration files: waits for the app to be ready, then
 * signs up the shared cast. Users are created ONCE here rather than per file
 * because sign-up is rate-limited to 10/min per IP and every request in CI
 * comes from one IP — a file that needs a fresh user (auth.test.ts) makes its
 * own, and the budget stays well under the limit.
 */
import type { TestProject } from 'vitest/node';
import { BASE_URL, closeDb, signUp, type TestUser } from './lib/client';
import { removeMedSchoolsFixture, seedMedSchoolsFixture } from './lib/medschools-fixture';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Posts, likes, comments; the tip sender. */
    alice: TestUser;
    /** The other side of every social write; the tip recipient. */
    bob: TestUser;
    /** Gets a seeded paid subscription for the developer API tests. */
    carol: TestUser;
  }
}

export default async function setup(project: TestProject) {
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const res = await fetch(`${BASE_URL}/api/ready`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`app at ${BASE_URL} never became ready`);
    await new Promise((r) => setTimeout(r, 1_000));
  }

  for (const label of ['alice', 'bob', 'carol'] as const) {
    const { client: _client, ...user } = await signUp(label);
    project.provide(label, user);
  }

  // The med schools fixture goes in BEFORE any file runs, not only in its own beforeAll: the sitemap index caches each
  // section's count for ten minutes, and an earlier file fetching /sitemap.xml against an empty database would cache a
  // count of 0 and hide the medschools chunk from the test that follows.
  await seedMedSchoolsFixture();
  return async () => {
    await removeMedSchoolsFixture();
    await closeDb();
  };
}
