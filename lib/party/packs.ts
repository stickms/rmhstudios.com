import { z } from 'zod';

/** Games a community pack can target. Prompt format = one plain-text prompt per line. */
export const PACK_GAMES = ['wit-war'] as const;
export const PACK_MIN_PROMPTS = 12;
export const PACK_MAX_PROMPTS = 60;
export const PACK_CODE_LEN = 6;
/** Hidden automatically once this many distinct members report it. */
export const PACK_AUTOHIDE_REPORTS = 3;
export const MAX_PACKS_PER_MEMBER = 10;
/** No 0/O/1/I so a code read off a screen is unambiguous. */
export const PACK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const createPackSchema = z.object({
  name: z.string().trim().min(3).max(60),
  game: z.enum(PACK_GAMES).default('wit-war'),
  prompts: z.array(z.string().trim().min(8).max(120)).min(PACK_MIN_PROMPTS).max(PACK_MAX_PROMPTS),
});
export type CreatePackInput = z.infer<typeof createPackSchema>;

export const reportPackSchema = z.object({ reason: z.string().trim().min(3).max(200) });
export const adminPackSchema = z.object({
  featured: z.boolean().optional(),
  hidden: z.boolean().optional(),
});

/** Case-insensitive de-duplication; returns null when fewer than the minimum remain. */
export function normalizePrompts(prompts: string[]): string[] | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of prompts) {
    const k = p.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(p.trim());
  }
  return out.length >= PACK_MIN_PROMPTS ? out : null;
}

export interface PackView {
  id: string;
  code: string;
  name: string;
  game: string;
  promptCount: number;
  featured: boolean;
  hidden?: boolean;
  mine: boolean;
  author: { name: string | null; handle: string | null } | null;
}
