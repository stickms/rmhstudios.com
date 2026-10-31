/**
 * The zod-free half of `./ice.ts`: the ICE server shape, the public STUN
 * defaults and the TURN check. Split out so the browser transport
 * (`./webrtc.ts`) and the lazy Balatro MP chunk can use them without
 * bundling zod (whose v4 classic build cannot be tree-shaken); `./ice.ts`
 * re-exports everything here next to its zod parsers.
 *
 * Environment-agnostic; no `@/` specifiers.
 */

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Google's and Cloudflare's public STUN servers. */
export const DEFAULT_ICE_SERVERS: readonly IceServerConfig[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
];

export function copyIceServers(list: readonly IceServerConfig[]): IceServerConfig[] {
  return list.map((s) => ({ ...s, urls: Array.isArray(s.urls) ? [...s.urls] : s.urls }));
}

/** Whether a list has a TURN server (the wait before the hub relay is longer then). */
export function hasTurn(servers: readonly IceServerConfig[]): boolean {
  return servers.some((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => /^turns?:/.test(u)));
}
