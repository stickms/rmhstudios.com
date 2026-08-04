/**
 * Discord Activity DETECTION — deliberately kept in its own module, with no
 * import of `@discord/embedded-app-sdk`.
 *
 * `isDiscordActivity()` is a query-param check and needs none of the SDK. But it
 * used to live in `lib/discord-sdk.ts` next to `useDiscordSdk`, which imports the
 * SDK at module scope. `__root.tsx` and `lib/sw-register.ts` (also reached from
 * `__root.tsx`) both call it on every page, so that one import put the whole SDK
 * into the shared client entry: **135.4 KB, 30% of the 476 KB entry chunk**,
 * downloaded and parsed by every visitor to every route on the site — for a
 * feature only `/discord/*` uses.
 *
 * Rolldown cannot tree-shake it away: the SDK's module scope has side effects, so
 * importing any binding from `lib/discord-sdk.ts` retains all of it.
 *
 * So: anything on a shared path imports the detector from HERE. `lib/discord-sdk`
 * re-exports it for the `/discord/*` call sites, which have the SDK loaded anyway.
 */

/**
 * True when the app is running inside a Discord Activity iframe.
 *
 * Discord loads Activities with `frame_id` + `instance_id` in the query string;
 * their presence is the documented signal. Always false during SSR.
 */
export function isDiscordActivity(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('frame_id') && params.has('instance_id');
}
