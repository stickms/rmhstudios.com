/** Nightrail trick submission (R21) — validates a chain against the real trick names. */
import { z } from 'zod';
import { TRICK_LIST } from './constants';

const TRICK_NAMES = new Set(TRICK_LIST.map((t) => t.name));

export const submitTrickSchema = z.object({
  level: z.number().int().min(1).max(5),
  /** The combo's cash-out, which a recorded run score can never be below. */
  score: z.number().int().min(1).max(100_000_000),
  multiplier: z.number().min(1).max(100),
  chain: z
    .array(z.string())
    .min(1)
    .max(12)
    .refine((c) => c.every((n) => TRICK_NAMES.has(n))),
});
