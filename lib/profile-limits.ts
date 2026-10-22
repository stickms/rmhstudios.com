/**
 * Profile-edit limits, with no dependencies. `lib/profile-schema.ts` (zod)
 * re-exports these for the API route; the profile editor imports them from
 * here so the profile page does not pull zod in for one number.
 */
export const MAX_PROFILE_LINKS = 5;
