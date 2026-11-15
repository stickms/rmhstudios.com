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

/** The wiki editor's "Edit with AI" (`POST /api/wiki/assist`). */
export const wikiAssistBody =
  z.object(
    {
      /** What the page should say, its structure, or the change to make, in the editor's words. */
      instruction:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            4_000,
          ),
      /** The page title, so a new page is written about the right thing. */
      title:
        z
          .string()
          .trim()
          .max(
            255,
          ),
      /** The wikitext in the edit box; empty to write a new page. */
      content:
        z
          .string()
          .max(
            60_000,
          ),
    },
  );
