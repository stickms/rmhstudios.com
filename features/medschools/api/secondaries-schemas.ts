import { z } from 'zod';
import { isThirdPartyHost } from '../scrape/school-pages';

/** Server-side schemas of the secondaries endpoints (the contract file imports types only). */

export const secondariesQuery = z.object({ program: z.enum(['ALL', 'REG', 'PHD']).optional() });

export const overlapQuery = z
  .object({
    source: z.enum(['list', 'tracker']),
    list: z.string().min(1).max(64).optional(),
  })
  .strict()
  .refine(
    (q) => (q.source === 'list') === (q.list !== undefined),
    'a list source needs a list, a tracker source takes none',
  );

const sourceUrl = z
  .string()
  .max(500)
  .refine((u) => {
    try {
      const url = new URL(u);
      return (
        url.protocol === 'https:' &&
        url.username === '' &&
        url.password === '' &&
        url.search === '' &&
        url.hash === '' &&
        !isThirdPartyHost(url.hostname)
      );
    } catch {
      return false;
    }
  }, 'must be an https page URL on the school own host, with no credentials, query or fragment');

export const adminSecondariesBody = z
  .object({
    schoolId: z.string().min(1).max(64),
    program: z.enum(['REG', 'PHD']),
    cycleYear: z.number().int().min(2005).max(2100),
    sourceUrl,
    prompts: z
      .array(
        z
          .object({
            text: z.string().min(1).max(1500),
            limitKind: z.enum(['WORDS', 'CHARS']).optional(),
            limitValue: z.number().int().min(1).max(20000).optional(),
            optional: z.boolean().optional(),
          })
          .strict()
          .refine(
            (p) => (p.limitKind === undefined) === (p.limitValue === undefined),
            'a limit needs a kind and a value',
          ),
      )
      .min(1)
      .max(40),
  })
  .strict();

export type AdminSecondariesBody = z.infer<typeof adminSecondariesBody>;
