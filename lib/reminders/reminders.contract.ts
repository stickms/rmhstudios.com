/**
 * Contracts for /api/reminders (redesign audit C1, batch 3). Client-safe:
 * request types come from the zod schema by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { createReminderSchema } from '@/lib/reminders/schema';
import type { ReminderView } from '@/lib/reminders/shared';

export const listRemindersApi =
  endpoint<{
    res: {
      reminders: ReminderView[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/reminders',
    },
  );

/** 201. Sets, or moves, the reminder for one target. */
export const setReminderApi =
  endpoint<{
    body: z.infer<
      typeof createReminderSchema
    >;
    res: {
      reminder: ReminderView;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/reminders',
    },
  );

export const cancelReminderApi =
  endpoint<{
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/reminders/$id',
    },
  );
