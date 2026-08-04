/**
 * ICE server configuration — how two browsers find each other.
 *
 * ## STUN vs TURN, and why one of them is optional
 *
 * **STUN** tells a browser its own public address so the two peers can try to
 * connect directly. It carries no media, costs nothing, and public servers are
 * free to use. Direct connection succeeds for the large majority of pairs.
 *
 * **TURN** is the fallback when a direct path cannot be found — typically
 * symmetric NAT, corporate firewalls, or some mobile carriers. A TURN server
 * relays the actual audio, which means bandwidth, which means it has to be ours
 * and it has to be sized. Published figures for consumer WebRTC put the
 * TURN-required share somewhere around 8–15%; without it, that share of calls
 * simply fails to connect.
 *
 * ## The constraint this file exists to respect
 *
 * No new external API keys. That rules out Twilio NTS, Xirsys, Cloudflare
 * Calls and the rest of the hosted-TURN market, and it leaves exactly one good
 * option: **self-hosted `coturn`**, which is a single container alongside the
 * others in `docker-compose.yml` and authenticates with a shared secret we
 * generate ourselves rather than a vendor credential.
 *
 * So TURN is configured through env and is **optional**. With it, calls connect
 * for essentially everyone. Without it, most calls work and a minority fail
 * with an honest "couldn't connect" rather than a silent black hole — which is
 * why `hasTurn()` exists and why the UI can warn instead of pretending.
 *
 * ## Credentials are short-lived and derived, never static
 *
 * A static TURN password in a client bundle is an open relay for anyone who
 * views source. `coturn`'s `use-auth-secret` mode takes a username of
 * `<expiry-unix-ts>:<userId>` and a password of
 * `base64(hmac-sha1(secret, username))`, so the server mints a credential that
 * expires in minutes and is bound to one account. The secret never leaves the
 * server.
 */

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * Public STUN servers, used when none are configured.
 *
 * Several, from different operators, because a single STUN host being down
 * would otherwise take call setup with it. These see only a binding request —
 * no audio, no identity, no call metadata.
 */
const DEFAULT_STUN = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun.cloudflare.com:3478',
];

/** Is a relay configured? Drives the "calls may fail" hint in the UI. */
export function hasTurn(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.TURN_URL && env.TURN_SECRET);
}

/** How long a minted TURN credential stays valid. Long enough to place a call
 *  and reconnect once, short enough that a leaked one is worthless. */
export const TURN_CREDENTIAL_TTL_SEC = 600;

/**
 * Build the ICE list handed to `RTCPeerConnection`.
 *
 * `hmac` is injected so this stays a pure function and can be tested without
 * `node:crypto`; the server passes the real implementation.
 */
export function buildIceServers(args: {
  userId: string;
  now: number;
  env?: NodeJS.ProcessEnv;
  hmacSha1Base64?: (secret: string, message: string) => string;
}): IceServer[] {
  const env = args.env ?? process.env;
  const stun =
    env.STUN_URLS?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? DEFAULT_STUN;
  const servers: IceServer[] = [{ urls: stun }];

  const turnUrl = env.TURN_URL;
  const secret = env.TURN_SECRET;
  if (turnUrl && secret && args.hmacSha1Base64) {
    const expiry = Math.floor(args.now / 1000) + TURN_CREDENTIAL_TTL_SEC;
    // coturn's `use-auth-secret` (REST API) username format.
    const username = `${expiry}:${args.userId}`;
    servers.push({
      // Both UDP and the TCP/TLS fallback: port 443 TLS is what gets through
      // the corporate firewalls that are the reason TURN exists at all.
      urls: turnUrl
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      username,
      credential: args.hmacSha1Base64(secret, username),
    });
  }

  return servers;
}

/**
 * `RTCConfiguration` for a call.
 *
 * `iceCandidatePoolSize: 1` warms one candidate before the offer, shaving a
 * little off answer latency. `bundlePolicy: 'max-bundle'` keeps everything on
 * one transport, which is fewer ports to get through a firewall.
 */
export function rtcConfiguration(iceServers: IceServer[]): RTCConfiguration {
  return {
    iceServers: iceServers as RTCIceServer[],
    iceCandidatePoolSize: 1,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  };
}
