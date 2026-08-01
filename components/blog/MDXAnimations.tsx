'use client';

import type { ComponentPropsWithoutRef, ComponentType } from 'react';
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DURATION, EASE } from '@/lib/motion';

/**
 * The markdown element map shared by the article surfaces (`/blog/$slug`,
 * `/news/$slug`, and the admin editor's live preview).
 *
 * This map is the ONLY styling channel for article prose. Those routes used to
 * wrap the markdown in `prose prose-invert prose-lg …`, but
 * `@tailwindcss/typography` is not a dependency of this repo — every `prose-*`
 * class is inert, so anything this map does not name renders unstyled. That is
 * why `a`, `code`, `strong`, `em`, `h4` and the table elements are here
 * alongside the block elements: without them, a link in a post paints the
 * browser's default blue on a themed surface.
 *
 * Every rule reads from the `--site-*` contract (design-language.md §0.1). The
 * old map hardcoded `text-white`, `bg-black/50`, `border-white/10` and the
 * `--neon-*` accents, so an article was legible on the dark default and washed
 * out on `.style-light` / `.style-high-contrast`. Duration and easing come from
 * `lib/motion.ts` (§0.5) rather than a local `0.5`.
 */
const animationProps = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-20px' },
  transition: { duration: DURATION.slow, ease: EASE.standard },
} as const;

type El<T extends keyof React.JSX.IntrinsicElements> = ComponentPropsWithoutRef<T>;

/**
 * Builds one reveal-on-scroll element for the map.
 *
 * The public prop type stays the **intrinsic** one, because that is what
 * `react-markdown` passes and what its `Components` type checks against.
 * `motion.*` redefines `onDrag*`/`onAnimationStart`/`style` with its own
 * signatures, so the two shapes are not mutually assignable — the tag is
 * resolved through `ElementType` here to keep that mismatch contained to this
 * one function instead of typing every exported component as `any`, which is
 * what this file did before.
 */
function animated<T extends keyof React.JSX.IntrinsicElements>(tag: T, base: string) {
  const MotionTag = (m as unknown as Record<string, ComponentType<Record<string, unknown>>>)[tag];
  function Animated(props: El<T>) {
    // `El<T>` for an unresolved `T` is a union of every intrinsic element's
    // props, so `className` cannot be read off it directly. The narrowing is
    // safe — every tag passed below is an HTML element — and it stays inside
    // the factory; the exported component keeps the exact `El<T>` signature
    // `react-markdown` type-checks against.
    const { className, ...rest } = props as ComponentPropsWithoutRef<'div'>;
    return <MotionTag {...animationProps} className={cn(base, className)} {...rest} />;
  }
  Animated.displayName = `Animated${tag}`;
  return Animated;
}

export const AnimatedH1 = animated(
  'h1',
  'mt-12 mb-6 font-display text-3xl font-black tracking-tight text-site-text',
);

export const AnimatedH2 = animated(
  'h2',
  'mt-10 mb-5 font-display text-2xl font-bold tracking-tight text-site-text',
);

export const AnimatedH3 = animated('h3', 'mt-8 mb-4 text-xl font-bold text-site-text');

export const AnimatedH4 = animated('h4', 'mt-6 mb-3 text-lg font-semibold text-site-text');

export const AnimatedP = animated('p', 'mb-6 text-lg leading-relaxed text-site-text-muted');

export const AnimatedUl = animated(
  'ul',
  'mb-6 ml-6 list-outside list-disc space-y-2 text-site-text-muted',
);

export const AnimatedOl = animated(
  'ol',
  'mb-6 ml-6 list-outside list-decimal space-y-2 text-site-text-muted',
);

export const AnimatedLi = animated('li', 'pl-2');

export const AnimatedBlockquote = animated(
  'blockquote',
  'my-8 rounded-r-site-sm border-l-4 border-site-accent bg-site-surface py-3 pr-4 pl-6 text-xl leading-relaxed font-light text-site-text italic',
);

export const AnimatedHr = animated('hr', 'my-12 border-site-border');

export const AnimatedPre = animated(
  'pre',
  'mb-6 overflow-x-auto rounded-site-sm border border-site-border bg-site-surface p-4 text-sm text-site-text',
);

/** A figure: the image plus its alt text as a visible caption. */
export const AnimatedImg = ({ className, alt, ...props }: El<'img'>) => (
  <m.figure
    {...animationProps}
    className="my-8 overflow-hidden rounded-site border border-site-border bg-site-surface shadow-site"
  >
    <img className={cn('h-auto w-full', className)} alt={alt} loading="lazy" {...props} />
    {alt && (
      <figcaption className="border-t border-site-border px-3 py-2 text-center font-mono text-xs text-site-text-dim">
        {alt}
      </figcaption>
    )}
  </m.figure>
);

/**
 * Inline code only. A fenced block arrives as `<pre><code class="language-x">`,
 * and `AnimatedPre` already paints that surface — a second chip inside it would
 * double the border and background, so the fenced case renders bare.
 */
export const MarkdownCode = ({ className, ...props }: El<'code'>) => {
  if (className?.includes('language-')) return <code className={className} {...props} />;
  return (
    <code
      className={cn(
        'rounded-site-sm border border-site-border bg-site-surface px-1.5 py-0.5 font-mono text-[0.9em] text-site-text',
        className,
      )}
      {...props}
    />
  );
};

export const MarkdownA = ({ className, href, children, ...props }: El<'a'>) => {
  // Anything that isn't same-document or site-relative leaves the site.
  const external = !!href && !/^(\/|#)/.test(href);
  return (
    <a
      href={href}
      className={cn(
        'font-medium text-site-accent underline underline-offset-4 transition-colors hover:text-site-accent-hover',
        className,
      )}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      {...props}
    >
      {children}
    </a>
  );
};

export const MarkdownStrong = ({ className, ...props }: El<'strong'>) => (
  <strong className={cn('font-bold text-site-text', className)} {...props} />
);

export const MarkdownEm = ({ className, ...props }: El<'em'>) => (
  <em className={cn('text-site-text italic', className)} {...props} />
);

/*
 * No `table`/`th`/`td` entries on purpose: `remark-gfm` is not installed, so
 * react-markdown parses CommonMark only and a GFM pipe table never becomes a
 * `<table>` — it arrives as a paragraph of literal `|` text. Handlers for those
 * tags would be unreachable code. Rendering tables in a post means adding the
 * `remark-gfm` plugin first (which would also switch on strikethrough,
 * autolinks and task lists).
 */

/**
 * The whole map, ready to hand to `<ReactMarkdown components={…}>`. Every
 * consumer imports this rather than re-assembling the object, so the published
 * article and the admin preview of it can never drift apart.
 */
export const markdownComponents = {
  h1: AnimatedH1,
  h2: AnimatedH2,
  h3: AnimatedH3,
  h4: AnimatedH4,
  p: AnimatedP,
  ul: AnimatedUl,
  ol: AnimatedOl,
  li: AnimatedLi,
  blockquote: AnimatedBlockquote,
  img: AnimatedImg,
  hr: AnimatedHr,
  pre: AnimatedPre,
  code: MarkdownCode,
  a: MarkdownA,
  strong: MarkdownStrong,
  em: MarkdownEm,
};
