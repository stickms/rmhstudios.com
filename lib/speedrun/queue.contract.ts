/**
 * The admin speedrun review queue's contracts and row types (sprint 10, feature 16).
 *
 * Client-safe: every type is `import type`, nothing here touches Prisma. The page (`/admin/speedruns`) renders
 * {@link SpeedrunQueueRow}s; the server module that fills them is `lib/speedrun/review-queue.server.ts`.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { SpeedrunMetric, SpeedrunStatus, VerificationTier } from '@/lib/speedrun/types';

/** One run in the admin queue or in "Recently decided". */
export interface SpeedrunQueueRow {
  id: string;
  replayId: string;
  /** The game's id (`lights-out`) and its title as the catalog writes it. */
  game: string;
  gameTitle: string;
  categoryName: string;
  version: string;
  metric: SpeedrunMetric;
  tier: VerificationTier;
  timeMs: number;
  score: number | null;
  status: SpeedrunStatus;
  /** The verifier's note on a queued run, the reason on a decided one. */
  note: string | null;
  createdAt: string;
  /** When a human decided; null for a queued run or an automatic verdict. */
  reviewedAt: string | null;
  decidedBy: { id: string; name: string | null } | null;
  runner: { id: string; name: string | null; handle: string | null };
}

export type SpeedrunQueueView = 'pending' | 'decided';

/** `pending` is oldest first; `decided` is the last 50 human verdicts, newest first. */
export const SPEEDRUN_DECIDED_LIMIT = 50;
export const SPEEDRUN_QUEUE_PAGE = 50;

/** What the page's first load and its refetches both return. */
export interface SpeedrunQueuePage {
  rows: SpeedrunQueueRow[];
}

export const speedrunQueueApi = endpoint<{
  query: { view: SpeedrunQueueView };
  res: SpeedrunQueuePage;
}>()({ method: 'GET', path: '/api/speedrun/queue' });

export type SpeedrunQueueAction =
  | { action: 'review'; entryId: string; status: 'verified' | 'rejected'; reason?: string | undefined }
  | { action: 'reopen'; entryId: string; from: 'verified' | 'rejected'; reason: string };

/** 200 with `{ ok: true }`; 409 with `{ error, status, decidedBy }` when the run is no longer in the state the admin saw. */
export const speedrunQueueActionApi = endpoint<{
  body: SpeedrunQueueAction;
  res: { ok: true };
}>()({ method: 'POST', path: '/api/speedrun/queue' });
