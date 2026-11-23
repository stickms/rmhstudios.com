import type { InitOptions } from "i18next";

export const LOCALES = [
  // The languages we serve and keep translated (`.github/workflows/i18n-translate.yml`).
  "en", "zh", "ar", "hi", "es", "fr", "pt", "ru", "ja",
] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * Locale directories that exist under `locales/` but are NOT shipped.
 *
 * Their catalogs are real and machine-translated, kept on the i18n/catalogs
 * branch with the shipped ones, but nothing serves them and the translate
 * workflow skips them: a locale reaches users only through `LOCALES`
 * above. Their catalogs stay on disk so promoting one later only pays for the
 * keys added since it was parked. de, ko, it, id, tr, ur and vi were shipped
 * until 2026-11-17 and were parked to cut translation spend. They are listed here rather than left implicit
 * so the catalog test can hold `locales/` to `LOCALES ∪ PENDING_LOCALES` and a
 * seventeenth orphan can't appear unnoticed.
 *
 * Promoting one is a product decision, not a mechanical one — it commits us to
 * maintaining its catalog and needs a `LOCALE_LABELS` / `TRANSLATE_TARGETS` /
 * `LOCALE_TO_LANGUAGE_NAME` entry (the types below enforce all three), a
 * `LOCALE_NAMESPACE_LOADERS` entry in `lib/i18n/resources.ts`, and a
 * `lib/i18n/resources.<locale>.ts` (copy another locale's). Note that
 * `fa` and `ur` are RTL and would also need adding to `RTL_LOCALES`.
 */
export const PENDING_LOCALES = [
  "bn", "cs", "de", "el", "fa", "fil", "id", "it", "ko", "mr", "ms", "nl",
  "pa", "pl", "ro", "sv", "ta", "te", "th", "tr", "uk", "ur", "vi",
] as const;

export const DEFAULT_LOCALE: Locale = "en";

/**
 * Right-to-left locales. dirFor() and the no-flash <html dir> guard read this,
 * so add a locale here (instead of a hardcoded `=== "ar"`) to make the whole
 * app render it RTL.
 */
export const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(["ar"]);

/**
 * The namespace registry. A `locales/en/<ns>.json` file that is NOT listed here
 * is never loaded — i18next serves the `defaultValue` baked into each `t()`
 * call, so English looks correct and every other locale silently serves English
 * too. That failure is invisible at runtime and in CI unless something asserts
 * it, so `lib/__tests__/i18n-catalogs.test.ts` holds this list to exact set
 * equality with `locales/en/`. Add the namespace here in the same commit that
 * adds the file.
 *
 * Keep it SORTED, one name per line (`lib/__tests__/i18n-catalogs.test.ts` holds that): a
 * new namespace then lands between its neighbours instead of at the tail, where every
 * branch that adds one edits the same lines and two of them conflict.
 */
export const NAMESPACES = [
  "achievement-compare",
  "achievement-tracker",
  "admin",
  "admin-api-oversight",
  "admin-batch-lookup",
  "admin-communities",
  "admin-jobs",
  "admin-lookup",
  "admin-outbox",
  "admin-secure-account",
  "admin-spam-sweep",
  "admin-webhooks",
  "alt-text-editing",
  "api-games",
  "audience",
  "away-message",
  "bass-clef",
  "blocked-muted",
  "board-privacy",
  "bracket-list",
  "build-comments",
  "build-insights",
  "build-issues",
  "build-releases",
  "build-screenshots",
  "builds",
  "bulk-durable",
  "c-admin",
  "c-altair",
  "c-awards",
  "c-balatro",
  "c-blog",
  "c-builds",
  "c-circle",
  "c-creator",
  "c-cursed-logic",
  "c-daily-puzzles",
  "c-doctrine",
  "c-dream-rift",
  "c-dunesday",
  "c-economy",
  "c-elections",
  "c-gabriels-horn",
  "c-game",
  "c-groupcall",
  "c-hearthworks",
  "c-history",
  "c-house-always-wins",
  "c-kaikai-debt",
  "c-kowloon-knockout",
  "c-laundry-sort",
  "c-layout",
  "c-library",
  "c-lights-out",
  "c-lists",
  "c-lockdown",
  "c-moderation",
  "c-neon-driftway",
  "c-news",
  "c-nightrail",
  "c-predictions",
  "c-profile-modules",
  "c-rebar-rutabaga",
  "c-rideshare",
  "c-rmh-capital",
  "c-rmh-datacenter",
  "c-rmh-pmc",
  "c-rmh-research",
  "c-rmhbox",
  "c-rmhcalculator",
  "c-rmhcharacters",
  "c-rmhcode",
  "c-rmhcoins",
  "c-rmhfashion",
  "c-rmhmusic",
  "c-rmhstudy",
  "c-rmhtech",
  "c-rmhtube",
  "c-rmhtype",
  "c-rmhvibe",
  "c-roadmap",
  "c-saves",
  "c-signal-forge",
  "c-status",
  "c-studio",
  "c-synapse-storm",
  "c-temple-of-joy",
  "c-tf2-game",
  "c-tf2-hud",
  "c-tournaments",
  "c-ui",
  "c-user-builds",
  "c-vega",
  "c-velum2099",
  "c-versecraft",
  "c-void-breaker",
  "c-wager",
  "c-wishlist",
  "card-images",
  "card-sound",
  "chart-overview",
  "cloud-saves",
  "coin-adjustments",
  "common",
  "community-alerts",
  "community-alt-text",
  "community-bans",
  "community-events",
  "community-handover",
  "community-insights",
  "community-modlog",
  "community-notes",
  "community-pins",
  "community-rules",
  "community-wiki",
  "content-warnings",
  "conversation-controls",
  "daily-stats",
  "deck-folders",
  "deck-suggestions",
  "deck-updates",
  "deletion-pause",
  "dev-explorer",
  "dev-webhooks",
  "device-data",
  "double-elimination",
  "draft-edit",
  "driftway-laundry-assists",
  "durable-reclaims",
  "errors",
  "event-cohosts",
  "event-occurrences",
  "event-updates",
  "event-waitlist",
  "f-access",
  "f-action",
  "f-arcade",
  "f-async-games",
  "f-calendar",
  "f-canvas",
  "f-communities-plus",
  "f-competitive",
  "f-creative",
  "f-deepseek",
  "f-delight",
  "f-dev-ai",
  "f-devplatform",
  "f-discovery",
  "f-economy-plus",
  "f-feed-plus",
  "f-forecasting",
  "f-gifting",
  "f-ladder-homes",
  "f-messaging",
  "f-oncall",
  "f-ops",
  "f-party",
  "f-perf",
  "f-posts-plus",
  "f-profile-plus",
  "f-reading",
  "f-safety",
  "f-tools",
  "f-watch",
  "f-worlds",
  "feed",
  "feed-keyboard",
  "feedback-inbox",
  "find-in-book",
  "flag-targeting",
  "flashcard-types",
  "follow-list-privacy",
  "follows",
  "game-access",
  "game-assists",
  "game-updates",
  "game-webhooks",
  "games-hub",
  "gif-descriptions",
  "group-admins",
  "group-chat-admin",
  "group-invites",
  "group-mentions",
  "groups",
  "guide-history",
  "highlight-cards",
  "highlights",
  "jam-feedback",
  "jam-teams",
  "jam-themes",
  "key-restrictions",
  "keyboard",
  "ladder-insights",
  "ladder-offers",
  "leaderboard-privacy",
  "library",
  "lights-out-replays",
  "log-drafts",
  "match-results",
  "match-scheduling",
  "media-sweep",
  "medschools",
  "message-alt-text",
  "message-requests",
  "mod-notes",
  "more-game-assists",
  "music-history",
  "music-scales",
  "my-reports",
  "nav",
  "notice-language",
  "notifications-inbox",
  "occlusion-cards",
  "pages",
  "passage-links",
  "personal-bests",
  "poll-lifecycle",
  "profile-pins",
  "profile-preview",
  "psychology",
  "quiet-counts",
  "quiz-polls",
  "r-altair",
  "r-discord",
  "r-kowloon-knockout",
  "r-rmhbox",
  "r-rmhcode",
  "r-secret",
  "r-slice-it",
  "r-sohumbum",
  "r-sohumtracker",
  "r-strategies",
  "r-studio",
  "race-fixes",
  "ranked-polls",
  "read-aloud",
  "read-receipts",
  "reading-sync",
  "reading-time",
  "recurring-threads",
  "replay-library",
  "report-triage",
  "repost-mutes",
  "rideshare",
  "rmhbox-presets",
  "rmhbox-stats",
  "rmhstudy-focus",
  "rmhstudy-streaks",
  "rmhtube-playlists",
  "rmhtube-stats",
  "rmhtype-daily",
  "rmhtype-lessons",
  "rmhtype-progress",
  "rss-feeds",
  "saved-replies",
  "scheduled-gate",
  "search",
  "security-activity",
  "send-later",
  "settings-appearance",
  "settings-content",
  "settings-notifications",
  "shared",
  "site",
  "site-history",
  "slice-it-clipboard",
  "speedrun-queue",
  "spending-budget",
  "studio-editing",
  "studio-export",
  "studio-history",
  "studio-projects",
  "study-editor",
  "study-pace",
  "study-queue",
  "study-reminders",
  "study-stats",
  "study-tests",
  "subscriptions",
  "theme-studio",
  "timed-mutes",
  "toolbox",
  "tournament-checkin",
  "tournament-seeding",
  "type-ghost",
  "type-texts",
  "user-builds",
  "v",
  "watch-parties",
  "weak-keys",
  "webhook-activity",
] as const;
export type Namespace = (typeof NAMESPACES)[number];

/**
 * Namespaces fully translated for every locale. The remaining (game/experience)
 * namespaces are translated on demand; until then they are simply absent for a
 * newly-added locale and i18next falls back to English per key.
 */
export const CORE_NAMESPACES = [
  "common", "nav", "site", "pages", "shared", "feed",
  "builds", "library", "rideshare", "groups", "user-builds", "v",
] as const satisfies readonly Namespace[];

/** Native language name shown in the language switcher. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  zh: "中文",
  ar: "العربية",
  hi: "हिन्दी",
  es: "Español",
  fr: "Français",
  pt: "Português",
  ru: "Русский",
  ja: "日本語",
};

/** Human-readable target names passed to the AI translate helper. */
export const TRANSLATE_TARGETS: Record<Exclude<Locale, "en">, string> = {
  zh: "Chinese (Simplified)",
  ar: "Arabic",
  hi: "Hindi",
  es: "Spanish",
  fr: "French",
  pt: "Portuguese (Brazilian)",
  ru: "Russian",
  ja: "Japanese",
};

/**
 * Maps a UI locale to the exact language name accepted by the post/comment
 * translate API (ALLOWED_LANGS in app/routes/api/.../translate.ts). Used by the
 * "Translate" button so user-generated content is translated into the currently
 * selected site language.
 */
export const LOCALE_TO_LANGUAGE_NAME: Record<Locale, string> = {
  en: "English",
  zh: "Chinese",
  ar: "Arabic",
  hi: "Hindi",
  es: "Spanish",
  fr: "French",
  pt: "Portuguese",
  ru: "Russian",
  ja: "Japanese",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

export function buildInitOptions(
  locale: Locale,
  resources: Record<string, any>,
): InitOptions {
  return {
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...LOCALES],
    ns: [...NAMESPACES],
    defaultNS: "common",
    resources,
    interpolation: { escapeValue: false },
    returnNull: false,
    // Namespaces load on demand on the client (lib/i18n/instances.ts), so a
    // component can render before its namespace has arrived. Never suspend:
    // `t()` returns each call's defaultValue meanwhile (identical to the SSR
    // markup, so hydration matches) and useTranslation re-renders when the load
    // lands (`loaded` re-renders consumers
    // of a namespace that arrived without their own hook asking for it).
    react: { useSuspense: false, bindI18n: 'languageChanged loaded' },
  };
}
