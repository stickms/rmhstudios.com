/**
 * `VibePage.status` once site moderation removed the page. Every read that
 * serves a page's document treats it as gone; the viewer shows the
 * "removed by site moderation" notice instead (`app/routes/v.$slug.tsx`).
 * Client-safe so the viewer can compare against it.
 */
export const VIBE_REMOVED_STATUS = 'removed';
