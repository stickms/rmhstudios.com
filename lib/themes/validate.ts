/**
 * The theme marketplace's safety gate (F18).
 *
 * A purchased theme is CSS that a stranger wrote running on your session's
 * document. `tokens-schema.ts` already makes the *input* safe by construction —
 * a `.strict()` zod object of hex colours and clamped numbers, never CSS
 * strings, so there is no place for `url()` to be typed in. This module guards
 * the other end: the **derived** `--site-*` map that `themeCssVars()` builds and
 * the runtime actually writes to the DOM.
 *
 * That second gate is not redundant. The input contract is closed today, but
 * `themeCssVars()` is where token values get interpolated into gradient,
 * `rgba()` and `color-mix()` strings — one future token that passes a user
 * string through unescaped turns a style value into a style *sheet*, and the
 * input schema would never see it. So we check what is actually applied:
 *
 *   1. **Closed name allowlist.** Every emitted custom property must be one of
 *      `THEME_VAR_NAMES` — the exact set the default theme produces. A theme
 *      cannot introduce a property name, only re-colour a known one.
 *   2. **Closed function allowlist.** Every `ident(` in every value must be one
 *      of the four functions the derivation is allowed to emit. This is what
 *      rejects `url(`, `expression(`, `image-set(` and friends — by not being
 *      on the list, rather than by being on a denylist someone has to remember
 *      to extend.
 *   3. **No declaration-breaking characters.** `;`, `{`, `}`, `\`, comment
 *      markers and control characters are the primitives that let a value
 *      escape its declaration and become new rules. None can appear in a legal
 *      derived value.
 *   4. **The contrast gate.** A theme whose body text fails AA against its own
 *      worst-case backdrop is a broken site, not a style choice, so it cannot be
 *      published or sold. The maths lives in `tokens.ts#lintThemeContrast`
 *      (shared with the editor's live lint) — this module is where it becomes a
 *      *gate* rather than a hint.
 *
 * Client-safe on purpose: the studio runs the same check before enabling
 * Publish, so the author sees the failure they would otherwise get as a 400.
 */
import {
  themeCssVars,
  lintThemeContrast,
  THEME_VAR_NAMES,
  THEME_PRICE_MIN,
  THEME_PRICE_MAX,
  type ThemeTokens,
  type ThemeLintIssue,
} from '@/lib/themes/tokens';
import { themeTokensSchema, upcastTokens } from '@/lib/themes/tokens-schema';

/**
 * The CSS functions `themeCssVars()` is allowed to emit. Closed on purpose —
 * adding a function to the derivation means adding it here, which is a
 * deliberate, reviewable act. `url` is absent and must stay absent.
 */
export const ALLOWED_CSS_FUNCTIONS: readonly string[] = [
  'rgba',
  'radial-gradient',
  'linear-gradient',
  'color-mix',
];

/** The closed set of custom-property names a theme may set. */
export const ALLOWED_VAR_NAMES: ReadonlySet<string> = new Set(THEME_VAR_NAMES);

/**
 * Characters that end a declaration or open a construct. A legal derived value
 * is colours, numbers, keywords, commas and parentheses — never any of these.
 */
// Matching control characters is the POINT: a theme value is user-authored and
// gets interpolated into a stylesheet, so an embedded NUL or ESC is exactly the
// smuggling attempt this rejects. The rule assumes they are a typo.
// eslint-disable-next-line no-control-regex
const UNSAFE_VALUE = /[;{}\\<>]|\/\*|\*\/|[\u0000-\u001f\u007f]/;

