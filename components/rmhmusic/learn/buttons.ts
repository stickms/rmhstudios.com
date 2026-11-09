/**
 * The two button looks the learn screens share, in the app tier's `--app-*`
 * palette (the same classes LearnHome's Retry and PathUnit's Start use), so the
 * setup dialog, calibration and lessons do not each restate them.
 */

/** The view's one filled action. */
export const PRIMARY_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-(--app-radius-sm) bg-(--app-accent) px-5 text-sm font-semibold text-(--app-accent-fg) transition-colors hover:bg-(--app-accent-hover) disabled:opacity-50';

/** Everything else: an outlined action. */
export const SECONDARY_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-(--app-radius-sm) border border-(--app-border) px-4 text-sm font-medium text-(--app-text) transition-colors hover:bg-(--app-surface-hover) disabled:opacity-50';

/**
 * A quiet action written into the page: accent ink, underlined like a pencilled correction, no
 * box. Still a 44px-tall target.
 */
export const TEXT_BUTTON =
  'inline-flex min-h-11 items-center gap-2 rounded-(--app-radius-sm) text-sm font-medium text-(--app-accent) underline decoration-1 underline-offset-4 transition-colors hover:text-(--app-accent-hover) disabled:opacity-50';
