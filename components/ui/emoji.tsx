/**
 * `<Emoji>` — a Twemoji glyph React actually owns.
 *
 * The global `TwemojiProvider` swaps emoji text nodes for `<img>`s with a
 * MutationObserver, which is right for content React renders once (a post, a
 * display name) but hazardous inside a subtree React re-renders constantly:
 * rewriting a text node behind the reconciler's back is how you get
 * "The node to be removed is not a child of this node".
 *
 * This renders the same Twemoji asset as an ordinary element, so it survives
 * any number of re-renders. Mark the surrounding subtree `data-no-twemoji` to
 * keep the observer out of it and use this instead.
 */

/** Twemoji's SVG assets, same origin the provider's default base resolves to. */
const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@16.0.1/assets/svg/';

/**
 * Twemoji names its files by the emoji's codepoints, minus the variation
 * selector (FE0F) — except on keycap sequences, where it is significant.
 */
function toCodepoints(emoji: string): string {
  const points = [...emoji].map((c) => c.codePointAt(0)!);
  const keep = points.includes(0x20e3) ? points : points.filter((p) => p !== 0xfe0f);
  return keep.map((p) => p.toString(16)).join('-');
}

export interface EmojiProps {
  /** The emoji character, e.g. `"🛕"`. */
  children: string;
  /**
   * Accessible name. Omit for purely decorative emoji — they are then hidden
   * from assistive tech rather than read out as a filename.
   */
  label?: string;
  className?: string;
  /** Rendered size. Defaults to `1em`, so it tracks the surrounding text. */
  size?: string | number;
}

export function Emoji({ children, label, className, size = '1em' }: EmojiProps) {
  const code = toCodepoints(children);
  const dimension = typeof size === 'number' ? `${size}px` : size;

  return (
    <img
      src={`${TWEMOJI_BASE}${code}.svg`}
      // The native glyph is a better fallback than a broken-image icon when the
      // CDN is unreachable or the codepoint has no Twemoji asset.
      alt={label ?? children}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      draggable={false}
      loading="lazy"
      decoding="async"
      className={className}
      style={{
        display: 'inline-block',
        width: dimension,
        height: dimension,
        verticalAlign: '-0.125em',
      }}
    />
  );
}

/**
 * One emoji as Twemoji would draw it: a flag (two regional indicators), a keycap, or a
 * pictograph with its modifiers, variation selectors, tag sequence and ZWJ joins. Written with
 * Unicode property escapes rather than taken from `@twemoji/api`, whose regex lives in the
 * lazily loaded chunk the provider waits for.
 */
const EMOJI_SEQUENCE =
  /\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier}|[\u{E0020}-\u{E007F}]+)*(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*)*/gu;

/**
 * A lone character that is a pictograph only on request (the copyright sign, an arrow, a card
 * suit written without U+FE0F) stays text, as it does for the provider.
 */
function drawsAsEmoji(sequence: string): boolean {
  return [...sequence].length > 1 || /^\p{Emoji_Presentation}$/u.test(sequence);
}

/** `text` cut into plain runs and emoji, in order. Exported for the test. */
export function splitEmoji(text: string): { emoji: boolean; value: string }[] {
  const parts: { emoji: boolean; value: string }[] = [];
  let last = 0;
  for (const match of text.matchAll(EMOJI_SEQUENCE)) {
    const value = match[0];
    const at = match.index ?? 0;
    if (!drawsAsEmoji(value)) continue;
    if (at > last) parts.push({ emoji: false, value: text.slice(last, at) });
    parts.push({ emoji: true, value });
    last = at + value.length;
  }
  if (last < text.length) parts.push({ emoji: false, value: text.slice(last) });
  return parts;
}

/**
 * `<EmojiText>`: a string of user-authored text with its emoji drawn as Twemoji, by React.
 *
 * This is the renderer for short text that React re-renders or that must be right in the
 * first paint (a status, a display name, a bio line), and for anything inside a portal that
 * mounts before the provider has loaded its chunk. The text stays text: each emoji becomes an
 * `<Emoji>` image whose `alt` is the emoji, so copying, screen readers and a blocked CDN all
 * get the character back. It renders into a `data-no-twemoji` span, so the provider's
 * observer leaves the result alone, and it never uses `dangerouslySetInnerHTML`.
 */
export function EmojiText({ children, className }: { children: string; className?: string }) {
  const parts = splitEmoji(children);
  return (
    <span data-no-twemoji className={className}>
      {parts.map((part, i) =>
        part.emoji ? (
          // Keyed by position: the parts of one string have no other identity.
          <Emoji key={i} label={part.value}>
            {part.value}
          </Emoji>
        ) : (
          part.value
        ),
      )}
    </span>
  );
}
