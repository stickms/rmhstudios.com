import { z } from 'zod';
import {
  SECURE_GROUPS,
  SECURE_REASON_MAX,
} from '@/lib/admin/secure-account';

export const secureAccountBody =
  z.object(
    {
      groups:
        z
          .array(
            z.enum(
              SECURE_GROUPS,
            ),
          )
          .min(
            1,
          )
          .max(
            SECURE_GROUPS.length,
          )
          .transform(
            (
              g,
            ) => [
              ...new Set(
                g,
              ),
            ],
          ),
      reason:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            SECURE_REASON_MAX,
          ),
    },
  );
