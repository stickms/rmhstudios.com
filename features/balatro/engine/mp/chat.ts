/**
 * Lobby and match chat (D-35, NET-11, HUD-11 transport).
 *
 * Chat travels over P2P: a member sends `chat {text}` to the host, the host
 * rate-limits it per sender, sanitises it and relays it to everyone else with
 * `f` stamped; every receiver rate-limits per original sender again, drops
 * muted senders and sanitises against its own font (identity.ts). Lines are
 * capped at 500 characters. Senders limit themselves too (5-line burst, then
 * 1 per second), so an honest client never sees its own line dropped.
 *
 * Mute is local (and survives in localStorage through the session runtime).
 * Browser-free.
 */

import { WIRE_LIMITS } from './wire-codec';
import { KeyedBuckets, RATE_LIMITS, TokenBucket } from './ratelimit';
import { sanitizeText } from './identity';

export interface ChatLine {
  from: string;
  name: string;
  text: string;
  kind: 'in' | 'own' | 'system';
}

export interface ChatOptions {
  now: () => number;
  /** The glyph bitmap of the current language (null = ASCII only). */
  glyphs: () => Uint8Array | null;
}

export class Chat {
  readonly muted = new Set<string>();
  enabled = true;
  private readonly own: TokenBucket;
  private readonly incoming: KeyedBuckets;
  private readonly relay: KeyedBuckets;

  constructor(private readonly opts: ChatOptions) {
    this.own = new TokenBucket(RATE_LIMITS.CHAT, opts.now);
    this.incoming = new KeyedBuckets(RATE_LIMITS.CHAT, opts.now);
    this.relay = new KeyedBuckets(RATE_LIMITS.CHAT, opts.now);
  }

  private clean(text: string): string {
    return sanitizeText(text, this.opts.glyphs(), WIRE_LIMITS.CHAT_MAX_CHARS);
  }

  /** Own line: the text to send (and show as `own`), or null when empty or over the sender limit. */
  prepareOwn(text: string): string | null {
    // Sanitised for transport (controls and whitespace runs); fonts are the receiver's business.
    const clean = sanitizeText(String(text ?? ''), 'all', WIRE_LIMITS.CHAT_MAX_CHARS);
    if (!clean) return null;
    if (!this.own.take()) return null;
    return clean;
  }

  /** Host: may this sender's line be relayed? (per-sender bucket) */
  allowRelay(from: string): boolean {
    return this.relay.take(from);
  }

  /** A received line → what to show, or null (muted, disabled, flooding, empty). */
  receive(from: string, name: string, text: string, system: boolean, selfId: string | null): ChatLine | null {
    if (!system) {
      if (from === selfId) return null; // our own line comes back only by mistake; it was shown on send
      if (!this.enabled || this.muted.has(from)) return null;
      if (!this.incoming.take(from)) return null;
    }
    const clean = this.clean(text);
    if (!clean) return null;
    return { from, name, text: clean, kind: system ? 'system' : 'in' };
  }

  /** The line shown for our own message. */
  ownLine(selfId: string, name: string, text: string): ChatLine {
    return { from: selfId, name, text: this.clean(text), kind: 'own' };
  }

  mute(id: string, on: boolean): void {
    if (on) this.muted.add(id);
    else this.muted.delete(id);
  }
}
