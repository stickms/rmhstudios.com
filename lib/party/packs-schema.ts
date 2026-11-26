/**
 * Community party packs — the zod input schemas for the pack API routes. Split
 * from `./packs`, which the /rmhbox-packs page imports for the limits.
 */
import { z } from 'zod';

import { PACK_GAMES, PACK_MAX_PROMPTS } from './packs';
import { PACK_RAW_LINE_MAX, parsePackLines } from './pack-games';

/**
 * One pack. `prompts` is the list of lines whatever the game; `pack-games.ts` says what a line is for each, and the
 * refinement reports an unusable line by its position (`prompts.<n>`) and a list with too few distinct usable lines.
 */
export const createPackSchema = z
  .object({
    name: z.string().trim().min(3).max(60),
    game: z.enum(PACK_GAMES).default('wit-war'),
    prompts: z.array(z.string().max(PACK_RAW_LINE_MAX)).max(PACK_MAX_PROMPTS),
  })
  .superRefine((pack, ctx) => {
    const parsed = parsePackLines(pack.game, pack.prompts);
    for (const e of parsed.errors) {
      ctx.addIssue({ code: 'custom', path: ['prompts', e.line - 1], message: e.code });
    }
    if (parsed.errors.length === 0 && parsed.lines.length < parsed.min) {
      ctx.addIssue({ code: 'custom', path: ['prompts'], message: 'not-enough-lines' });
    }
  });

export type CreatePackInput = z.infer<typeof createPackSchema>;

export const reportPackSchema = z.object({
  reason: z.string().trim().min(3).max(200),
});

export const adminPackSchema = z.object({
  featured: z.boolean().optional(),
  hidden: z.boolean().optional(),
});
