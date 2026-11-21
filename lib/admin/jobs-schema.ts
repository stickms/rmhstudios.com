/** Zod for the jobs console endpoints (server side; the client sees only the types, by `import type`). */
import { z } from 'zod';
import {
  JOB_LIST_STATES,
  parseIdList,
} from '@/lib/admin/jobs';

export const queueNameSchema =
  z
    .string()
    .regex(
      /^[a-z0-9._:-]{1,100}$/,
    );
export const jobIdSchema =
  z
    .string()
    .uuid();

/** `<created_on to the microsecond, UTC>_<job id>`: the last row of the previous page. */
export const JOB_CURSOR =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z_[0-9a-f-]{36}$/;

export const listJobsQuerySchema =
  z.object(
    {
      state:
        z.enum(
          JOB_LIST_STATES,
        ),
      after:
        z
          .string()
          .regex(
            JOB_CURSOR,
          )
          .optional(),
    },
  );

/** `ids` is one comma-separated string (repeated parameters do not survive), at most 100 UUIDs. */
export const jobActionBodySchema =
  z.object(
    {
      action:
        z.enum(
          [
            'retry',
            'cancel',
            'delete',
          ],
        ),
      ids: z
        .string()
        .max(
          4000,
        )
        .refine(
          (
            v,
          ) =>
            parseIdList(
              v,
            ) !==
            null,
        ),
    },
  );
