/**
 * Where the sign-in page sends a learner back to: the RMH Music page they asked for, so a
 * signed-out visitor who opened a lesson link lands on that lesson after signing in.
 *
 * Only the app's own paths pass (the home, Practice and a lesson id of the catalogue's shape); anything
 * else — another site, a protocol-relative URL, a path outside the app — becomes the app's home.
 * The login page re-checks the value with `safeInternalPath`; this keeps the redirect itself
 * from ever naming anything but RMH Music.
 */

const HOME =
  '/rmhmusic';
const LESSON =
  /^\/rmhmusic\/lesson\/[a-z0-9-]{1,64}$/;
const PRACTICE =
  '/rmhmusic/practice';

export function rmhmusicReturnPath(
  input: unknown,
): string {
  if (
    typeof input !==
    'string'
  )
    return HOME;
  const path =
    input.length >
      1 &&
    input.endsWith(
      '/',
    )
      ? input.slice(
          0,
          -1,
        )
      : input;
  return LESSON.test(
    path,
  ) ||
    path ===
      PRACTICE
    ? path
    : HOME;
}
