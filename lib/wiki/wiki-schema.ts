/**
 * Zod schemas for the wiki sign-in endpoint (`GET /api/wiki/sso`). Client-safe:
 * `wiki.contract.ts` takes its types from here by `import type`.
 */
import { z } from 'zod';

export const wikiSsoQuery =
  z.object(
    {
      /** 32 hex characters the wiki put in the visitor's session (Special:RMHStudiosLogin). */
      state:
        z
          .string()
          .regex(
            /^[0-9a-f]{32}$/,
          ),
    },
  );
