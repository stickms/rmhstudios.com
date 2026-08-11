/**
 * Extracts t("...") keys from the app into locales/<lng>/<ns>.json.
 *
 * ## Why this config is load-bearing (read before changing `keepRemoved`)
 *
 * The parser can only see keys it can read as string literals in a call it
 * recognises. Everything it cannot see looks *removed* to it, and with
 * `keepRemoved: false` that meant `pnpm i18n:extract` DELETED live
 * translations — ~3.9k lines of them across the catalogs. Two blind spots did
 * the damage, and both are fixed below rather than worked around:
 *
 * 1. **Aliased `t`.** Roughly twenty call sites destructure the hook under
 *    another name (`const { t: ts } = useTranslation(...)`) to hold two
 *    namespaces in one component. The lexer matches `t` by default, so every
 *    key reached through `ts`/`tFeed`/`tl`/`tr`/`tSlice` was invisible — that
 *    alone accounted for the whole of `r-slice-it` (94 deleted lines).
 * 2. **Keys built at runtime.** Bum's Rush stores i18n keys in its level
 *    manifest (`bums.world.w1.name`) and resolves them dynamically, with a zod
 *    regex enforcing that they ARE keys. No literal ever appears in a `t()`
 *    call, so no parser can find them; `keepRemoved` is the only correct
 *    answer for that family.
 *
 * The consequence of the destruction was that nobody ran the extractor, so the
 * catalogs drifted: ~19k keys the code uses are missing from the non-English
 * locales, which silently serve the English `defaultValue` instead. Running it
 * is safe now; that backlog is the insertions you will see on the first run.
 */
const T_FUNCTIONS = ["t", "ts", "tFeed", "tl", "tr", "tSlice"];

export default {
  locales: [
    "en", "zh", "ar", "hi", "es", "fr", "pt", "ru",
    "de", "ja", "ko", "it", "id", "vi", "tr", "ur",
    "bn", "pa", "ta", "te", "mr", "fa", "th", "pl",
    "uk", "nl", "fil", "ms", "ro", "el", "cs", "sv",
  ],
  defaultNamespace: "common",
  namespaceSeparator: ":",
  keySeparator: false,
  input: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
  output: "locales/$LOCALE/$NAMESPACE.json",
  sort: true,
  // Additive only. Some keys are assembled at runtime and no static parser can
  // ever see them — Bum's Rush stores `bums.world.w1.name` in its level
  // manifest and resolves it dynamically — so "absent from the source" does not
  // mean "dead". A scoped `[/^bums/]` was tried first and does not work: this
  // family is stored as ONE nested object under the literal key "bums" (the
  // runtime keeps i18next's default `keySeparator: "."` while this file sets
  // `false`), so the pattern never matches a dotted path.
  //
  // The cost is that genuinely dead keys accumulate; the cost of the
  // alternative was the extractor deleting live translations, which is what
  // made this command unsafe to run. A stale key is a few bytes, a deleted one
  // is a visible bug. Prune deliberately instead — `pnpm i18n:coverage`.
  keepRemoved: true,
  createOldCatalogs: false,
  // Do not overwrite existing translated values with the key/default.
  resetDefaultValueLocale: "en",
  // The aliases real call sites use. A component holding two namespaces
  // destructures at least one of them under another name, and the lexer matches
  // `t` only — so each of these was a set of keys the extractor deleted on
  // sight. Add the alias here in the same commit that introduces one.
  lexers: {
    ts: [{ lexer: "JavascriptLexer", functions: T_FUNCTIONS }],
    js: [{ lexer: "JavascriptLexer", functions: T_FUNCTIONS }],
    tsx: [{ lexer: "JsxLexer", functions: T_FUNCTIONS }],
    jsx: [{ lexer: "JsxLexer", functions: T_FUNCTIONS }],
  },
};
