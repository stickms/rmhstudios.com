/** Contract for creating a shared moment (redesign audit C1, batch 10). Client-safe. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { createMomentSchema } from '@/lib/moments-schema';

/** Only ever called when the user chooses to share. `url` is the public landing page. */
export const createMomentApi = endpoint<{
  body: z.infer<typeof createMomentSchema>;
  res: { id: string; url: string };
}>()({ method: 'POST', path: '/api/moments' });
