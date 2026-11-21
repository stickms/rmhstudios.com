/** Request schemas for the cloud save manager endpoints. */
import { z } from 'zod';

/** A snapshot id as it travels in a URL or body: the decimal form of a bigint. */
export const snapshotIdString =
  z
    .string()
    .regex(
      /^\d{1,18}$/,
    );

/**
 * Restore from one of the member's snapshots (`snapshotId`) or from a backup file's contents (`backup`). The backup
 * is checked in depth by `validateBackup` in the handler; here it only has to be present.
 */
export const restoreBody =
  z
    .object(
      {
        snapshotId:
          snapshotIdString.optional(),
        backup:
          z
            .unknown()
            .optional(),
      },
    )
    .refine(
      (
        b,
      ) =>
        (b.snapshotId !==
          undefined) !==
        (b.backup !==
          undefined),
      {
        message:
          'Send either snapshotId or backup',
      },
    );
