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
'use client';

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
