/** Client-safe request shape for /api/creators/$id/join. */
import { z } from 'zod';

export const joinTierBody = z.object({ tierId: z.string().min(1).max(64) });
