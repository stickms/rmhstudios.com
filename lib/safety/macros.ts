import { z } from 'zod';

export const macroInputSchema = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(1000),
});

export interface ModMacroDTO {
  id: string;
  title: string;
  body: string;
}

/** Fill {{user}} / {{reason}}; unknown variables are left as written. */
export function renderMacro(body: string, vars: { user?: string; reason?: string }): string {
  return body
    .replace(/\{\{\s*user\s*\}\}/gi, vars.user || 'there')
    .replace(/\{\{\s*reason\s*\}\}/gi, vars.reason || 'our community guidelines')
    .slice(0, 1000);
}
