/**
 * The paintings on the login page: one is picked at random each visit.
 *
 * The files are drawn by `scripts/gen-login-painting.ts` into `public/images/login/<scene>-<width>.webp`, three widths
 * per scene. `LOGIN_ART` here and the generator's scenes are held equal by
 * `lib/auth/__tests__/login-art.test.ts`, which checks the files on disk.
 *
 * Client-safe.
 */
export const LOGIN_ART = ['meadow', 'twilight', 'harvest', 'coast'] as const;

export type LoginArt = (typeof LOGIN_ART)[number];

/**
 * The widths the generator writes: 320 is the soft low-quality middle step of the blur-up, 800 and 1600 the real
 * picture (the page uses 800 below 640px and 1600 from there up).
 */
export const LOGIN_ART_WIDTHS = [320, 800, 1600] as const;

export type LoginArtWidth = (typeof LOGIN_ART_WIDTHS)[number];

/** localStorage key holding the picture shown on the last visit. */
export const LOGIN_ART_KEY = 'rmh-login-art';

export function isLoginArt(value: string | null | undefined): value is LoginArt {
  return (LOGIN_ART as readonly (string | null | undefined)[]).includes(value);
}

export function loginArtSrc(art: LoginArt, width: LoginArtWidth): string {
  return `/images/login/${art}-${width}.webp`;
}

/**
 * A random picture, never the same one twice in a row: `last` (what the previous visit showed) is left out when it is
 * one of ours. `random` returns [0, 1) like `Math.random`; it is a parameter so a test can steer it.
 */
export function pickLoginArt(last: string | null | undefined, random: () => number = Math.random): LoginArt {
  const pool = isLoginArt(last) ? LOGIN_ART.filter((art) => art !== last) : LOGIN_ART;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] as LoginArt;
}