/** Every `name(` in a value — the function calls it actually performs. */
const CSS_FUNCTION_CALL = /([a-zA-Z-]+)\s*\(/g;

export type ThemeValidationCode =
  /** The token map is not a valid v1 or v2 contract (unknown key, bad hex, out of range). */
  | 'INVALID_TOKENS'
  /** The derivation emitted a property name outside the closed allowlist. */
  | 'UNKNOWN_TOKEN'
  /** A derived value used a CSS function that is not on the allowlist. */
  | 'UNSAFE_VALUE'
  /** Text or accent contrast falls below WCAG AA. */
  | 'CONTRAST'
  /** Price outside the published range. */
  | 'PRICE_RANGE';

export interface ThemeValidationOk {
  ok: true;
  /** The parsed, v2-normalised tokens (v1 input is upcast). */
  tokens: ThemeTokens;
  /** The derived `--site-*` map, proven safe to apply. */
  vars: Record<string, string>;
}

export interface ThemeValidationErr {
  ok: false;
  code: ThemeValidationCode;
  message: string;
  /** Populated for `CONTRAST` — the exact failing pairs, for the editor's lint. */
  issues?: ThemeLintIssue[];
}

export type ThemeValidation = ThemeValidationOk | ThemeValidationErr;

const err = (
  code: ThemeValidationCode,
  message: string,
  issues?: ThemeLintIssue[],
): ThemeValidationErr =>
  issues ? { ok: false, code, message, issues } : { ok: false, code, message };

/**
 * Check one derived `--site-*` declaration. Exported because the runtime
 * applier can afford one regex per property and a compromised cached blob is
 * exactly the case the DOM-side check exists for.
 */
export function isSafeDeclaration(name: string, value: string): boolean {
  if (!ALLOWED_VAR_NAMES.has(name)) return false;
  if (UNSAFE_VALUE.test(value)) return false;
  CSS_FUNCTION_CALL.lastIndex = 0;
  for (let m = CSS_FUNCTION_CALL.exec(value); m !== null; m = CSS_FUNCTION_CALL.exec(value)) {
    if (!ALLOWED_CSS_FUNCTIONS.includes(m[1].toLowerCase())) return false;
  }
  return true;
}

/**
 * Validate a raw token map for STORAGE: parse the closed contract, then prove
 * the derived stylesheet is safe. Does not apply the contrast gate — a draft is
 * allowed to be mid-edit and illegible; only publishing is gated.
 */
export function validateTheme(raw: unknown): ThemeValidation {
  let tokens: ThemeTokens;
  try {
    // v2 preferred; a stored v1 map upcasts rather than being rejected, so
    // drafts written before the glass contract keep validating.
    tokens = upcastTokens(raw);
  } catch {
    return err('INVALID_TOKENS', 'Theme tokens do not match the token contract');
  }

  // Re-parse the (possibly upcast) map so the error message names the offending
  // field, and so an upcast that ever produced an out-of-range value is caught
  // here rather than at the DOM.
  const parsed = themeTokensSchema.safeParse(tokens);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.join('.') || 'tokens';
    return err('INVALID_TOKENS', `Invalid token \`${path}\`: ${first?.message ?? 'rejected'}`);
  }

  const vars = themeCssVars(parsed.data);
  for (const [name, value] of Object.entries(vars)) {
    if (!ALLOWED_VAR_NAMES.has(name)) {
      return err('UNKNOWN_TOKEN', `Unknown token: ${name}`);
    }
    if (!isSafeDeclaration(name, value)) {
      return err('UNSAFE_VALUE', `Unsafe value for ${name}: ${value}`);
    }
  }

  return { ok: true, tokens: parsed.data, vars };
}

/**
 * The PUBLISH gate: everything `validateTheme` checks, plus WCAG AA. Selling a
 * theme that cannot be read is the one failure the buyer cannot undo — they
 * have already paid, and the surface they would use to change it back is
 * rendered in the theme they just bought.
 */
export function validateThemeForPublish(raw: unknown, priceCoins?: number): ThemeValidation {
  const base = validateTheme(raw);
  if (!base.ok) return base;

  const issues = lintThemeContrast(base.tokens);
  if (issues.length > 0) {
    const worst = issues[0];
    return err(
      'CONTRAST',
      `Contrast ${worst.ratio.toFixed(2)}:1 on ${worst.pair} is below AA (${worst.need}:1)`,
      issues,
    );
  }

  if (priceCoins !== undefined && (priceCoins < THEME_PRICE_MIN || priceCoins > THEME_PRICE_MAX)) {
    return err(
      'PRICE_RANGE',
      `Price must be between ${THEME_PRICE_MIN} and ${THEME_PRICE_MAX} coins`,
    );
  }

  return base;
}
