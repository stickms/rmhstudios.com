/**
 * Theme Studio — the zod half of the token contract (§14 of the Liquid Glass v2
 * optics plan). Validation and the v1→v2 read path live here; the contract
 * itself, the colour math and the runtime applier live in `./tokens`.
 *
 * **Why the split.** `Providers.tsx` imports one binding (`clearThemeTokens`)
 * from `./tokens` on every page. zod builds schemas by calling `z.object(...)`
 * at module scope, which rolldown cannot prove side-effect-free, so a single
 * zod import in `./tokens` put **69.7 KB of zod on the client critical path of
 * every route** — to validate an optional localStorage blob. Only the theme
 * studio, the settings page and the API actually parse tokens, and each of those
 * is already behind its own chunk, so the schemas ride along with them instead.
 *
 * Keep it that way: never import this module from shell/provider code, and never
 * import zod into `./tokens`.
 */
import { z } from 'zod';
import {
  THEME_TOKENS_VERSION,
  TINT_ALPHA_MIN,
  TINT_ALPHA_MAX_LIGHT,
  DEFAULT_THEME_TOKENS,
  maxTintAlpha,
  upcastV1,
  type ThemeTokens,
  type ThemeTokensV1,
} from '@/lib/themes/tokens';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const themeTokensSchema = z
  .object({
    v: z.literal(THEME_TOKENS_VERSION),
    // The scene — base + three aurora glows (the radial GEOMETRY is a fixed
    // system template; the theme only colors it).
    canvasBase: hex,
    glow1: hex,
    glow2: hex,
    glow3: hex,
    // The material — one tint color + alpha + rim/glint strength.
    tint: hex,
    tintAlpha: z.number().min(TINT_ALPHA_MIN).max(TINT_ALPHA_MAX_LIGHT),
    glintStrength: z.number().min(0).max(1),
    // Ink & accent (as v1).
    text: hex,
    textMuted: hex,
    border: hex,
    accent: hex,
    accentFg: hex,
    radius: z.number().int().min(0).max(32),
  })
  .strict()
  .superRefine((t, ctx) => {
    // Skip when canvasBase already failed the hex field check (avoids re-parsing
    // an invalid color here — the field schema already recorded that issue).
    if (!/^#[0-9a-fA-F]{6}$/.test(t.canvasBase)) return;
    // The high-alpha ceiling depends on the base luminance (§14.1).
    const max = maxTintAlpha(t.canvasBase);
    if (t.tintAlpha > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tintAlpha'],
        message: `tintAlpha must be ≤ ${max} for this canvasBase luminance`,
      });
    }
  });

/**
 * Compile-time pin: each schema's output must stay EXACTLY its contract type.
 *
 * `ThemeTokens` used to be `z.infer<typeof themeTokensSchema>`; now that it is
 * declared structurally in `./tokens` (so that module can stay zod-free), these
 * assignments are what stop the two drifting. Add, remove or retype a field on
 * one side without the other and the corresponding line fails to typecheck.
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

const _schemaMatchesContract: Exact<z.output<typeof themeTokensSchema>, ThemeTokens> = true;
void _schemaMatchesContract;

const themeTokensV1Schema = z
  .object({
    v: z.literal(1),
    bg: hex,
    surface: hex,
    surfaceHover: hex,
    text: hex,
    textMuted: hex,
    border: hex,
    accent: hex,
    accentFg: hex,
    radius: z.number().int().min(0).max(32),
  })
  .strict();

const _v1SchemaMatchesContract: Exact<z.output<typeof themeTokensV1Schema>, ThemeTokensV1> = true;
void _v1SchemaMatchesContract;

/**
 * Parse stored tokens (v2 preferred, v1 upcast) — the read path for drafts and
 * purchases persisted before v2. Throws only on a map that is neither.
 */
export function upcastTokens(raw: unknown): ThemeTokens {
  const v2 = themeTokensSchema.safeParse(raw);
  if (v2.success) return v2.data;
  const v1 = themeTokensV1Schema.safeParse(raw);
  if (v1.success) return upcastV1(v1.data);
  throw new Error('INVALID_TOKENS');
}

/** Best-effort read: upcast if possible, else fall back to the default palette. */
export function readTokens(raw: unknown): ThemeTokens {
  try {
    return upcastTokens(raw);
  } catch {
    return DEFAULT_THEME_TOKENS;
  }
}
