/** Request schemas for /api/push/subscribe. Client-safe. */
import { z } from 'zod';

export const subscribePushBody = z.object({
  endpoint: z.string().url().max(1024),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

export const unsubscribePushBody = z.object({
  endpoint: z.string().url().max(1024),
});
