/**
 * posts-plus background jobs, registered once from server/jobs/index.ts.
 * Only the worker's boss instance has `schedule: true`, so the web tier never
 * calls this. Every handler is idempotent (pg-boss delivers at-least-once).
 */

import type { PgBoss } from 'pg-boss';
import { registerLifecycleCrons } from './lifecycle.server';
import { registerLinkRescueCron } from './link-rescue.server';
import { registerScheduledPublishCron } from './capsules.server';

export async function registerPostsPlusCrons(boss: PgBoss): Promise<void> {
  await registerLifecycleCrons(boss); // X8: TTL sweep + daily auto-delete
  await registerLinkRescueCron(boss); // X11: dead-link check + Wayback swap
  await registerScheduledPublishCron(boss); // Z7: publish due scheduled posts / capsules
}
