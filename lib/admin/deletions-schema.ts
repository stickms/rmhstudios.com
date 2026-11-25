/** Zod for /api/admin/deletions (server side; the client sees only the types, by `import type`). */
import { z } from 'zod';

/** The member id in the retry path: an opaque id, never an e-mail address or a handle. */
export const retryParams = z.object({ userId: z.string().min(1).max(64) });
