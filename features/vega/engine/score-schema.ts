/** Request schema for POST /api/vega/score. Client-safe. */
import { z } from 'zod';
import { TOWER_ORDER, WAVES } from './data';

/**
 * One finished run. Bounded and strict: the route then checks the score against the per-wave bound of the score
 * formula (`maxScoreThrough`) and the catalog's rules (`validateScore`), and the facts for consistency
 * (`plausibleFacts`), before it records a best or grants an achievement.
 */
export const vegaScoreBody = z
  .object({
    score: z.number().int().min(0).max(10_000_000),
    cleared: z.number().int().min(0).max(WAVES.CAP),
    map: z.enum(['intake', 'vault', 'theatre']),
    durationMs: z.number().int().min(0).max(86_400_000),
    facts: z
      .object({
        integrityLost: z.number().int().min(0).max(1_000),
        typesBuilt: z.array(z.enum(TOWER_ORDER as unknown as [string, ...string[]])).max(TOWER_ORDER.length),
        maxTier: z.number().int().min(0).max(2),
        earlyCalls: z.number().int().min(0).max(WAVES.CAP),
        bossesKilled: z.number().int().min(0).max(1_000),
        biobankIncome: z.number().int().min(0).max(10_000_000),
      })
      .strict(),
  })
  .strict();

export type VegaScoreBody = z.infer<typeof vegaScoreBody>;
