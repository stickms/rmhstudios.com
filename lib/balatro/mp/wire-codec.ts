/**
 * The zod-free validators the MP chunk runs for everything that does not come
 * from Lua: P2P envelopes (§3.b, the same verdicts as wire.ts
 * `validateEnvelope`), the hub's S2C events (§3.a), and the domain types the
 * referee and lobby re-check (checkpoint, resolved ruleset, lobby options,
 * ICE servers).
 *
 * Why: zod v4 classic cannot be tree-shaken; importing wire.ts / types.ts /
 * events.ts at runtime adds ~80 KB gzip to a chunk budgeted at 70 KB
 * (PLAN §6.4). The zod schemas stay the single source:
 * scripts/balatro/gen-lua-protocol.ts lowers them into wire-schema.gen.ts,
 * walked here with bridge-codec.ts's descriptor walker, and
 * __tests__/wire-codec.test.ts holds both validators to the same verdicts on
 * the contract fixtures and on mutations of them.
 *
 * Nothing here may import wire.ts, types.ts or events.ts at runtime (types only).
 */

import { checkDesc } from './bridge-codec';
import { D, ENVELOPE, LOCAL_ONLY_KINDS, PEER_KINDS, S2C, TYPES, WIRE, WIRE_LIMITS, WIRE_META, WIRE_PROTOCOL } from './bridge-schema.gen';
import type { DecodeResult, Envelope, PeerKind, WireKind } from './wire';
import type { LobbyOptionKey, LobbyOptions, RefCheckpoint, ResolvedRuleset } from './types';
import type { BalatroS2CEvent, BalatroS2CPayload } from '../net/events';
import { copyIceServers, DEFAULT_ICE_SERVERS, type IceServerConfig } from '../../shared/p2p/ice-core';
import { BALATRO_RELAY_LIMITS } from '../net/limits';

export { WIRE_LIMITS, WIRE_META, WIRE_PROTOCOL, PEER_KINDS };

const LOCAL_ONLY: ReadonlySet<string> = new Set(LOCAL_ONLY_KINDS);
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export function isHostOnly(kind: WireKind): boolean {
  return WIRE_META[kind].hostOnly;
}

export function isLocalOnly(kind: string): boolean {
  return LOCAL_ONLY.has(kind);
}

export const PEER_KIND_SET: ReadonlySet<string> = new Set(PEER_KINDS);

export function isPeerKind(kind: string): kind is PeerKind {
  return PEER_KIND_SET.has(kind);
}

/** An already-parsed value → validated envelope (wire.ts `validateEnvelope`). Never throws. */
export function validateEnvelope(raw: unknown): DecodeResult {
  const env = checkDesc(D, ENVELOPE, raw, 'envelope');
  if (!env.ok) return { ok: false, error: 'envelope', detail: env.detail };
  const e = env.v as { k: string; d: unknown };
  if (!own(WIRE, e.k)) return { ok: false, error: 'envelope', detail: `unknown kind ${e.k}` };
  const d = checkDesc(D, WIRE[e.k] as number, e.d, e.k);
  if (!d.ok) return { ok: false, error: 'data', kind: e.k, detail: d.detail };
  return { ok: true, env: { ...(env.v as object), d: d.v } as Envelope };
}

/** JSON text → validated envelope (wire.ts `decodeEnvelope`). Never throws. */
export function decodeEnvelope(text: string): DecodeResult {
  if (text.length > WIRE_LIMITS.MAX_MESSAGE_BYTES) return { ok: false, error: 'too-large' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'json' };
  }
  return validateEnvelope(raw);
}

/** A hub S2C payload, validated (events.ts `BALATRO_S2C`); null when it does not parse. */
export function parseS2C<K extends BalatroS2CEvent>(event: K, raw: unknown): BalatroS2CPayload<K> | null {
  if (event === 'balatro:p2p:relay') {
    const bytes = raw instanceof Uint8Array ? raw : raw instanceof ArrayBuffer ? new Uint8Array(raw) : null;
    if (!bytes || bytes.byteLength > BALATRO_RELAY_LIMITS.MAX_PACKET_BYTES) return null;
    return bytes as BalatroS2CPayload<K>;
  }
  if (!own(S2C, event)) return null;
  const r = checkDesc(D, S2C[event] as number, raw, event);
  return r.ok ? (r.v as BalatroS2CPayload<K>) : null;
}

/** The S2C events this codec knows (every one the runtime listens to). */
export const S2C_EVENTS: readonly BalatroS2CEvent[] = [...Object.keys(S2C), 'balatro:p2p:relay'] as BalatroS2CEvent[];

/** An untrusted referee checkpoint (a peer's `checkpoint`/`welcome`), or null. */
export function parseRefCheckpoint(raw: unknown): RefCheckpoint | null {
  const r = checkDesc(D, TYPES.refCheckpoint, raw, 'checkpoint');
  return r.ok ? (r.v as RefCheckpoint) : null;
}

/** Same, throwing on a programming error (the referee's own output). */
export function requireRefCheckpoint(raw: unknown): RefCheckpoint {
  const r = checkDesc(D, TYPES.refCheckpoint, raw, 'checkpoint');
  if (!r.ok) throw new Error(`invalid checkpoint: ${r.detail}`);
  return r.v as RefCheckpoint;
}

/** A resolved ruleset bundle; throws on a programming error (resolve.ts output). */
export function requireResolvedRuleset(raw: unknown): ResolvedRuleset {
  const r = checkDesc(D, TYPES.resolvedRuleset, raw, 'resolved');
  if (!r.ok) throw new Error(`invalid resolved ruleset: ${r.detail}`);
  return r.v as ResolvedRuleset;
}

type ObjectDesc = Extract<(typeof D)[number], { T: 'object' }>;

/** One lobby option against its own field schema (sanitizeOptions' field-wise check). */
export function checkLobbyOption<K extends LobbyOptionKey>(
  key: K,
  value: unknown,
): { ok: true; v: LobbyOptions[K] } | { ok: false } {
  const obj = D[TYPES.lobbyOptions] as ObjectDesc;
  const idx = own(obj.p, key) ? obj.p[key] : undefined;
  if (idx === undefined || value === undefined) return { ok: false };
  const r = checkDesc(D, idx, value, key);
  return r.ok ? { ok: true, v: r.v as LobbyOptions[K] } : { ok: false };
}

/** The lobby option keys, in schema order. */
export const LOBBY_OPTION_KEYS = Object.keys((D[TYPES.lobbyOptions] as ObjectDesc).p) as LobbyOptionKey[];

/** ICE servers as the hub hands them out (shared/p2p `zIceServers`), or null. */
export function parseIceServers(raw: unknown): IceServerConfig[] | null {
  const r = checkDesc(D, TYPES.iceServers, raw, 'ice');
  return r.ok ? (r.v as IceServerConfig[]) : null;
}

/** shared/p2p `resolveIceServers` without zod: the hub's list when valid and non-empty, else the public STUN defaults. */
export function resolveHubIce(raw: unknown): IceServerConfig[] {
  const list = raw === undefined ? null : parseIceServers(raw);
  return list && list.length > 0 ? list : copyIceServers(DEFAULT_ICE_SERVERS);
}
