/**
 * The match's string table (the SDK's INetworkStringTable — modelprecache,
 * soundprecache, ParticleEffectNames): model paths, sound names, particle
 * systems, event type and key names. Each distinct string gets a small id
 * once per match; a client is sent each definition once, on the reliable
 * stream, before the first packet that uses it, and from then on the
 * snapshot and event codecs send only the id.
 *
 * Free text (chat, HUD parameters with spaces) is never interned — the event
 * codec writes it inline — so the table stays bounded by the content the map
 * and the arsenal actually use.
 */

/** Interning cap; past it, strings go inline. */
export const STRING_TABLE_MAX = 8192;
/** Longest string the table accepts. */
export const STRING_TABLE_MAX_LENGTH = 200;

/** Identifier-like strings (paths, script names, keys) are interned; anything else goes inline. */
const INTERNABLE = /^[\w.\-/\\:#@$+()[\]]{1,200}$/;

export function isInternable(s: string): boolean {
  return s.length <= STRING_TABLE_MAX_LENGTH && INTERNABLE.test(s);
}

/** The server's table: ids by string, assigned in first-use order. Id 0 is always ''. */
export class ServerStringTable {
  private readonly ids = new Map<string, number>([['', 0]]);
  readonly strings: string[] = [''];

  get size(): number {
    return this.strings.length;
  }

  /** The id for `s`, interning it if there is room; -1 when it must go inline. */
  idFor(s: string): number {
    const hit = this.ids.get(s);
    if (hit !== undefined) return hit;
    if (this.strings.length >= STRING_TABLE_MAX || s.length > STRING_TABLE_MAX_LENGTH) return -1;
    const id = this.strings.length;
    this.ids.set(s, id);
    this.strings.push(s);
    return id;
  }

  /** The id if already interned (no side effects), else -1. */
  peek(s: string): number {
    return this.ids.get(s) ?? -1;
  }
}

/** What one client has been sent (ids are global, so a bitset of known ids is enough). */
export class ClientStringKnowledge {
  private known = new Uint8Array(64);

  has(id: number): boolean {
    return (
      id === 0 || (id >> 3 < this.known.length && (this.known[id >> 3] & (1 << (id & 7))) !== 0)
    );
  }

  add(id: number): void {
    const byte = id >> 3;
    if (byte >= this.known.length) {
      const next = new Uint8Array(Math.max(byte + 1, this.known.length * 2));
      next.set(this.known);
      this.known = next;
    }
    this.known[byte] |= 1 << (id & 7);
  }
}

/** The client's mirror of the table. */
export class ClientStringTable {
  private readonly strings: string[] = [''];

  define(id: number, s: string): void {
    if (id <= 0 || id >= STRING_TABLE_MAX) return;
    this.strings[id] = s;
  }

  /** The string for `id`, or undefined when it was never defined (a protocol error). */
  get(id: number): string | undefined {
    return this.strings[id];
  }

  get size(): number {
    return this.strings.length;
  }
}
