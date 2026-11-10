/** Contract for POST /api/feedback (redesign audit C1). Client-safe. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { feedbackSchema } from '@/lib/feedback-schema';

export const sendFeedbackApi = endpoint<{
  body: z.infer<typeof feedbackSchema>;
  res: {
    id: string;
    category: string;
    message: string;
    createdAt: string;
    user: { name: string; image: string | null };
  };
}>()({ method: 'POST', path: '/api/feedback' });
